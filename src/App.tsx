import { ArrowDownRight, ArrowRight, BadgeCheck, Flame, Gift, Leaf, ShieldCheck, Truck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminDashboard } from './components/AdminDashboard'
import { AuthDialog } from './components/AuthDialog'
import { CartDrawer, type CartLine, type CheckoutDetails } from './components/CartDrawer'
import { CustomerDashboard } from './components/CustomerDashboard'
import { GrillMark } from './components/GrillMark'
import { LogoutConfirmation } from './components/LogoutConfirmation'
import { ProductCard } from './components/ProductCard'
import { ProfileDialog } from './components/ProfileDialog'
import { SiteHeader } from './components/SiteHeader'
import { TrackingDialog } from './components/TrackingDialog'
import { initialProducts } from './data/products'
import { api } from './lib/api'
import type { AdminCustomer, ChatThread, DeliveryEstimateSettings, Order, OrderStatus, PaymentFeeSettings, PaymentReport, Product, Promotion, SellerMessageType, SellerMessage, User } from './types'
import './App.css'

type Overlay = 'auth' | 'profile' | 'cart' | 'tracking' | null
const cartStorageKey = 'grill-cart'
const selectedCartStorageKey = 'grill-selected-cart-ids'
const demoOrder: Order = {
  id: 'TGJ-1042', customer: 'Demo Customer', email: 'demo@grillphrenz.ph', address: 'Demo address, Angeles City, Pampanga', region: 'Central Luzon (Region III)',
  items: [{ productId: 'portable-002', name: 'Portable Grill Set', quantity: 1, price: 3290 }], total: 3290,
  payment: 'Cash on delivery', status: 'Out for Delivery', placedAt: 'Nov 06, 2026', deliveryDays: 7,
}
const initialDeliveryEstimates: DeliveryEstimateSettings = {
  provinceDays: {
    '030800000': 3,
    '031400000': 3,
    '034900000': 4,
    '035400000': 2,
    '036900000': 3,
    '037100000': 4,
    '037700000': 5,
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
const initialPaymentFeeSettings: PaymentFeeSettings = { rates: {} }
const initialPaymentReport: PaymentReport = { totalOnlineSales: 0, totalEstimatedFees: 0, totalEstimatedNet: 0, transactions: [], feeSettings: initialPaymentFeeSettings }

function readOrders(): Order[] {
  try {
    const stored = localStorage.getItem('grill-orders')
    return stored ? JSON.parse(stored) as Order[] : [demoOrder]
  } catch { return [demoOrder] }
}

function readCart(): CartLine[] {
  try {
    const stored = localStorage.getItem(cartStorageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is CartLine => {
      if (!value || typeof value !== 'object') return false
      const line = value as Partial<CartLine>
      if (!line.product || typeof line.product !== 'object' || !Number.isSafeInteger(line.quantity) || (line.quantity ?? 0) < 1) return false
      const product = line.product as Partial<Product>
      return typeof product.id === 'string' &&
        typeof product.name === 'string' &&
        typeof product.price === 'number' &&
        typeof product.image === 'string' &&
        typeof product.stock === 'number'
    })
  } catch {
    return []
  }
}

function readSelectedCartIds(): string[] {
  try {
    const stored = localStorage.getItem(selectedCartStorageKey)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function App() {
  const [products, setProducts] = useState(initialProducts)
  const [orders, setOrders] = useState(readOrders)
  const [cart, setCart] = useState<CartLine[]>(readCart)
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('grill-user') || 'null') as User | null } catch { return null }
  })
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [adminMode, setAdminMode] = useState(() => user?.role === 'admin')
  const [customerMode, setCustomerMode] = useState(false)
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([])
  const [sellerMessages, setSellerMessages] = useState<SellerMessage[]>([])
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([])
  const [deliveryEstimates, setDeliveryEstimates] = useState(initialDeliveryEstimates)
  const [adminPromotions, setAdminPromotions] = useState<Promotion[]>([])
  const [paymentFeeSettings, setPaymentFeeSettings] = useState(initialPaymentFeeSettings)
  const [paymentReport, setPaymentReport] = useState(initialPaymentReport)
  const [selectedCartIds, setSelectedCartIds] = useState<string[]>(readSelectedCartIds)
  const [logoutPrompt, setLogoutPrompt] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [category, setCategory] = useState('All grills')
  const [toast, setToast] = useState('')
  const categories = ['All grills', ...new Set(products.map((product) => product.category))]
  const filteredProducts = useMemo(() => category === 'All grills' ? products : products.filter((product) => product.category === category), [category, products])
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const customerOrders = user?.role === 'admin' ? orders : user ? orders.filter((order) => order.email === user.email) : []

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem(selectedCartStorageKey, JSON.stringify(selectedCartIds))
  }, [selectedCartIds])

  useEffect(() => {
    setCart((current) => current.map((item) => {
      const latestProduct = products.find((product) => product.id === item.product.id)
      return latestProduct ? { ...item, product: latestProduct } : item
    }))
  }, [products])

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => showToast('API offline; showing built-in demo products.'))
    const storedToken = localStorage.getItem('grill-session-token')
    const loadOrders = () => api.getOrders().then(setOrders).catch(() => undefined)
    if (storedToken) {
      api.getMe().then((currentUser) => {
        setUser(currentUser)
        setAdminMode(currentUser.role === 'admin')
        setCustomerMode(currentUser.role === 'customer')
        localStorage.setItem('grill-user', JSON.stringify(currentUser))
        if (currentUser.role === 'admin') void openAdmin()
      }).catch(() => {
        api.clearSession()
        localStorage.removeItem('grill-user')
        setUser(null)
        setAdminMode(false)
        setCustomerMode(false)
      }).finally(loadOrders)
    } else loadOrders()
    const returnParams = new URLSearchParams(window.location.search)
    const paymentResult = returnParams.get('payment')
    const orderId = returnParams.get('order')
    if (paymentResult && orderId) {
      api.refreshPayment(orderId).then((payment) => {
        setOrders((current) => current.map((order) => order.id === payment.id ? { ...order, ...payment } : order))
        showToast(payment.paymentStatus === 'Paid' ? 'Payment confirmed. Your order is being processed.' : 'Payment was not completed. Your order is still pending.')
      }).catch(() => showToast('We could not confirm the payment status yet. Check your order tracking shortly.'))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  function handleLogin(nextUser: User) {
    setUser(nextUser)
    setCustomerMode(nextUser.role === 'customer')
    setAdminMode(nextUser.role === 'admin')
    localStorage.setItem('grill-user', JSON.stringify(nextUser))
    api.getOrders().then(setOrders).catch(() => undefined)
    setOverlay(null)
    if (nextUser.role === 'admin') {
      void openAdmin()
    }
    showToast(`Welcome, ${nextUser.name}!`)
  }

  function addToCart(product: Product) {
    if (user?.role === 'admin') {
      showToast('Admin accounts cannot place orders.')
      return
    }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing ? current.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item) : [...current, { product, quantity: 1 }]
    })
    setSelectedCartIds((current) => current.includes(product.id) ? current : [...current, product.id])
    showToast(`${product.name} added to your bag.`)
  }

  function addFromHomepage(product: Product) {
    if (!user) {
      setOverlay('auth')
      return
    }
    addToCart(product)
  }

  async function checkout(details: CheckoutDetails): Promise<boolean> {
    if (user?.role === 'admin') {
      showToast('Admin accounts cannot place orders.')
      return false
    }
    if (!user) {
      setOverlay('auth')
      return false
    }
    if (!details.selectedItems.length) {
      showToast('Select at least one product to purchase.')
      return false
    }
    try {
      const result = await api.createOrder({
        ...details,
        items: details.selectedItems,
      })
      const order = result.order
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)])
      const purchasedQuantities = new Map<string, number>()
      for (const item of details.selectedItems) {
        purchasedQuantities.set(item.productId, (purchasedQuantities.get(item.productId) ?? 0) + item.quantity)
      }
      setCart((current) => current
        .map((item) => ({
          ...item,
          quantity: item.quantity - (purchasedQuantities.get(item.product.id) ?? 0),
        }))
        .filter((item) => item.quantity > 0))
      setSelectedCartIds((current) => current.filter((id) => !purchasedQuantities.has(id)))
      setOverlay(null)
      api.getProducts().then(setProducts).catch(() => undefined)
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl)
      else showToast(`Order ${order.id} placed. Pay the courier when it arrives.`)
      return true
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'Unable to place the order. Please try again.')
      return false
    }
  }

  async function changeStatus(orderId: string, status: OrderStatus) {
    const updated = await api.updateOrderStatus(orderId, status)
    setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
  }

  async function cancelOrder(orderId: string) {
    try {
      const updated = await api.cancelOrder(orderId)
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order))
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Unable to cancel the order.') }
  }

  async function saveProfile(nextUser: User) {
    const saved = await api.updateProfile({ name: nextUser.name, phone: nextUser.phone, address: nextUser.address, avatarUrl: nextUser.avatarUrl || '' })
    setUser(saved)
    localStorage.setItem('grill-user', JSON.stringify(saved))
    showToast('Profile saved.')
    return saved
  }

  async function sendSellerMessage(data: { type: SellerMessageType; productId?: string; message: string }) {
    await api.sendSellerMessage(data)
  }

  async function openAdmin() {
    setAdminMode(true)
    try {
      const [messages, chats, customers, estimates, promotions, feeSettings, report] = await Promise.all([
        api.getAdminMessages(),
        api.getAdminChats(),
        api.getAdminCustomers(),
        api.getAdminDeliveryEstimates(),
        api.getAdminPromotions(),
        api.getAdminPaymentFeeSettings(),
        api.getAdminPaymentReport(),
      ])
      setSellerMessages(messages)
      setChatThreads(chats)
      setAdminCustomers(customers)
      setDeliveryEstimates(estimates)
      setAdminPromotions(promotions)
      setPaymentFeeSettings(feeSettings)
      setPaymentReport(report)
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Unable to load admin data.') }
  }

  const refreshAdminChats = useCallback(async () => {
    setChatThreads(await api.getAdminChats())
  }, [])

  async function replyToChat(threadId: string, message: string) {
    const updated = await api.sendAdminChatMessage(threadId, message)
    setChatThreads((current) => current.map((thread) => thread.id === updated.id ? updated : thread))
  }

  function signOut() {
    setLogoutPrompt(false)
    setUser(null)
    setCustomerMode(false)
    setAdminMode(false)
    api.clearSession()
    localStorage.removeItem('grill-user')
    setOverlay(null)
  }

  function requestSignOut() {
    setLogoutPrompt(true)
  }

  if (adminMode && user?.role === 'admin') return <>
    <AdminDashboard products={products} orders={orders} messages={sellerMessages} chatThreads={chatThreads} customers={adminCustomers} deliveryEstimates={deliveryEstimates} promotions={adminPromotions} paymentFeeSettings={paymentFeeSettings} paymentReport={paymentReport} onSignOut={requestSignOut} onRefreshChats={refreshAdminChats} onReplyToChat={replyToChat} onSaveDeliveryEstimates={async (settings) => {
    const saved = await api.updateAdminDeliveryEstimates(settings)
    setDeliveryEstimates(saved)
  }} onSaveProduct={async (product) => {
    const saved = products.some((item) => item.id === product.id) ? await api.updateProduct(product) : await api.createProduct(product)
    setProducts((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
    return saved
  }} onDeleteProduct={async (id) => {
    await api.deleteProduct(id)
    setProducts((current) => current.filter((product) => product.id !== id))
  }} onUpdateStatus={changeStatus} onUpdateCustomer={async (id, data) => {
    const updated = await api.updateAdminCustomer(id, data)
    setAdminCustomers((current) => current.map((customer) => customer.id === updated.id ? updated : customer))
  }} onSetCustomerActive={async (id, active) => {
    const updated = await api.setAdminCustomerActive(id, active)
    setAdminCustomers((current) => current.map((customer) => customer.id === updated.id ? updated : customer))
  }} onDeleteCustomer={async (id) => {
    await api.deleteAdminCustomer(id)
    setAdminCustomers((current) => current.filter((customer) => customer.id !== id))
  }} onSavePromotion={async (promotion) => {
    const saved = promotion.id
      ? await api.updateAdminPromotion(promotion as Promotion)
      : await api.createAdminPromotion(promotion)
    setAdminPromotions((current) => promotion.id
      ? current.map((entry) => entry.id === saved.id ? saved : entry)
      : [...current, saved])
    return saved
  }} onSetPromotionActive={async (id, active) => {
    const saved = await api.setAdminPromotionActive(id, active)
    setAdminPromotions((current) => current.map((entry) => entry.id === id ? saved : entry))
  }} onSavePaymentFeeSettings={async (settings) => {
    const saved = await api.updateAdminPaymentFeeSettings(settings)
    setPaymentFeeSettings(saved)
    setPaymentReport(await api.getAdminPaymentReport())
  }} onRefreshPaymentReport={async () => {
    setPaymentReport(await api.getAdminPaymentReport())
  }} />
    {logoutPrompt && <LogoutConfirmation onConfirm={signOut} onCancel={() => setLogoutPrompt(false)} />}
  </>

  if (customerMode && user?.role === 'customer') return <>
    <CustomerDashboard
      user={user}
      products={products}
      orders={customerOrders}
      cart={cart}
      onAdd={addToCart}
      onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.product.id === id ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, item.product.stock)) } : item))}
      selectedCartIds={selectedCartIds}
      onChangeSelectedCartIds={setSelectedCartIds}
      onRemove={(id) => { setCart((current) => current.filter((item) => item.product.id !== id)); setSelectedCartIds((current) => current.filter((itemId) => itemId !== id)) }}
      onCheckout={checkout}
      cartOpen={overlay === 'cart'}
      onCloseCart={() => setOverlay(null)}
      onCancelOrder={cancelOrder}
      onSignOut={requestSignOut}
      onSaveProfile={saveProfile}
      onSendMessage={sendSellerMessage}
    />
    {toast && <div className="toast-message" role="status">{toast}</div>}
    {logoutPrompt && <LogoutConfirmation onConfirm={signOut} onCancel={() => setLogoutPrompt(false)} />}
  </>

  return (
    <>
      <div className="promo-strip"><Gift size={15} /><span>FIRST 20 ORDERS GET A FREE GRILL TONG SET</span><a href="#collection">Shop the collection <ArrowRight size={13} /></a></div>
      <SiteHeader user={user} onAccount={() => setOverlay(user ? 'profile' : 'auth')} onAdmin={openAdmin} />
      <main>
        <section className="hero-section" id="home">
          <div className="hero-copy"><span className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> MADE FOR YOUR NEXT GATHERING</span><h1>Bring the good times<br />to the <em>backyard.</em></h1><p>Durable grill sets made for weekend cookouts, family meals, and stories worth sharing.</p><div className="hero-actions"><a className="primary-button hero-cta" href="#collection">Shop grill sets <ArrowRight size={17} /></a><span><BadgeCheck size={16} /> Built to bring people together</span></div><div className="hero-stats"><div><b>4</b><span>ready-to-grill sets</span></div><div><b>Central Luzon</b><span>delivery coverage</span></div><div><b>48 hrs</b><span>defect report window</span></div></div></div>
          <div className="hero-visual"><img src="/products/grilling-station.png" alt="Stainless steel grilling station with storage" /><div className="hero-image-wash" /><div className="hero-sticker"><Flame size={18} /><span>GOOD FOOD.<br /><b>GOOD PHRENZ.</b></span></div><div className="hero-caption"><span>01 / THE BACKYARD COLLECTION</span><ArrowDownRight size={18} /></div></div>
          <div className="hero-side-note">IT'S ALWAYS A GOOD DAY TO GRILL <span>✳</span></div>
        </section>

        <section className="collection-section section-wrap" id="collection">
          <div className="section-heading"><div><span className="eyebrow">PICK YOUR GRILL</span><h2>Ready for the <em>good stuff.</em></h2></div><p>Designed for real-life gatherings: easy to set up, made to last, and ready to share.</p></div>
          <div className="collection-toolbar"><div className="category-tabs" role="group" aria-label="Filter by grill type">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filteredProducts.length} grill sets</span></div>
          <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addFromHomepage} onView={setSelectedProduct} />)}</div>
        </section>

        <section className="promo-feature" id="story"><div className="promo-photo"><img src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1300&q=85" alt="Freshly grilled food shared around a table" /><span className="photo-label">GRILL MORE. GATHER OFTEN.</span></div><div className="promo-copy"><span className="eyebrow">OUR KIND OF GOOD TIME</span><h2>More than a grill.<br /><em>A story starter.</em></h2><p>Family lunches, friends dropping by, and last-minute get-togethers all deserve a great meal. We bring the grill; you bring the stories.</p><div className="promise-list"><span><Leaf size={17} /> Durable materials</span><span><Truck size={17} /> Central Luzon delivery</span><span><ShieldCheck size={17} /> After-sales support</span></div><a href="#collection" className="text-arrow">Explore grill sets <ArrowRight size={17} /></a></div></section>

        <section className="delivery-band"><div><span className="eyebrow">DELIVERING ACROSS CENTRAL LUZON</span><h2>Your grill is on its way.</h2><p>We deliver throughout Pampanga and Region III. Every order includes a location-based estimated arrival date and status updates.</p></div><button className="outline-light-button" onClick={() => setOverlay('auth')}>Create your account <ArrowRight size={17} /></button></section>
      </main>
      <footer className="site-footer"><a className="wordmark footer-brand" href="#home"><GrillMark /><span>The Grill <b>Phrenz J</b></span></a><p>Made for the people around your table.</p><div><a href="#collection">Shop</a><button onClick={() => setOverlay('auth')}>Create an account</button></div><small>© 2026 The Grill Phrenz J · Storefront demo</small></footer>
      {overlay === 'auth' && <AuthDialog onClose={() => setOverlay(null)} onAuthenticated={handleLogin} />}
      {overlay === 'profile' && user && <ProfileDialog user={user} cartCount={cartCount} onClose={() => setOverlay(null)} onCart={() => setOverlay('cart')} onOrders={() => setOverlay('tracking')} onSave={async (nextUser) => {
        const saved = await saveProfile(nextUser)
        setOverlay(null)
        return saved
      }} onSignOut={requestSignOut} />}
      {overlay === 'cart' && user && <CartDrawer items={cart} user={user} selectedProductIds={selectedCartIds} onChangeSelected={setSelectedCartIds} onClose={() => setOverlay(null)} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.product.id === id ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, item.product.stock)) } : item))} onRemove={(id) => { setCart((current) => current.filter((item) => item.product.id !== id)); setSelectedCartIds((current) => current.filter((itemId) => itemId !== id)) }} onCheckout={checkout} />}
      {overlay === 'tracking' && user && <TrackingDialog orders={customerOrders} onClose={() => setOverlay(null)} onCancel={cancelOrder} />}
      {logoutPrompt && <LogoutConfirmation onConfirm={signOut} onCancel={() => setLogoutPrompt(false)} />}
      {selectedProduct && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}><section className="dialog product-detail-dialog" role="dialog" aria-modal="true"><button className="dialog-close icon-button" onClick={() => setSelectedProduct(null)} aria-label="Close product"><span>×</span></button><img src={selectedProduct.image} alt={selectedProduct.name} /><span className="eyebrow">{selectedProduct.category}</span><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p><div className="materials-note"><b>Materials</b><span>{selectedProduct.materials}</span></div><div className="detail-bottom"><strong>₱{selectedProduct.price.toLocaleString('en-PH')}</strong><button className="primary-button" onClick={() => { addToCart(selectedProduct); setSelectedProduct(null) }}>Add to bag <ArrowRight size={16} /></button></div></section></div>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </>
  )
}

export default App