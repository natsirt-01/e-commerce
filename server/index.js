import 'dotenv/config'
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import nodemailer from 'nodemailer'
import { isPromotionActive } from './promotion-utils.js'
import { isStrongPassword } from './password-utils.js'
import { readCollection, writeCollection } from './storage.js'

const app = express()
const port = Number(process.env.PORT || 4000)
const verificationCodes = new Map()
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD || ''
const jwtSecret = process.env.JWT_SECRET || ''
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
const validGoogleClientId = googleClientId.endsWith('.apps.googleusercontent.com')
const googleClient = new OAuth2Client(validGoogleClientId ? googleClientId : undefined)
const terminalStatuses = new Set(['Delivered', 'Cancelled'])
const deliveryRegionCode = '030000000'
const deliveryRegionName = 'Central Luzon (Region III)'
const deliveryProvinces = [
  { code: '030800000', name: 'Bataan' },
  { code: '031400000', name: 'Bulacan' },
  { code: '034900000', name: 'Nueva Ecija' },
  { code: '035400000', name: 'Pampanga' },
  { code: '036900000', name: 'Tarlac' },
  { code: '037100000', name: 'Zambales' },
  { code: '037700000', name: 'Aurora' },
]
const defaultDeliveryEstimates = {
  provinceDays: {
    '030800000': 3,
    '031400000': 3,
    '034900000': 3,
    '035400000': 2,
    '036900000': 2,
    '037100000': 3,
    '037700000': 4,
  },
  cityDays: {},
  provinceFees: {
    '030800000': 90,
    '031400000': 80,
    '034900000': 100,
    '035400000': 50,
    '036900000': 70,
    '037100000': 110,
    '037700000': 150,
  },
  cityFees: {},
}
const defaultPaymentFeeSettings = { rates: {} }
const psgcCache = new Map()
const psgcBaseUrl = 'https://psgc.gitlab.io/api'
const psgcCacheDuration = 6 * 60 * 60 * 1000
let checkoutQueue = Promise.resolve()

app.use(express.json({ limit: '1mb' }))

async function getPsgcList(path) {
  const cached = psgcCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const response = await fetch(`${psgcBaseUrl}${path}`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`The Philippine geographic address service returned HTTP ${response.status}.`)
  const value = await response.json()
  if (!Array.isArray(value)) throw new Error('The Philippine geographic address service returned invalid data.')
  psgcCache.set(path, { value, expiresAt: Date.now() + psgcCacheDuration })
  return value
}

async function getCentralLuzonCities() {
  return getPsgcList(`/regions/${deliveryRegionCode}/cities-municipalities/`)
}

async function getDeliveryZipCodes(provinceCode, cityCode, barangayCode = '') {
  const province = deliveryProvinces.find((entry) => entry.code === provinceCode)
  if (!province) throw new Error('Choose a province in Central Luzon.')
  const [cities, postalData] = await Promise.all([
    getPsgcList(`/provinces/${provinceCode}/cities-municipalities/`),
    readCollection('central-luzon-postal-codes'),
  ])
  const city = cities.find((entry) => entry.code === cityCode)
  if (!city) throw new Error('Choose a city or municipality in the selected province.')

  let barangayName = ''
  if (barangayCode) {
    const barangays = await getPsgcList(`/cities-municipalities/${cityCode}/barangays/`)
    const barangay = barangays.find((entry) => entry.code === barangayCode)
    if (!barangay) throw new Error('Choose a barangay in the selected city or municipality.')
    barangayName = barangay.name
  }

  const normalize = (value) => String(value).normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/\b(city of|city|science)\b/g, ' ')
    .replace(/\bsta\b/g, 'santa')
    .replace(/\bsto\b/g, 'santo')
    .replace(/\bgen\b/g, 'general')
    .replace(/[^a-z0-9]+/g, ' ').trim()
  const cityName = normalize(city.name)
  const provinceName = normalize(province.name)
  const provinceEntries = (postalData.records || []).filter((entry) => normalize(entry.province) === provinceName)
  const entries = provinceEntries.filter((entry) => {
    const place = normalize(entry.location)
    return place === cityName || place.startsWith(`${cityName} `) || place.endsWith(` ${cityName}`) || cityName.endsWith(` ${place}`)
  })
  if (barangayName) {
    const barangay = normalize(barangayName)
    const matches = provinceEntries.filter((entry) => entry.location.split(',').some((part) => normalize(part) === barangay))
    const cityMatches = matches.filter((entry) => {
      const locationParts = entry.location.split(',').map(normalize)
      return locationParts.some((part) => part === cityName)
    })
    if (cityMatches.length) return [...new Set(cityMatches.map((entry) => entry.zipCode))].sort()
  }
  return [...new Set(entries.map((entry) => entry.zipCode))].sort()
}

async function getDeliverySettings() {
  const saved = await readCollection('delivery-estimates', defaultDeliveryEstimates)
  return {
    provinceDays: { ...defaultDeliveryEstimates.provinceDays, ...saved.provinceDays },
    cityDays: saved.cityDays || {},
    provinceFees: { ...defaultDeliveryEstimates.provinceFees, ...(saved.provinceFees || {}) },
    cityFees: saved.cityFees || {},
  }
}

async function getDeliveryDays(provinceCode, cityCode) {
  const settings = await getDeliverySettings()
  return settings.cityDays[cityCode] ?? settings.provinceDays[provinceCode]
}

async function getShippingFee(provinceCode, cityCode) {
  const settings = await getDeliverySettings()
  return settings.cityFees[cityCode] ?? settings.provinceFees[provinceCode]
}

function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function withCheckoutLock(task) {
  const current = checkoutQueue.then(task, task)
  checkoutQueue = current.then(() => undefined, () => undefined)
  return current
}

function checkoutError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

