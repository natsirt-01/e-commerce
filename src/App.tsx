import { ArrowDownRight, ArrowRight, BadgeCheck, Flame, Gift, Leaf, ShieldCheck, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AdminDashboard } from './components/AdminDashboard'
import { AuthDialog } from './components/AuthDialog'
import { CartDrawer, type CartLine, type CheckoutDetails } from './components/CartDrawer'
import { CustomerDashboard } from './components/CustomerDashboard'
import { ProductCard } from './components/ProductCard'
import { ProfileDialog } from './components/ProfileDialog'
import { SiteHeader } from './components/SiteHeader'
import { TrackingDialog } from './components/TrackingDialog'
import { initialProducts } from './data/products'
import { api } from './lib/api'
import type { Order, OrderStatus, Product, SellerMessageType, SellerMessage, User } from './types'
import './App.css'

type Overlay = 'auth' | 'profile' | 'cart' | 'tracking' | null
const demoOrder: Order = {
  id: 'TGJ-1042', customer: 'Demo Customer', email: 'demo@grillphrenz.ph', address: 'Demo address, Davao City', region: 'Mindanao',
  items: [{ productId: 'portable-002', name: 'Portable Grill Set', quantity: 1, price: 3290 }], total: 3290,
  payment: 'Cash on delivery', status: 'On delivery', placedAt: 'Nov 06, 2026', deliveryDays: 7,
}

function readOrders(): Order[] {
  try {
    const stored = localStorage.getItem('grill-orders')
    return stored ? JSON.parse(stored) as Order[] : [demoOrder]
  } catch { return [demoOrder] }
}

