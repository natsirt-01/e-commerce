import 'dotenv/config'
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import nodemailer from 'nodemailer'
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

app.use(express.json({ limit: '1mb' }))

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
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role }
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

app.get('/api/products', async (_req, res) => res.json(await readCollection('products')))

app.get('/api/admin/messages', requireUser, requireAdmin, async (_req, res) => {
  const messages = await readCollection('messages')
  res.json(messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
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
  const saved = { ...product, id: product.id || `grill-${Date.now()}`, price: Number(product.price), stock: Number(product.stock) || 0 }
  products.push(saved)
  await writeCollection('products', products)
  res.status(201).json(saved)
})

app.put('/api/products/:id', requireUser, requireAdmin, async (req, res) => {
  const products = await readCollection('products')
  const index = products.findIndex((product) => product.id === req.params.id)
  if (index < 0) return res.status(404).json({ error: 'Product not found.' })
  products[index] = { ...products[index], ...req.body, id: products[index].id, price: Number(req.body.price), stock: Number(req.body.stock) || 0 }
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
  if (!name || !email || !phone || !address || String(password || '').length < 6) return res.status(400).json({ error: 'Complete all account details.' })
  const users = await readCollection('users')
  if (users.some((user) => user.email === email)) return res.status(409).json({ error: 'An account already uses this email.' })
  if (!consumeVerificationCode(`${email}:register`, code)) return res.status(400).json({ error: 'The verification code is invalid or expired.' })
  const user = { id: `user-${Date.now()}`, name, email, phone, address, role: 'customer', password: makePassword(password) }
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
      user = { id: `google-${randomBytes(12).toString('hex')}`, name: payload.name || email.split('@')[0], email, phone: '', address: '', role: 'customer', googleSub: payload.sub, authProvider: 'google' }
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
  const users = await readCollection('users')
  const user = users.find((entry) => entry.email === email)
  if (!user || !verifyPassword(String(req.body.password || ''), user.password)) return res.status(401).json({ error: 'The email or password is incorrect.' })
  if (user.active === false) return res.status(403).json({ error: 'This account has been deactivated. Contact store support.' })
  res.json(startSession(user))
})

app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  if (String(req.body.password || '').length < 6) return res.status(400).json({ error: 'The new password must be at least 6 characters.' })
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
  await writeCollection('users', users)
  res.json(publicUser(user))
})

app.get('/api/orders', async (req, res) => {
  const orders = await readCollection('orders')
  if (req.user?.role === 'admin') return res.json(orders)
  if (req.user) return res.json(orders.filter((order) => order.email === req.user.email))
  res.json(orders.filter((order) => order.id === 'TGJ-1042'))
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
    items: items.map((item) => ({
      reference_id: item.productId,
      type: 'PHYSICAL_PRODUCT',
      name: item.name,
      description: item.description.slice(0, 255),
      category: item.category || 'Grill equipment',
      net_unit_amount: item.price,
      quantity: item.quantity,
      currency: 'PHP',
    })),
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

app.post('/api/orders', requireUser, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot place orders.' })
  const { name, email, phone, address, region, payment, items } = req.body
  if (!name || !email || !phone || !address || !Array.isArray(items) || !items.length || !['Luzon', 'Visayas', 'Mindanao'].includes(region) || !['Cash on delivery', 'Cashless'].includes(payment)) return res.status(400).json({ error: 'Complete the delivery and payment details.' })
  const products = await readCollection('products')
  const resolvedItems = []
  for (const item of items) {
    const product = products.find((entry) => entry.id === item.productId)
    const quantity = Math.floor(Number(item.quantity))
    if (!product || quantity < 1 || quantity > product.stock) return res.status(400).json({ error: 'An item is out of stock. Refresh your cart and try again.' })
    resolvedItems.push({ productId: product.id, name: product.name, description: product.description, category: product.category, quantity, price: product.price })
  }
  const orders = await readCollection('orders')
  const deliveryDays = region === 'Mindanao' ? 7 : region === 'Visayas' ? 5 : 3
  const order = { id: `TGJ-${randomBytes(8).toString('hex').toUpperCase()}`, customer: name, email: req.user?.email || email, phone, address, region, items: resolvedItems.map(({ productId, name: itemName, quantity, price }) => ({ productId, name: itemName, quantity, price })), total: resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0), payment, paymentStatus: payment === 'Cashless' ? 'Awaiting payment' : 'Cash on delivery', status: 'Pending', placedAt: new Date().toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }), deliveryDays }
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
  res.status(201).json({ order, checkoutUrl })
})

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
      if (session.status === 'COMPLETED') order.paymentStatus = 'Paid'
      if (session.status === 'EXPIRED' || session.status === 'CANCELED') order.paymentStatus = 'Payment expired'
      await writeCollection('orders', orders)
    }
  }
  res.json({ id: order.id, status: order.status, paymentStatus: order.paymentStatus })
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
  if (event === 'payment_session.completed' && data.status === 'COMPLETED') order.paymentStatus = 'Paid'
  if (event === 'payment_session.expired' && data.status === 'EXPIRED') order.paymentStatus = 'Payment expired'
  await writeCollection('orders', orders)
  res.json({ received: true })
})

app.patch('/api/orders/:id/status', requireUser, requireAdmin, async (req, res) => {
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === req.params.id)
  const allowed = ['Pending', 'On delivery', 'Delivered', 'Cancelled']
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (terminalStatuses.has(order.status)) return res.status(409).json({ error: 'This order has a final status and can no longer be changed.' })
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid order status.' })
  order.status = req.body.status
  await writeCollection('orders', orders)
  res.json(order)
})

app.patch('/api/orders/:id/cancel', async (req, res) => {
  const orders = await readCollection('orders')
  const order = orders.find((entry) => entry.id === req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found.' })
  if (order.status !== 'Pending') return res.status(409).json({ error: 'Only pending orders can be cancelled.' })
  if (req.user && req.user.role !== 'admin' && req.user.email !== order.email) return res.status(403).json({ error: 'This order does not belong to your account.' })
  order.status = 'Cancelled'
  await writeCollection('orders', orders)
  res.json(order)
})

await ensureAdmin()
await readCollection('products')
await readCollection('orders')
await readCollection('messages')
app.listen(port, '127.0.0.1', () => console.log(`The Grill Phrenz J API ready at http://127.0.0.1:${port}`))