async function resolveDeliveryAddress(body) {
  const {
    deliveryRegion, deliveryProvinceCode, deliveryCityCode, deliveryBarangayCode, deliveryZipCode,
    deliveryStreetAddress, deliveryAdditionalDetails,
  } = body
  if (deliveryRegion !== deliveryRegionName || typeof deliveryStreetAddress !== 'string' || !deliveryStreetAddress.trim() || deliveryStreetAddress.length > 300) {
    throw checkoutError('Enter the required Central Luzon delivery address.')
  }
  const additionalDetails = deliveryAdditionalDetails === undefined ? '' : deliveryAdditionalDetails
  if (typeof additionalDetails !== 'string' || additionalDetails.length > 300) {
    throw checkoutError('Additional address details must be 300 characters or fewer.')
  }
  const province = deliveryProvinces.find((entry) => entry.code === deliveryProvinceCode)
  if (!province || typeof deliveryCityCode !== 'string' || typeof deliveryBarangayCode !== 'string') {
    throw checkoutError('Choose a valid Central Luzon province, city or municipality, and barangay.')
  }

  let cities
  let barangays
  try {
    [cities, barangays] = await Promise.all([
      getPsgcList(`/provinces/${province.code}/cities-municipalities/`),
      getPsgcList(`/cities-municipalities/${deliveryCityCode}/barangays/`),
    ])
  } catch (error) {
    throw checkoutError(error instanceof Error ? error.message : 'Unable to verify the delivery location.', 502)
  }
  const city = cities.find((entry) => entry.code === deliveryCityCode)
  const barangay = barangays.find((entry) => entry.code === deliveryBarangayCode)
  if (!city || !barangay || barangay.cityCode !== city.code && barangay.municipalityCode !== city.code) {
    throw checkoutError('The selected barangay does not belong to the selected city or municipality.')
  }
  if (typeof deliveryZipCode !== 'string' || !/^\d{4}$/.test(deliveryZipCode)) {
    throw checkoutError('Enter a valid four-digit ZIP code.')
  }
  let validZipCodes
  try {
    validZipCodes = await getDeliveryZipCodes(province.code, city.code, barangay.code)
  } catch (error) {
    throw checkoutError(error instanceof Error ? error.message : 'Unable to verify the ZIP code for this location.', 502)
  }
  if (validZipCodes.length && !validZipCodes.includes(deliveryZipCode)) {
    throw checkoutError('Choose a ZIP code listed for the selected barangay.')
  }
  return {
    deliveryRegion: deliveryRegionName,
    deliveryProvinceCode: province.code,
    deliveryProvince: province.name,
    deliveryCityCode: city.code,
    deliveryCity: city.name,
    deliveryBarangayCode: barangay.code,
    deliveryBarangay: barangay.name,
    deliveryZipCode,
    deliveryStreetAddress: deliveryStreetAddress.trim(),
    deliveryAdditionalDetails: additionalDetails.trim(),
  }
}

function resolveOrderItems(rawItems, products) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 30) throw checkoutError('Select at least one product to purchase.')
  const ids = new Set()
  const resolvedItems = []
  for (const item of rawItems) {
    if (!item || typeof item.productId !== 'string' || ids.has(item.productId)) throw checkoutError('Each selected product must appear only once.')
    ids.add(item.productId)
    const product = products.find((entry) => entry.id === item.productId)
    const quantity = Number(item.quantity)
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > product.stock) {
      throw checkoutError('An item is out of stock. Refresh your cart and try again.')
    }
    resolvedItems.push({
      productId: product.id,
      name: product.name,
      description: product.description || '',
      category: product.category || 'Grill equipment',
      quantity,
      price: Number(product.price),
    })
  }
  return resolvedItems
}

async function getCheckoutQuote(user, body) {
  const deliveryAddress = await resolveDeliveryAddress(body)
  const products = await readCollection('products')
  const items = resolveOrderItems(body.items, products)
  const orders = await readCollection('orders')
  const userOrders = orders.filter((order) => order.userId === user.id || order.email === user.email)
  const welcomeUsed = userOrders.some((order) => order.welcomeDiscountUsed === true || Number(order.welcomeDiscountAmount) > 0)
  const welcomeEligible = user.role === 'customer' && user.welcomeDiscountEligible === true && !welcomeUsed
  const applyWelcomeDiscount = body.applyWelcomeDiscount !== false && welcomeEligible
  const promotionId = typeof body.promotionId === 'string' ? body.promotionId : ''
  let promotion = null
  let promotionDiscount = 0
  const promotionSettings = await readCollection('promotions')
  if (promotionId) {
    promotion = promotionSettings.find((entry) => entry.id === promotionId)
    if (!promotion || !isPromotionActive(promotion)) throw checkoutError('This promotion is no longer active.')
    if (userOrders.some((order) => order.promotionId === promotion.id)) throw checkoutError('This account has already used this promotion.')
    if (!Number.isFinite(promotion.discountPercent) || promotion.discountPercent < 0 || promotion.discountPercent > 100) {
      throw checkoutError('This promotion has invalid discount settings.')
    }
    promotionDiscount = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * promotion.discountPercent / 100)
  }

  if (promotion && applyWelcomeDiscount && promotion.allowWelcomeStacking !== true) {
    throw checkoutError('This promotion cannot be combined with the welcome discount. Remove one discount to continue.')
  }
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0))
  const welcomeDiscount = applyWelcomeDiscount ? roundMoney(subtotal * 0.1) : 0
  const originalShippingFee = await getShippingFee(deliveryAddress.deliveryProvinceCode, deliveryAddress.deliveryCityCode)
  const freeShippingDiscount = promotion?.freeShipping === true ? originalShippingFee : 0
  const shippingFee = Math.max(0, originalShippingFee - freeShippingDiscount)
  const discountAmount = roundMoney(welcomeDiscount + promotionDiscount)
  const total = roundMoney(Math.max(0, subtotal - discountAmount + shippingFee))
  const deliveryDays = await getDeliveryDays(deliveryAddress.deliveryProvinceCode, deliveryAddress.deliveryCityCode)

  return {
    items: items.map(({ productId, name, quantity, price }) => ({ productId, name, quantity, price })),
    deliveryAddress,
    productSubtotal: subtotal,
    shippingFee,
    originalShippingFee,
    welcomeDiscountAmount: welcomeDiscount,
    welcomeDiscountEligible: welcomeEligible,
    welcomeDiscountApplied: welcomeDiscount > 0,
    promotionDiscountAmount: promotionDiscount,
    promotionId: promotion?.id || '',
    promotionName: promotion?.name || '',
    freeShippingDiscount,
    estimatedDeliveryDays: deliveryDays,
    total,
  }
}

function calculateEstimatedDeliveryDate(days) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const date = new Date(Date.UTC(Number(dateValues.year), Number(dateValues.month) - 1, Number(dateValues.day), 12))
  let remaining = days
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1
  }
  return date.toISOString().slice(0, 10)
}

function normalizedOrderStatus(status) {
  if (status === 'Pending') return 'Order Placed'
  if (status === 'On delivery') return 'Out for Delivery'
  return status
}

function orderForResponse(order) {
  const status = normalizedOrderStatus(order.deliveryStatus || order.status)
  return { ...order, status, deliveryStatus: status }
}

function makePassword(password) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

function verifyPassword(password, stored) {
  if (!stored?.salt || !stored?.hash) return false
  const expected = Buffer.from(stored.hash, 'hex')
  const actual = scryptSync(password, stored.salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role, ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}) }
}

