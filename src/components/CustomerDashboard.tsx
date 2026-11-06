import { ArrowLeft, ArrowRight, ClipboardList, Flame, LogOut, MessageSquareText, PackageCheck, ShoppingBag, Store, UserRound } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { CartLine, CheckoutDetails } from './CartDrawer'
import { CartDrawer } from './CartDrawer'
import { ProductCard } from './ProductCard'
import type { Order, Product, SellerMessageType, User } from '../types'

type Tab = 'dashboard' | 'shop' | 'cart' | 'orders' | 'messages' | 'profile'
type MessageForm = { type: SellerMessageType; productId: string; message: string }

type Props = {
  user: User
  products: Product[]
  orders: Order[]
  cart: CartLine[]
  onAdd: (product: Product) => void
  onChangeQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onCheckout: (details: CheckoutDetails) => Promise<boolean>
  onCancelOrder: (orderId: string) => void
  onSignOut: () => void
  onSaveProfile: (user: User) => Promise<User>
  onSendMessage: (data: { type: SellerMessageType; productId?: string; message: string }) => Promise<void>
}

const navigation: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ClipboardList },
  { id: 'shop', label: 'Shop products', icon: Store },
  { id: 'orders', label: 'Order tracking', icon: PackageCheck },
  { id: 'messages', label: 'Messages & feedback', icon: MessageSquareText },
]

const headings: Record<Tab, { title: string; description: string }> = {
  dashboard: { title: 'Your dashboard', description: 'A quick look at your orders, cart, and the latest grill sets.' },
  shop: { title: 'Shop products', description: 'Find a grill set that fits your next gathering.' },
  cart: { title: 'Your cart', description: 'Review your selected items before checkout.' },
  orders: { title: 'Order tracking', description: 'Follow your orders and check their latest status.' },
  messages: { title: 'Messages & feedback', description: 'Send private product feedback, a suggestion, or a product report to the seller.' },
  profile: { title: 'My profile', description: 'Keep your contact and delivery information up to date.' },
}

function money(amount: number) {
  return `₱${amount.toLocaleString('en-PH')}`
}