function App() {
  const [products, setProducts] = useState(initialProducts)
  const [orders, setOrders] = useState(readOrders)
  const [cart, setCart] = useState<CartLine[]>([])
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('grill-user') || 'null') as User | null } catch { return null }
  })
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [adminMode, setAdminMode] = useState(false)
  const [customerMode, setCustomerMode] = useState(false)
  const [sellerMessages, setSellerMessages] = useState<SellerMessage[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [category, setCategory] = useState('All grills')
  const [toast, setToast] = useState('')
  const categories = ['All grills', ...new Set(products.map((product) => product.category))]
  const filteredProducts = useMemo(() => category === 'All grills' ? products : products.filter((product) => product.category === category), [category, products])
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const customerOrders = user?.role === 'admin' ? orders : user ? orders.filter((order) => order.email === user.email) : []

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => showToast('API offline; showing built-in demo products.'))
    const storedToken = localStorage.getItem('grill-session-token')
    const loadOrders = () => api.getOrders().then(setOrders).catch(() => undefined)
    if (storedToken) {
      api.getMe().then((currentUser) => {
        setUser(currentUser)
        setCustomerMode(currentUser.role === 'customer')
        localStorage.setItem('grill-user', JSON.stringify(currentUser))
      }).catch(() => {
        api.clearSession()
        localStorage.removeItem('grill-user')
        setUser(null)
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
    setAdminMode(false)
    localStorage.setItem('grill-user', JSON.stringify(nextUser))
    api.getOrders().then(setOrders).catch(() => undefined)
    setOverlay(null)
    showToast(`Welcome, ${nextUser.name}!`)
  }

  function addToCart(product: Product) {
    if (!user) {
      setOverlay('auth')
      return
    }
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing ? current.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item) : [...current, { product, quantity: 1 }]
    })
    showToast(`${product.name} added to your bag.`)
  }

  async function checkout(details: CheckoutDetails): Promise<boolean> {
    if (!user) {
      setOverlay('auth')
      return false
    }
    if (!cart.length) return false
    try {
      const result = await api.createOrder({ ...details, items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })) })
      const order = result.order
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setCart([])
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
    const saved = await api.updateProfile({ name: nextUser.name, phone: nextUser.phone, address: nextUser.address })
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
    try { setSellerMessages(await api.getAdminMessages()) }
    catch (reason) { showToast(reason instanceof Error ? reason.message : 'Unable to load seller messages.') }
  }

  function signOut() {
    setUser(null)
    setCart([])
    setCustomerMode(false)
    setAdminMode(false)
    api.clearSession()
    localStorage.removeItem('grill-user')
    setOverlay(null)
  }

  if (adminMode && user?.role === 'admin') return <AdminDashboard products={products} orders={orders} messages={sellerMessages} onBack={() => setAdminMode(false)} onSaveProduct={async (product) => {
    const saved = products.some((item) => item.id === product.id) ? await api.updateProduct(product) : await api.createProduct(product)
    setProducts((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
    return saved
  }} onDeleteProduct={async (id) => {
    await api.deleteProduct(id)
    setProducts((current) => current.filter((product) => product.id !== id))
  }} onUpdateStatus={changeStatus} />

  if (customerMode && user?.role === 'customer') return <>
    <CustomerDashboard
      user={user}
      products={products}
      orders={customerOrders}
      cart={cart}
      onAdd={addToCart}
      onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.product.id === id ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, item.product.stock)) } : item))}
      onRemove={(id) => setCart((current) => current.filter((item) => item.product.id !== id))}
      onCheckout={checkout}
      onCancelOrder={cancelOrder}
      onSignOut={signOut}
      onSaveProfile={saveProfile}
      onSendMessage={sendSellerMessage}
    />
    {toast && <div className="toast-message" role="status">{toast}</div>}
  </>

  return (
    <>
      <div className="promo-strip"><Gift size={15} /><span>FIRST 20 ORDERS GET A FREE GRILL TONG SET</span><a href="#collection">Shop the collection <ArrowRight size={13} /></a></div>
      <SiteHeader user={user} onAccount={() => setOverlay(user ? 'profile' : 'auth')} onAdmin={openAdmin} />
      <main>
        <section className="hero-section" id="home">
          <div className="hero-copy"><span className="eyebrow hero-eyebrow"><span className="eyebrow-dot" /> MADE FOR YOUR NEXT GATHERING</span><h1>Bring the good times<br />to the <em>backyard.</em></h1><p>Durable grill sets made for weekend cookouts, family meals, and stories worth sharing.</p><div className="hero-actions"><a className="primary-button hero-cta" href="#collection">Shop grill sets <ArrowRight size={17} /></a><span><BadgeCheck size={16} /> Built to bring people together</span></div><div className="hero-stats"><div><b>4</b><span>ready-to-grill sets</span></div><div><b>Nationwide</b><span>delivery available</span></div><div><b>48 hrs</b><span>defect report window</span></div></div></div>
          <div className="hero-visual"><img src="/products/grilling-station.png" alt="Stainless steel grilling station with storage" /><div className="hero-image-wash" /><div className="hero-sticker"><Flame size={18} /><span>GOOD FOOD.<br /><b>GOOD PHRENZ.</b></span></div><div className="hero-caption"><span>01 / THE BACKYARD COLLECTION</span><ArrowDownRight size={18} /></div></div>
          <div className="hero-side-note">IT'S ALWAYS A GOOD DAY TO GRILL <span>✳</span></div>
        </section>

        <section className="collection-section section-wrap" id="collection">
          <div className="section-heading"><div><span className="eyebrow">PICK YOUR GRILL</span><h2>Ready for the <em>good stuff.</em></h2></div><p>Designed for real-life gatherings: easy to set up, made to last, and ready to share.</p></div>
          <div className="collection-toolbar"><div className="category-tabs" role="group" aria-label="Filter by grill type">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filteredProducts.length} grill sets</span></div>
          <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onView={setSelectedProduct} />)}</div>
        </section>

        <section className="promo-feature" id="story"><div className="promo-photo"><img src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1300&q=85" alt="Freshly grilled food shared around a table" /><span className="photo-label">GRILL MORE. GATHER OFTEN.</span></div><div className="promo-copy"><span className="eyebrow">OUR KIND OF GOOD TIME</span><h2>More than a grill.<br /><em>A story starter.</em></h2><p>Family lunches, friends dropping by, and last-minute get-togethers all deserve a great meal. We bring the grill; you bring the stories.</p><div className="promise-list"><span><Leaf size={17} /> Durable materials</span><span><Truck size={17} /> Nationwide delivery</span><span><ShieldCheck size={17} /> After-sales support</span></div><a href="#collection" className="text-arrow">Explore grill sets <ArrowRight size={17} /></a></div></section>

        <section className="delivery-band"><div><span className="eyebrow">FROM PAMPANGA TO YOUR DOOR</span><h2>Your grill is on its way.</h2><p>Mindanao deliveries usually take 5–9 business days. Every order includes an estimated arrival window and status updates.</p></div><button className="outline-light-button" onClick={() => setOverlay('auth')}>Create your account <ArrowRight size={17} /></button></section>
      </main>
      <footer className="site-footer"><a className="wordmark footer-brand" href="#home"><span className="brand-mark"><Flame size={18} /></span><span>The Grill <b>Phrenz J</b></span></a><p>Made for the people around your table.</p><div><a href="#collection">Shop</a><button onClick={() => setOverlay('auth')}>Create an account</button></div><small>© 2026 The Grill Phrenz J · Storefront demo</small></footer>
      {overlay === 'auth' && <AuthDialog onClose={() => setOverlay(null)} onAuthenticated={handleLogin} />}
      {overlay === 'profile' && user && <ProfileDialog user={user} cartCount={cartCount} onClose={() => setOverlay(null)} onCart={() => setOverlay('cart')} onOrders={() => setOverlay('tracking')} onSave={async (nextUser) => {
        try {
          const saved = await saveProfile(nextUser)
          setUser(saved); setOverlay(null)
        } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Unable to save profile changes.') }
      }} onSignOut={signOut} />}
      {overlay === 'cart' && user && <CartDrawer items={cart} user={user} onClose={() => setOverlay(null)} onChangeQuantity={(id, delta) => setCart((current) => current.map((item) => item.product.id === id ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, item.product.stock)) } : item))} onRemove={(id) => setCart((current) => current.filter((item) => item.product.id !== id))} onCheckout={checkout} />}
      {overlay === 'tracking' && user && <TrackingDialog orders={customerOrders} onClose={() => setOverlay(null)} onCancel={cancelOrder} />}
      {selectedProduct && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}><section className="dialog product-detail-dialog" role="dialog" aria-modal="true"><button className="dialog-close icon-button" onClick={() => setSelectedProduct(null)} aria-label="Close product"><span>×</span></button><img src={selectedProduct.image} alt={selectedProduct.name} /><span className="eyebrow">{selectedProduct.category}</span><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p><div className="materials-note"><b>Materials</b><span>{selectedProduct.materials}</span></div><div className="detail-bottom"><strong>₱{selectedProduct.price.toLocaleString('en-PH')}</strong><button className="primary-button" onClick={() => { addToCart(selectedProduct); setSelectedProduct(null) }}>Add to bag <ArrowRight size={16} /></button></div></section></div>}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </>
  )
}

export default App