async function ensureAdmin() {
  if (!jwtSecret) throw new Error('JWT authentication is not configured. Set JWT_SECRET in .env.')
  if (!adminEmail.includes('@') || !adminPassword) {
    throw new Error('Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.')
  }
  const users = await readCollection('users')
  let admin = users.find((user) => String(user.email).toLowerCase() === adminEmail)
  if (!admin) {
    admin = users.find((user) => user.id === 'admin-001' && user.role === 'admin')
    if (admin) admin.email = adminEmail
  }
  if (!admin) {
    admin = { id: 'admin-001', name: 'Store Admin', email: adminEmail, phone: '', address: '', role: 'admin' }
    users.push(admin)
  }
  admin.name = 'Store Admin'
  admin.role = 'admin'
  admin.password = makePassword(adminPassword)
  for (const user of users) {
    if (user !== admin && user.id === 'admin-001' && user.role === 'admin') user.role = 'customer'
  }
  await writeCollection('users', users)
}

async function auth(req, _res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  const claims = token ? verifySessionToken(token) : undefined
  if (claims) {
    const users = await readCollection('users')
    const user = users.find((entry) => entry.id === claims.sub)
    if (user?.active !== false) req.user = user
  }
  next()
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access is required.' })
  next()
}

function startSession(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: user.id, iat: now, exp: now + 7 * 24 * 60 * 60 })).toString('base64url')
  const unsignedToken = `${header}.${payload}`
  const signature = createHmac('sha256', jwtSecret).update(unsignedToken).digest('base64url')
  const token = `${unsignedToken}.${signature}`
  return { token, user: publicUser(user) }
}

function verifySessionToken(token) {
  const [header, payload, signature, ...extra] = token.split('.')
  if (!header || !payload || !signature || extra.length) return undefined

  const unsignedToken = `${header}.${payload}`
  const expected = createHmac('sha256', jwtSecret).update(unsignedToken).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof claims.sub !== 'string' || !Number.isInteger(claims.exp) || claims.exp <= Date.now() / 1000) return undefined
    return claims
  } catch {
    return undefined
  }
}

function consumeVerificationCode(key, submittedCode) {
  const record = verificationCodes.get(key)
  if (!record || record.expiresAt < Date.now() || record.attempts >= 5) {
    verificationCodes.delete(key)
    return false
  }
  record.attempts += 1
  if (record.code !== String(submittedCode || '')) return false
  verificationCodes.delete(key)
  return true
}

app.use('/api', auth)

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'json' }))

app.get('/api/products', async (_req, res) => {
  const products = await readCollection('products')
  res.json(products.map((product) => ({ ...product, sellerId: 'admin-001', sellerName: 'The Grill Phrenz J' })))
})

app.get('/api/locations/provinces', (_req, res) => res.json(deliveryProvinces))

app.get('/api/locations/provinces/:provinceCode/cities', async (req, res) => {
  if (!deliveryProvinces.some((entry) => entry.code === req.params.provinceCode)) return res.status(404).json({ error: 'Province not found in Central Luzon.' })
  try {
    const cities = await getPsgcList(`/provinces/${req.params.provinceCode}/cities-municipalities/`)
    res.json(cities.map(({ code, name }) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)))
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to load cities and municipalities.' })
  }
})

app.get('/api/locations/cities/:cityCode/barangays', async (req, res) => {
  try {
    const cities = await getCentralLuzonCities()
    if (!cities.some((entry) => entry.code === req.params.cityCode)) return res.status(404).json({ error: 'City or municipality not found in Central Luzon.' })
    const barangays = await getPsgcList(`/cities-municipalities/${req.params.cityCode}/barangays/`)
    res.json(barangays.map(({ code, name }) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)))
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to load barangays.' })
  }
})

app.get('/api/locations/provinces/:provinceCode/cities/:cityCode/zip-codes', async (req, res) => {
  try {
    const codes = await getDeliveryZipCodes(req.params.provinceCode, req.params.cityCode, String(req.query.barangayCode || ''))
    res.json(codes)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to find ZIP codes for this location.' })
  }
})

app.get('/api/locations/estimate', async (req, res) => {
  const { provinceCode, cityCode } = req.query
  if (typeof provinceCode !== 'string' || !deliveryProvinces.some((entry) => entry.code === provinceCode) || typeof cityCode !== 'string') {
    return res.status(400).json({ error: 'Choose a province and city or municipality in Central Luzon.' })
  }
  try {
    const cities = await getPsgcList(`/provinces/${provinceCode}/cities-municipalities/`)
    if (!cities.some((entry) => entry.code === cityCode)) return res.status(400).json({ error: 'City or municipality does not belong to the selected province.' })
    res.json({ days: await getDeliveryDays(provinceCode, cityCode) })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to calculate the delivery estimate.' })
  }
})

app.post('/api/checkout/quote', requireUser, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot check out.' })
  try {
    const quote = await getCheckoutQuote(req.user, req.body || {})
    res.json({
      items: quote.items,
      productSubtotal: quote.productSubtotal,
      shippingFee: quote.shippingFee,
      originalShippingFee: quote.originalShippingFee,
      welcomeDiscountAmount: quote.welcomeDiscountAmount,
      welcomeDiscountEligible: quote.welcomeDiscountEligible,
      welcomeDiscountApplied: quote.welcomeDiscountApplied,
      promotionDiscountAmount: quote.promotionDiscountAmount,
      promotionId: quote.promotionId,
      promotionName: quote.promotionName,
      freeShippingDiscount: quote.freeShippingDiscount,
      estimatedDeliveryDays: quote.estimatedDeliveryDays,
      total: quote.total,
    })
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error instanceof Error ? error.message : 'Unable to calculate the checkout total.' })
  }
})

app.get('/api/admin/messages', requireUser, requireAdmin, async (_req, res) => {
  const messages = await readCollection('messages')
  res.json(messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
})

app.get('/api/chat', requireUser, async (req, res) => {
  const chats = await readCollection('chats')
  const thread = chats.find((entry) => entry.customerId === req.user.id)
  res.json(thread || {
    id: `chat-${req.user.id}`,
    customerId: req.user.id,
    customerName: req.user.name,
    customerEmail: req.user.email,
    messages: [],
    updatedAt: new Date(0).toISOString(),
  })
})

app.post('/api/chat/messages', requireUser, async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Only customer accounts can start a store chat.' })
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (message.length < 1 || message.length > 2000) return res.status(400).json({ error: 'Enter a message between 1 and 2,000 characters.' })
  const chats = await readCollection('chats')
  let thread = chats.find((entry) => entry.customerId === req.user.id)
  if (!thread) {
    thread = { id: `chat-${req.user.id}`, customerId: req.user.id, customerName: req.user.name, customerEmail: req.user.email, messages: [] }
    chats.push(thread)
  }
  const createdAt = new Date().toISOString()
  thread.customerName = req.user.name
  thread.customerEmail = req.user.email
  thread.messages.push({ id: randomBytes(12).toString('hex'), senderId: req.user.id, senderName: req.user.name, senderRole: 'customer', message, createdAt })
  thread.updatedAt = createdAt
  await writeCollection('chats', chats)
  res.status(201).json(thread)
})