export function CustomerDashboard({
  user, products, orders, cart, onAdd, onChangeQuantity, onRemove, onCheckout, onCancelOrder, onSignOut, onSaveProfile, onSendMessage,
}: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dialog, setDialog] = useState<'cart' | null>(null)
  const [category, setCategory] = useState('All products')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [messageForm, setMessageForm] = useState<MessageForm>({ type: 'product-feedback', productId: '', message: '' })
  const [messageError, setMessageError] = useState('')
  const [messageSuccess, setMessageSuccess] = useState('')
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone, address: user.address })
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + item.product.price * item.quantity, 0)
  const activeOrders = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status))
  const categories = ['All products', ...new Set(products.map((product) => product.category))]
  const filteredProducts = useMemo(
    () => category === 'All products' ? products : products.filter((product) => product.category === category),
    [category, products],
  )

  function chooseTab(next: Tab) {
    setTab(next)
    setSelectedProduct(null)
    setMessageError('')
    setMessageSuccess('')
  }

  function openProductFeedback(product: Product) {
    setMessageForm((current) => ({ ...current, type: 'product-feedback', productId: product.id }))
    setMessageSuccess('')
    setMessageError('')
    setSelectedProduct(null)
    setTab('messages')
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessageError('')
    setMessageSuccess('')
    try {
      await onSendMessage({
        type: messageForm.type,
        ...(messageForm.productId ? { productId: messageForm.productId } : {}),
        message: messageForm.message,
      })
      setMessageForm((current) => ({ ...current, message: '' }))
      setMessageSuccess('Your message was sent privately to the seller. Thank you.')
    } catch (reason) {
      setMessageError(reason instanceof Error ? reason.message : 'Unable to send your message. Please try again.')
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setSavingProfile(true)
    try {
      const saved = await onSaveProfile({ ...user, ...profile })
      setProfile({ name: saved.name, phone: saved.phone, address: saved.address })
      setProfileSuccess('Your profile was updated.')
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : 'Unable to save your profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const content = tab === 'dashboard' ? (
    <>
      <section className="customer-welcome">
        <span className="eyebrow">WELCOME BACK</span>
        <h2>Hi, {user.name}.</h2>
        <p>Ready to find a grill for your next get-together?</p>
        <button className="primary-button" onClick={() => chooseTab('shop')}>Shop grill sets <ArrowRight size={16} /></button>
      </section>
      <div className="customer-stats">
        <button onClick={() => chooseTab('orders')}><span>Active orders</span><strong>{activeOrders.length}</strong><PackageCheck size={18} /></button>
        <button onClick={() => chooseTab('cart')}><span>Items in cart</span><strong>{cartCount}</strong><ShoppingBag size={18} /></button>
        <button onClick={() => chooseTab('orders')}><span>Total orders</span><strong>{orders.length}</strong><ClipboardList size={18} /></button>
      </div>
      <section className="customer-panel">
        <div className="customer-panel-heading"><div><h3>Recent orders</h3><p>Your latest order updates</p></div><button className="text-link" onClick={() => chooseTab('orders')}>View all</button></div>
        {!orders.length ? <p className="customer-empty">Your orders will appear here after checkout.</p> : orders.slice(0, 3).map((order) => (
          <div className="customer-order-row" key={order.id}><div><b>{order.id}</b><span>{order.items.map((item) => item.name).join(', ')}</span></div><strong className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</strong><span>{money(order.total)}</span></div>
        ))}
      </section>
      <section className="customer-panel">
        <div className="customer-panel-heading"><div><h3>Popular grill sets</h3><p>Made for your next gathering</p></div><button className="text-link" onClick={() => chooseTab('shop')}>Shop all</button></div>
        <div className="customer-featured-grid">{products.slice(0, 2).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onView={setSelectedProduct} />)}</div>
      </section>
    </>
  ) : tab === 'shop' ? (
    selectedProduct ? (
      <section className="customer-product-detail">
        <button className="back-link" onClick={() => setSelectedProduct(null)}><ArrowLeft size={15} /> Back to products</button>
        <img src={selectedProduct.image} alt={selectedProduct.name} />
        <span className="eyebrow">{selectedProduct.category}</span><h2>{selectedProduct.name}</h2>
        <p>{selectedProduct.description}</p>
        <div className="materials-note"><b>Materials</b><span>{selectedProduct.materials}</span></div>
        <div className="customer-detail-actions"><strong>{money(selectedProduct.price)}</strong><button className="primary-button" onClick={() => onAdd(selectedProduct)}>Add to cart <ArrowRight size={16} /></button></div>
        <button className="text-link customer-feedback-link" onClick={() => openProductFeedback(selectedProduct)}>Send private feedback about this product</button>
      </section>
    ) : (
      <>
        <div className="customer-shop-toolbar"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filteredProducts.length} products</span></div>
        {filteredProducts.length ? <div className="product-grid customer-product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onView={setSelectedProduct} />)}</div> : <p className="customer-empty">No products in this category yet.</p>}
      </>
    )
  ) : tab === 'cart' ? (
    <section className="customer-panel">
      {!cart.length ? <div className="customer-empty-state"><ShoppingBag size={30} /><h3>Your cart is empty</h3><p>Browse the shop and add a grill set to get started.</p><button className="primary-button" onClick={() => chooseTab('shop')}>Shop products <ArrowRight size={16} /></button></div> : <>
        <div className="customer-panel-heading"><div><h3>{cartCount} item{cartCount === 1 ? '' : 's'}</h3><p>Items saved in your shopping cart</p></div><strong className="customer-cart-total">{money(cartTotal)}</strong></div>
        <div className="cart-lines">{cart.map(({ product, quantity }) => <article className="cart-line" key={product.id}>
          <img src={product.image} alt="" />
          <div className="cart-line-info"><b>{product.name}</b><span>{money(product.price)}</span><div className="quantity-control"><button onClick={() => onChangeQuantity(product.id, -1)} aria-label={`Decrease ${product.name} quantity`}>−</button><span>{quantity}</span><button onClick={() => onChangeQuantity(product.id, 1)} aria-label={`Increase ${product.name} quantity`}>+</button></div></div>
          <button className="remove-button" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name}`}>Remove</button>
        </article>)}</div>
        <div className="customer-cart-footer"><span>Total <strong>{money(cartTotal)}</strong></span><button className="primary-button" onClick={() => setDialog('cart')}>Continue to checkout <ArrowRight size={16} /></button></div>
      </>}
    </section>
  ) : tab === 'orders' ? (
    <section className="customer-order-list">
      {!orders.length ? <div className="customer-empty-state"><PackageCheck size={30} /><h3>No orders yet</h3><p>Your order history and tracking updates will show here.</p><button className="primary-button" onClick={() => chooseTab('shop')}>Shop products <ArrowRight size={16} /></button></div> : orders.map((order) => (
        <article className="customer-tracking-card" key={order.id}>
          <div className="customer-tracking-head"><div><span className="order-number">ORDER {order.id} · {order.placedAt}</span><h3>{order.status}</h3></div><span className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span></div>
          <div className="order-summary"><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</span><strong>{money(order.total)}</strong></div>
          <p className="order-destination">{order.region} · Estimated {order.deliveryDays} business days · {order.payment}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}</p>
          {order.status === 'Pending' && <button className="cancel-order" onClick={() => onCancelOrder(order.id)}>Cancel order</button>}
        </article>
      ))}
    </section>
  ) : tab === 'messages' ? (
    <section className="customer-panel customer-message-panel">
      <div className="customer-panel-heading"><div><h3>Contact the seller</h3><p>Your message is private and will only be shared with the store team.</p></div><MessageSquareText size={20} /></div>
      <form className="editor-form customer-message-form" onSubmit={submitMessage}>
        <label>What would you like to send?
          <select value={messageForm.type} onChange={(event) => {
            const type = event.target.value as SellerMessageType
            setMessageForm((current) => ({ ...current, type, productId: type === 'suggestion' ? '' : current.productId }))
          }}>
            <option value="product-feedback">Product feedback</option><option value="suggestion">Suggestion to seller</option><option value="product-report">Report a product problem</option>
          </select>
        </label>
        {messageForm.type !== 'suggestion' && <label>Product
          <select required value={messageForm.productId} onChange={(event) => setMessageForm((current) => ({ ...current, productId: event.target.value }))}>
            <option value="">Choose a product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
          </select>
        </label>}
        <label>Your message<textarea required minLength={5} maxLength={2000} rows={5} value={messageForm.message} onChange={(event) => setMessageForm((current) => ({ ...current, message: event.target.value }))} placeholder={messageForm.type === 'product-report' ? 'Describe the issue with this product.' : messageForm.type === 'suggestion' ? 'Share your idea with the seller.' : 'Tell us what you think about this product.'} /></label>
        {messageError && <p className="form-error" role="alert">{messageError}</p>}
        {messageSuccess && <p className="success-message" role="status">{messageSuccess}</p>}
        <button type="submit" className="primary-button">Send privately <ArrowRight size={16} /></button>
      </form>
    </section>
  ) : (
    <section className="customer-panel customer-profile-panel">
      <div className="customer-profile-summary">
        <span className="customer-profile-avatar"><UserRound size={23} /></span>
        <div><span className="eyebrow">CUSTOMER ACCOUNT</span><h3>{user.name}</h3><p>{user.email}</p></div>
      </div>
      <form className="editor-form" onSubmit={submitProfile}>
        <label>Full name<input required value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>Email address<input value={user.email} readOnly /></label>
        <label>Mobile number<input required value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label>Delivery address<input required value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} /></label>
        {profileError && <p className="form-error" role="alert">{profileError}</p>}
        {profileSuccess && <p className="success-message" role="status">{profileSuccess}</p>}
        <button className="primary-button" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
      </form>
      <div className="customer-account-exit">
        <span className="customer-exit-icon"><LogOut size={17} /></span>
        <div><b>Sign out of your account</b><span>You can sign back in anytime to manage orders.</span></div>
        <button onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  )

  return (
    <main className="customer-workspace">
      <header className="customer-topbar">
        <a className="wordmark" href="#customer-home"><span className="brand-mark"><Flame size={18} /></span><span>The Grill <b>Phrenz J</b></span></a>
        <nav className="customer-top-nav" aria-label="Customer navigation">
          {navigation.map(({ id }) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => chooseTab(id)}>{id === 'dashboard' ? 'Home' : id === 'shop' ? 'Shop' : id === 'orders' ? 'My orders' : 'Messages'}</button>)}
        </nav>
        <div className="customer-top-actions">
          <button className={`customer-icon-action ${tab === 'cart' ? 'selected' : ''}`} onClick={() => chooseTab('cart')} aria-label={`Shopping cart, ${cartCount} items`} title="Shopping cart">
            <ShoppingBag size={19} /><span className="customer-icon-label">Cart</span>{cartCount > 0 && <strong>{cartCount}</strong>}
          </button>
          <button className={`customer-icon-action ${tab === 'profile' ? 'selected' : ''}`} onClick={() => chooseTab('profile')} aria-label="My profile" title="My profile">
            <UserRound size={19} /><span className="customer-icon-label">Profile</span>
          </button>
        </div>
      </header>
      <div className="customer-layout" id="customer-home">
        <section className="customer-content">
          <div className="customer-page-heading"><div><span className="eyebrow">THE GRILL PHRENZ J</span><h1>{headings[tab].title}</h1><p>{headings[tab].description}</p></div></div>
          {content}
        </section>
      </div>
      {dialog === 'cart' && <CartDrawer items={cart} user={user} onClose={() => setDialog(null)} onChangeQuantity={onChangeQuantity} onRemove={onRemove} onCheckout={async (details) => { if (await onCheckout(details)) setDialog(null) }} />}
    </main>
  )
}