app.get('/api/admin/chats', requireUser, requireAdmin, async (_req, res) => {
  const chats = await readCollection('chats')
  res.json(chats.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
})

app.post('/api/admin/chats/:id/messages', requireUser, requireAdmin, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (message.length < 1 || message.length > 2000) return res.status(400).json({ error: 'Enter a message between 1 and 2,000 characters.' })
  const chats = await readCollection('chats')
  const thread = chats.find((entry) => entry.id === req.params.id)
  if (!thread) return res.status(404).json({ error: 'Chat thread not found.' })
  const createdAt = new Date().toISOString()
  thread.messages.push({ id: randomBytes(12).toString('hex'), senderId: req.user.id, senderName: req.user.name, senderRole: 'admin', message, createdAt })
  thread.updatedAt = createdAt
  await writeCollection('chats', chats)
  res.status(201).json(thread)
})

app.get('/api/admin/delivery-estimates', requireUser, requireAdmin, async (_req, res) => {
  res.json(await getDeliverySettings())
})

app.put('/api/admin/delivery-estimates', requireUser, requireAdmin, async (req, res) => {
  const provinceDays = req.body?.provinceDays
  const cityDays = req.body?.cityDays
  const provinceFees = req.body?.provinceFees
  const cityFees = req.body?.cityFees
  if (![provinceDays, cityDays, provinceFees, cityFees].every((value) => value && typeof value === 'object' && !Array.isArray(value))) {
    return res.status(400).json({ error: 'Provide province and city delivery estimates and shipping fees.' })
  }
  const nextProvinceDays = {}
  const nextProvinceFees = {}
  for (const province of deliveryProvinces) {
    const days = provinceDays[province.code]
    const fee = provinceFees[province.code]
    if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ error: `Delivery days for ${province.name} must be between 1 and 60.` })
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return res.status(400).json({ error: `Shipping fee for ${province.name} must be between ₱0 and ₱100,000.` })
    nextProvinceDays[province.code] = days
    nextProvinceFees[province.code] = roundMoney(fee)
  }
  const cities = await getCentralLuzonCities()
  const nextCityDays = {}
  const nextCityFees = {}
  for (const [cityCode, days] of Object.entries(cityDays)) {
    if (!cities.some((city) => city.code === cityCode)) return res.status(400).json({ error: 'A city-specific estimate references a location outside Central Luzon.' })
    if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ error: 'City delivery estimates must be between 1 and 60 days.' })
    nextCityDays[cityCode] = days
  }
  for (const [cityCode, fee] of Object.entries(cityFees)) {
    if (!cities.some((city) => city.code === cityCode)) return res.status(400).json({ error: 'A city-specific shipping fee references a location outside Central Luzon.' })
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return res.status(400).json({ error: 'City shipping fees must be between ₱0 and ₱100,000.' })
    nextCityFees[cityCode] = roundMoney(fee)
  }
  const settings = { provinceDays: nextProvinceDays, cityDays: nextCityDays, provinceFees: nextProvinceFees, cityFees: nextCityFees }
  await writeCollection('delivery-estimates', settings)
  res.json(settings)
})

app.get('/api/promotions', requireUser, async (req, res) => {
  const [promotions, orders] = await Promise.all([readCollection('promotions'), readCollection('orders')])
  const usedIds = new Set(orders.filter((order) => order.userId === req.user.id || order.email === req.user.email).map((order) => order.promotionId).filter(Boolean))
  const now = new Date()
  const welcomeUsed = orders.some((order) => (order.userId === req.user.id || order.email === req.user.email) && (order.welcomeDiscountUsed === true || Number(order.welcomeDiscountAmount) > 0))
  res.json({
    welcomeDiscountEligible: req.user.role === 'customer' && req.user.welcomeDiscountEligible === true && !welcomeUsed,
    promotions: promotions.filter((promotion) => promotion.active === true).map((promotion) => {
      const active = isPromotionActive(promotion, now)
      const alreadyUsed = usedIds.has(promotion.id)
      return {
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        discountPercent: promotion.discountPercent,
        freeShipping: promotion.freeShipping === true,
        allowWelcomeStacking: promotion.allowWelcomeStacking === true,
        eligible: active && !alreadyUsed,
        ineligibleReason: alreadyUsed ? 'Already used on this account.' : !active ? 'Not currently active.' : '',
      }
    }),
  })
})

app.get('/api/admin/promotions', requireUser, requireAdmin, async (_req, res) => {
  res.json(await readCollection('promotions'))
})

function validatePromotionInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const discountPercent = Number(body?.discountPercent)
  const freeShipping = body?.freeShipping === true
  if (!name || name.length > 80 || description.length > 500) throw checkoutError('Enter a promotion name and a description up to 500 characters.')
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 || discountPercent === 0 && !freeShipping) {
    throw checkoutError('Discount must be between 0 and 100 percent, or enable free shipping.')
  }
  const startDate = body.startDate || ''
  const expirationDate = body.expirationDate || ''
  if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(`${startDate}T00:00:00`)))) throw checkoutError('Enter a valid promotion start date.')
  if (expirationDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || Number.isNaN(Date.parse(`${expirationDate}T00:00:00`)))) throw checkoutError('Enter a valid promotion expiration date.')
  if (startDate && expirationDate && startDate > expirationDate) throw checkoutError('The expiration date must be on or after the start date.')
  return {
    name,
    description,
    discountPercent,
    freeShipping,
    active: body.active !== false,
    startDate,
    expirationDate,
    allowWelcomeStacking: body.allowWelcomeStacking === true,
  }
}

app.post('/api/admin/promotions', requireUser, requireAdmin, async (req, res) => {
  let details
  try { details = validatePromotionInput(req.body) } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Enter valid promotion details.' })
  }
  const promotions = await readCollection('promotions')
  const promotion = { id: `PROMO-${randomBytes(8).toString('hex').toUpperCase()}`, ...details, createdAt: new Date().toISOString() }
  promotions.push(promotion)
  await writeCollection('promotions', promotions)
  res.status(201).json(promotion)
})

app.put('/api/admin/promotions/:id', requireUser, requireAdmin, async (req, res) => {
  const promotions = await readCollection('promotions')
  const index = promotions.findIndex((promotion) => promotion.id === req.params.id)
  if (index < 0) return res.status(404).json({ error: 'Promotion not found.' })
  let details
  try { details = validatePromotionInput(req.body) } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Enter valid promotion details.' })
  }
  promotions[index] = { ...promotions[index], ...details }
  await writeCollection('promotions', promotions)
  res.json(promotions[index])
})

app.patch('/api/admin/promotions/:id/active', requireUser, requireAdmin, async (req, res) => {
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'Choose whether the promotion is active.' })
  const promotions = await readCollection('promotions')
  const promotion = promotions.find((entry) => entry.id === req.params.id)
  if (!promotion) return res.status(404).json({ error: 'Promotion not found.' })
  promotion.active = req.body.active
  await writeCollection('promotions', promotions)
  res.json(promotion)
})

app.get('/api/admin/payment-fees', requireUser, requireAdmin, async (_req, res) => {
  res.json(await readCollection('payment-fee-settings', defaultPaymentFeeSettings))
})

app.put('/api/admin/payment-fees', requireUser, requireAdmin, async (req, res) => {
  const rates = req.body?.rates
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) return res.status(400).json({ error: 'Provide configured payment method fee rates.' })
  const nextRates = {}
  for (const [rawMethod, rate] of Object.entries(rates)) {
    const method = rawMethod.trim()
    if (!method || method.length > 60 || !rate || typeof rate !== 'object') return res.status(400).json({ error: 'Enter a payment method and its fee configuration.' })
    const percentage = Number(rate.percentage)
    const fixed = Number(rate.fixed)
    const minimum = Number(rate.minimum)
    if (![percentage, fixed, minimum].every(Number.isFinite) || percentage < 0 || percentage > 100 || fixed < 0 || minimum < 0 || fixed > 100000 || minimum > 100000) {
      return res.status(400).json({ error: `Fee settings for ${method} must use non-negative, valid values.` })
    }
    nextRates[method.toLowerCase()] = { method, percentage, fixed: roundMoney(fixed), minimum: roundMoney(minimum) }
  }
  const settings = { rates: nextRates }
  await writeCollection('payment-fee-settings', settings)
  res.json(settings)
})

function paymentDetailsFromProvider(source) {
  const paymentMethod = [source?.payment_method, source?.paymentMethod, source?.payment_method_type, source?.channel_code]
    .find((value) => typeof value === 'string' && value.trim())
  const paidAmount = Number(source?.amount)
  return {
    ...(paymentMethod ? { paymentMethodUsed: paymentMethod.trim() } : {}),
    ...(Number.isFinite(paidAmount) && paidAmount > 0 ? { grossPaymentAmount: roundMoney(paidAmount) } : {}),
  }
}

app.get('/api/admin/payment-report', requireUser, requireAdmin, async (_req, res) => {
  const [orders, feeSettings] = await Promise.all([
    readCollection('orders'),
    readCollection('payment-fee-settings', defaultPaymentFeeSettings),
  ])
  const paidOnlineOrders = orders.filter((order) => order.payment === 'Cashless' && order.paymentStatus === 'Paid' && order.status !== 'Cancelled')
  const transactions = paidOnlineOrders.map((order) => {
    const gross = Number(order.grossPaymentAmount || order.total)
    const rate = feeSettings.rates?.[String(order.paymentMethodUsed || '').toLowerCase()]
    const estimatedFee = rate ? roundMoney(Math.max(rate.minimum, gross * rate.percentage / 100 + rate.fixed)) : null
    return {
      orderId: order.id,
      customer: order.customer,
      paymentMethod: order.paymentMethodUsed || 'Not reported by Xendit',
      grossAmount: gross,
      feeRate: rate || null,
      estimatedFee,
      estimatedNet: estimatedFee === null ? null : roundMoney(gross - estimatedFee),
    }
  })
  res.json({
    totalOnlineSales: roundMoney(transactions.reduce((sum, entry) => sum + entry.grossAmount, 0)),
    totalEstimatedFees: roundMoney(transactions.reduce((sum, entry) => sum + (entry.estimatedFee || 0), 0)),
    totalEstimatedNet: roundMoney(transactions.reduce((sum, entry) => sum + (entry.estimatedNet || 0), 0)),
    transactions,
    feeSettings,
  })
})

app.get('/api/admin/customers', requireUser, requireAdmin, async (_req, res) => {
  const users = await readCollection('users')
  res.json(users.filter((user) => user.role === 'customer').map((user) => ({ ...publicUser(user), active: user.active !== false })))
})

app.put('/api/admin/customers/:id', requireUser, requireAdmin, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
  const address = typeof req.body.address === 'string' ? req.body.address.trim() : ''
  if (!name) return res.status(400).json({ error: 'Enter a customer name.' })
  const users = await readCollection('users')
  const customer = users.find((user) => user.id === req.params.id && user.role === 'customer')
  if (!customer) return res.status(404).json({ error: 'Customer account not found.' })
  customer.name = name
  customer.phone = phone
  customer.address = address
  await writeCollection('users', users)
  res.json({ ...publicUser(customer), active: customer.active !== false })
})

app.patch('/api/admin/customers/:id/active', requireUser, requireAdmin, async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Choose whether the customer account should be active.' })
  const users = await readCollection('users')
  const customer = users.find((user) => user.id === req.params.id && user.role === 'customer')
  if (!customer) return res.status(404).json({ error: 'Customer account not found.' })
  customer.active = req.body.active
  await writeCollection('users', users)
  res.json({ ...publicUser(customer), active: customer.active })
})

app.delete('/api/admin/customers/:id', requireUser, requireAdmin, async (req, res) => {
  const users = await readCollection('users')
  const customerIndex = users.findIndex((user) => user.id === req.params.id && user.role === 'customer')
  if (customerIndex < 0) return res.status(404).json({ error: 'Customer account not found.' })
  users.splice(customerIndex, 1)
  await writeCollection('users', users)
  res.status(204).end()
})

app.post('/api/messages', requireUser, async (req, res) => {
  const allowedTypes = new Set(['product-feedback', 'suggestion', 'product-report'])
  const type = req.body?.type
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const productId = typeof req.body?.productId === 'string' ? req.body.productId : ''
  if (!allowedTypes.has(type) || message.length < 5 || message.length > 2000) {
    return res.status(400).json({ error: 'Choose a message type and enter a message between 5 and 2,000 characters.' })
  }
  if ((type === 'product-feedback' || type === 'product-report') && !productId) {
    return res.status(400).json({ error: 'Choose the product this message is about.' })
  }
  const products = productId ? await readCollection('products') : []
  const product = productId ? products.find((entry) => entry.id === productId) : undefined
  if (productId && !product) return res.status(404).json({ error: 'The selected product was not found.' })

  const messages = await readCollection('messages')
  messages.push({
    id: `MSG-${randomBytes(8).toString('hex').toUpperCase()}`,
    userId: req.user.id,
    customer: req.user.name,
    email: req.user.email,
    type,
    ...(product ? { productId: product.id, productName: product.name } : {}),
    message,
    createdAt: new Date().toISOString(),
  })
  await writeCollection('messages', messages)
  res.status(201).json({ submitted: true })
})

app.post('/api/products', requireUser, requireAdmin, async (req, res) => {
  const product = req.body
  if (!product?.name || !Number.isFinite(Number(product.price)) || !product.image) return res.status(400).json({ error: 'Complete all product details.' })
  const products = await readCollection('products')
  const saved = { ...product, id: product.id || `grill-${Date.now()}`, price: Number(product.price), stock: Number(product.stock) || 0, sellerId: 'admin-001', sellerName: 'The Grill Phrenz J' }
  products.push(saved)
  await writeCollection('products', products)
  res.status(201).json(saved)
})

app.put('/api/products/:id', requireUser, requireAdmin, async (req, res) => {
  const products = await readCollection('products')
  const index = products.findIndex((product) => product.id === req.params.id)
  if (index < 0) return res.status(404).json({ error: 'Product not found.' })
  products[index] = { ...products[index], ...req.body, id: products[index].id, price: Number(req.body.price), stock: Number(req.body.stock) || 0, sellerId: 'admin-001', sellerName: 'The Grill Phrenz J' }
  await writeCollection('products', products)
  res.json(products[index])
})

app.delete('/api/products/:id', requireUser, requireAdmin, async (req, res) => {
  const products = await readCollection('products')
  const remaining = products.filter((product) => product.id !== req.params.id)
  if (remaining.length === products.length) return res.status(404).json({ error: 'Product not found.' })
  await writeCollection('products', remaining)
  res.status(204).end()
})

app.post('/api/auth/request-code', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const purpose = req.body.purpose
  if (!email.includes('@') || !['register', 'reset'].includes(purpose)) return res.status(400).json({ error: 'Check the email address.' })
  const sender = process.env.SMTP_USER
  const appPassword = process.env.SMTP_PASS?.replace(/\s/g, '')
  const host = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT)
  if (!sender || !appPassword || !host || !Number.isInteger(smtpPort) || !process.env.SMTP_SECURE) {
    return res.status(503).json({ error: 'Email verification is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASS in .env.' })
  }
  if (purpose === 'register') {
    const users = await readCollection('users')
    if (users.some((user) => user.email === email)) return res.status(409).json({ error: 'An account already uses this email.' })
  }
  const code = String(randomInt(100000, 1000000))
  const key = `${email}:${purpose}`
  verificationCodes.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 })
  try {
    const mailer = nodemailer.createTransport({
      host,
      port: smtpPort,
      secure: process.env.SMTP_SECURE.toLowerCase() === 'true',
      auth: { user: sender, pass: appPassword },
    })
    const action = purpose === 'register' ? 'finish creating your account' : 'reset your password'
    await mailer.sendMail({
      from: process.env.MAIL_FROM || sender,
      to: email,
      subject: 'Your The Grill Phrenz J verification code',
      text: `Use ${code} to ${action}. This code expires in 10 minutes. If you did not request it, you can ignore this email.`,
      html: `<p>Use this code to ${action}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    })
    res.json({ sent: true, expiresInMinutes: 10 })
  } catch {
    verificationCodes.delete(key)
    res.status(502).json({ error: 'Gmail could not send the verification email. Check the Gmail address and App Password in .env.' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const { name, email: rawEmail, phone, address, password, code } = req.body
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!name || !email || !phone || !address) return res.status(400).json({ error: 'Complete all account details.' })
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters and include at least one special character.' })
  const users = await readCollection('users')
  if (users.some((user) => user.email === email)) return res.status(409).json({ error: 'An account already uses this email.' })
  if (!consumeVerificationCode(`${email}:register`, code)) return res.status(400).json({ error: 'The verification code is invalid or expired.' })
  const user = {
    id: `user-${Date.now()}-${randomBytes(4).toString('hex')}`,
    name,
    email,
    phone,
    address,
    role: 'customer',
    welcomeDiscountEligible: true,
    welcomeDiscountUsed: false,
    password: makePassword(password),
  }
  users.push(user)
  await writeCollection('users', users)
  verificationCodes.delete(`${email}:register`)
  res.status(201).json({ created: true })
})

app.post('/api/auth/google', async (req, res) => {
  if (!validGoogleClientId) return res.status(503).json({ error: 'Google sign-in needs a valid Web OAuth client ID ending in .apps.googleusercontent.com.' })
  if (!['register', 'login'].includes(req.body.action)) return res.status(400).json({ error: 'Choose sign-up or sign-in.' })
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: googleClientId })
    const payload = ticket.getPayload()
    const email = String(payload?.email || '').toLowerCase()
    if (!payload?.sub || !payload.email_verified || !email.endsWith('@gmail.com')) return res.status(403).json({ error: 'Use a verified Gmail account.' })
    const users = await readCollection('users')
    let user = users.find((entry) => entry.googleSub === payload.sub)
    if (req.body.action === 'register') {
      if (user || users.some((entry) => entry.email === email)) return res.status(409).json({ error: 'An account already uses this Gmail address. Sign in instead.' })
      user = {
        id: `google-${randomBytes(12).toString('hex')}`,
        name: payload.name || email.split('@')[0],
        email,
        phone: '',
        address: '',
        role: 'customer',
        welcomeDiscountEligible: true,
        welcomeDiscountUsed: false,
        googleSub: payload.sub,
        authProvider: 'google',
      }
      users.push(user)
      await writeCollection('users', users)
      return res.status(201).json({ created: true, user: publicUser(user) })
    }
    if (!user) {
      user = users.find((entry) => entry.email === email)
      if (user) user.googleSub = payload.sub
    }
    if (!user) return res.status(404).json({ error: 'No account exists for this Gmail address. Create an account first.' })
    if (user.active === false) return res.status(403).json({ error: 'This account has been deactivated. Contact store support.' })
    await writeCollection('users', users)
    res.json(startSession(user))
  } catch {
    res.status(401).json({ error: 'Google could not verify this sign-in. Please try again.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  if (!isStrongPassword(req.body.password)) return res.status(400).json({ error: 'Password must be at least 10 characters and include at least one special character. Use Forgot password if your current password does not meet this requirement.' })
  const users = await readCollection('users')
  const user = users.find((entry) => entry.email === email)
  if (!user || !verifyPassword(String(req.body.password || ''), user.password)) return res.status(401).json({ error: 'The email or password is incorrect.' })
  if (user.active === false) return res.status(403).json({ error: 'This account has been deactivated. Contact store support.' })
  res.json(startSession(user))
})

app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  if (!isStrongPassword(req.body.password)) return res.status(400).json({ error: 'The new password must be at least 10 characters and include at least one special character.' })
  const users = await readCollection('users')
  const user = users.find((entry) => entry.email === email)
  if (!user) return res.status(404).json({ error: 'No account exists for this email.' })
  if (!consumeVerificationCode(`${email}:reset`, req.body.code)) return res.status(400).json({ error: 'The verification code is invalid or expired.' })
  user.password = makePassword(req.body.password)
  await writeCollection('users', users)
  verificationCodes.delete(`${email}:reset`)
  res.json({ ok: true })
})

app.get('/api/me', requireUser, (req, res) => res.json(publicUser(req.user)))

app.put('/api/me', requireUser, async (req, res) => {
  const users = await readCollection('users')
  const user = users.find((entry) => entry.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'Account not found.' })
  for (const field of ['name', 'phone', 'address']) if (typeof req.body[field] === 'string') user[field] = req.body[field]
  if (req.body.avatarUrl !== undefined) {
    if (typeof req.body.avatarUrl !== 'string' || (req.body.avatarUrl && (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.avatarUrl) || req.body.avatarUrl.length > 700000))) {
      return res.status(400).json({ error: 'Profile pictures must be JPEG, PNG, or WebP images under 500 KB.' })
    }
    user.avatarUrl = req.body.avatarUrl
  }
  await writeCollection('users', users)
  res.json(publicUser(user))
})

app.get('/api/orders', async (req, res) => {
  const orders = await readCollection('orders')
  if (req.user?.role === 'admin') return res.json(orders.map(orderForResponse))
  if (req.user) return res.json(orders.filter((order) => order.email === req.user.email).map(orderForResponse))
  res.json(orders.filter((order) => order.id === 'TGJ-1042').map(orderForResponse))
})

async function createXenditSession(order, items) {
  const secretKey = process.env.XENDIT_SECRET_KEY
  const successRedirect = process.env.XENDIT_SUCCESS_REDIRECT_URL
  const failureRedirect = process.env.XENDIT_FAILURE_REDIRECT_URL
  if (!secretKey || !successRedirect || !failureRedirect) {
    throw new Error('Xendit checkout is not configured. Set XENDIT_SECRET_KEY and both XENDIT redirect URLs in .env.')
  }
  let successUrl
  let cancelUrl
  try {
    successUrl = new URL(successRedirect)
    cancelUrl = new URL(failureRedirect)
  } catch {
    throw new Error('XENDIT_SUCCESS_REDIRECT_URL and XENDIT_FAILURE_REDIRECT_URL must be valid absolute URLs in .env.')
  }
  const invalidRedirect = [successUrl, cancelUrl].some((url) =>
    url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname),
  )
  if (invalidRedirect) {
    throw new Error('Xendit requires public HTTPS return URLs. Replace localhost HTTP URLs in XENDIT_SUCCESS_REDIRECT_URL and XENDIT_FAILURE_REDIRECT_URL with your HTTPS site or tunnel URL.')
  }
  successUrl.searchParams.set('payment', 'success')
  successUrl.searchParams.set('order', order.id)
  cancelUrl.searchParams.set('payment', 'failed')
  cancelUrl.searchParams.set('order', order.id)
  console.log('========== XENDIT DEBUG ==========')
  console.log('Order ID:', order.id)
  console.log('Success URL:', successUrl.toString())
  console.log('Failure URL:', cancelUrl.toString())
  console.log('==================================')
  const phoneDigits = String(order.phone || '').replace(/\D/g, '')
  const mobileNumber = phoneDigits ? phoneDigits.startsWith('0') ? `+63${phoneDigits.slice(1)}` : `+${phoneDigits}` : undefined
  const payload = {
    reference_id: order.id,
    session_type: 'PAY',
    mode: 'PAYMENT_LINK',
    amount: order.total,
    currency: 'PHP',
    country: 'PH',
    locale: 'en',
    description: `The Grill Phrenz J order ${order.id}`,
    customer: {
      reference_id: `customer${randomBytes(8).toString('hex')}`,
      type: 'INDIVIDUAL',
      email: order.email,
      ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
      individual_detail: { given_names: order.customer.slice(0, 255) },
    },
    items: [{
      reference_id: order.id,
      type: 'PHYSICAL_PRODUCT',
      name: 'The Grill Phrenz J order',
      description: `${items.length} product line(s), shipping and applied discounts included.`.slice(0, 255),
      category: 'Grill equipment',
      net_unit_amount: order.total,
      quantity: 1,
      currency: 'PHP',
    }],
    success_return_url: successUrl.toString(),
    cancel_return_url: cancelUrl.toString(),
  }
  const response = await fetch('https://api.xendit.co/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const responseBody = await response.text()
  let result
  try {
    result = JSON.parse(responseBody)
  } catch {
    throw new Error(`Xendit returned an unexpected response (HTTP ${response.status}). Check the secret key and Xendit API availability.`)
  }
  if (!response.ok) {
    const errorCode = typeof result.error_code === 'string' ? result.error_code : ''
    const errorMessage = typeof result.message === 'string' ? result.message : ''
    const details = [errorCode, errorMessage].filter(Boolean).join(': ').slice(0, 300)
    throw new Error(`Xendit checkout failed (HTTP ${response.status})${details ? `: ${details}` : '.'}`)
  }
  if (typeof result.payment_link_url !== 'string' || typeof result.payment_session_id !== 'string') {
    throw new Error('Xendit response did not include the hosted checkout URL and session ID. Check the Payment Session configuration in Xendit.')
  }
  return result
}

app.post('/api/orders', requireUser, async (req, res) => withCheckoutLock(async () => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot place orders.' })
  const {
    name, phone, payment, checkoutRequestId,
  } = req.body
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || typeof phone !== 'string' || !phone.trim() || phone.trim().length > 40 || !['Cash on delivery', 'Cashless'].includes(payment)) {
    return res.status(400).json({ error: 'Complete the contact, item, and payment details.' })
  }
  if (typeof checkoutRequestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(checkoutRequestId)) {
    return res.status(400).json({ error: 'Refresh checkout and try placing the order again.' })
  }
  const orders = await readCollection('orders')
  const existingOrder = orders.find((order) => order.userId === req.user.id && order.checkoutRequestId === checkoutRequestId)
  if (existingOrder) {
    return res.status(200).json({ order: orderForResponse(existingOrder), checkoutUrl: existingOrder.paymentCheckoutUrl })
  }
  let quote
  try {
    quote = await getCheckoutQuote(req.user, req.body)
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error instanceof Error ? error.message : 'Unable to validate the order.' })
  }
  const products = await readCollection('products')
  const resolvedItems = resolveOrderItems(req.body.items, products)
  const deliveryDays = quote.estimatedDeliveryDays
  const deliveryAddress = quote.deliveryAddress
  const address = [
    deliveryAddress.deliveryStreetAddress,
    deliveryAddress.deliveryBarangay,
    deliveryAddress.deliveryCity,
    deliveryAddress.deliveryProvince,
    deliveryAddress.deliveryZipCode,
    deliveryAddress.deliveryAdditionalDetails,
  ].filter(Boolean).join(', ')
  const order = {
    id: `TGJ-${randomBytes(8).toString('hex').toUpperCase()}`,
    customer: String(name).trim(),
    email: req.user.email,
    phone: String(phone).trim(),
    address,
    region: deliveryRegionName,
    ...deliveryAddress,
    userId: req.user.id,
    checkoutRequestId,
    items: quote.items,
    productSubtotal: quote.productSubtotal,
    shippingFee: quote.shippingFee,
    originalShippingFee: quote.originalShippingFee,
    welcomeDiscountAmount: quote.welcomeDiscountAmount,
    welcomeDiscountUsed: quote.welcomeDiscountApplied,
    promotionDiscountAmount: quote.promotionDiscountAmount,
    ...(quote.promotionId ? { promotionId: quote.promotionId, promotionName: quote.promotionName } : {}),
    freeShippingDiscount: quote.freeShippingDiscount,
    discountAmount: roundMoney(quote.welcomeDiscountAmount + quote.promotionDiscountAmount),
    total: quote.total,
    payment,
    paymentStatus: payment === 'Cashless' ? 'Awaiting payment' : 'Cash on delivery',
    status: 'Order Placed',
    deliveryStatus: 'Order Placed',
    placedAt: new Date().toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }),
    deliveryDays,
    estimatedDeliveryDays: deliveryDays,
    estimatedDeliveryDate: calculateEstimatedDeliveryDate(deliveryDays),
  }
  let checkoutUrl
  if (payment === 'Cashless') {
    try {
      const session = await createXenditSession(order, resolvedItems)
      order.paymentSessionId = session.payment_session_id
      checkoutUrl = session.payment_link_url
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : 'Unable to start Xendit checkout.' })
    }
  }
  for (const item of resolvedItems) {
    const product = products.find((entry) => entry.id === item.productId)
    product.stock -= item.quantity
  }
  await writeCollection('products', products)
  orders.unshift(order)
  await writeCollection('orders', orders)
  res.status(201).json({ order: orderForResponse(order), checkoutUrl })
}))

app.get('/api/orders/:id/payment-status', async (req, res) => {
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (req.user && req.user.role !== 'admin' && req.user.email !== order.email) return res.status(403).json({ error: 'This order does not belong to your account.' })
  if (order.paymentSessionId && process.env.XENDIT_SECRET_KEY) {
    const response = await fetch(`https://api.xendit.co/sessions/${encodeURIComponent(order.paymentSessionId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64')}` },
    })
    if (response.ok) {
      const session = await response.json()
      if (session.status === 'COMPLETED') {
        order.paymentStatus = 'Paid'
        Object.assign(order, paymentDetailsFromProvider(session))
      }
      if (session.status === 'EXPIRED' || session.status === 'CANCELED') order.paymentStatus = 'Payment expired'
      await writeCollection('orders', orders)
    }
  }
  res.json({ id: order.id, status: normalizedOrderStatus(order.deliveryStatus || order.status), paymentStatus: order.paymentStatus })
})

app.post('/api/payments/xendit/webhook', async (req, res) => {
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN
  const providedToken = req.get('x-callback-token') || ''
  const expected = Buffer.from(expectedToken || '')
  const provided = Buffer.from(providedToken)
  if (!expectedToken || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return res.status(401).json({ error: 'Invalid webhook token.' })
  const { event, data } = req.body
  if (!['payment_session.completed', 'payment_session.expired'].includes(event) || !data?.reference_id || !data?.payment_session_id) return res.status(400).json({ error: 'Invalid payment session event.' })
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === data.reference_id && entry.paymentSessionId === data.payment_session_id)
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (event === 'payment_session.completed' && data.status === 'COMPLETED') {
    order.paymentStatus = 'Paid'
    Object.assign(order, paymentDetailsFromProvider(data))
  }
  if (event === 'payment_session.expired' && data.status === 'EXPIRED') order.paymentStatus = 'Payment expired'
  await writeCollection('orders', orders)
  res.json({ received: true })
})

app.patch('/api/orders/:id/status', requireUser, requireAdmin, async (req, res) => {
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === req.params.id)
  const allowed = ['Order Placed', 'Order Confirmed', 'Preparing Order', 'Out for Delivery', 'Delivered', 'Cancelled']
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (terminalStatuses.has(normalizedOrderStatus(order.deliveryStatus || order.status))) return res.status(409).json({ error: 'This order has a final status and can no longer be changed.' })
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid order status.' })
  order.status = req.body.status
  order.deliveryStatus = req.body.status
  await writeCollection('orders', orders)
  res.json(orderForResponse(order))
})

app.patch('/api/orders/:id/cancel', async (req, res) => {
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (!['Order Placed', 'Pending'].includes(normalizedOrderStatus(order.deliveryStatus || order.status))) return res.status(409).json({ error: 'Only newly placed orders can be cancelled.' })
  if (req.user && req.user.role !== 'admin' && req.user.email !== order.email) return res.status(403).json({ error: 'This order does not belong to your account.' })
  order.status = 'Cancelled'
  order.deliveryStatus = 'Cancelled'
  await writeCollection('orders', orders)
  res.json(orderForResponse(order))
})

await ensureAdmin()
await readCollection('products')
await readCollection('orders')
await readCollection('messages')
await readCollection('central-luzon-postal-codes')
await readCollection('delivery-estimates', defaultDeliveryEstimates)
app.listen(port, '127.0.0.1', () => console.log(`The Grill Phrenz J API ready at http://127.0.0.1:${port}`))