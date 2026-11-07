import { ArrowLeft, ArrowRight, ClipboardList, LogOut, MessageCircle, MessageSquareText, PackageCheck, Search, ShoppingBag, Store, UserRound, X } from 'lucide-react'
import { useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { GrillMark } from './GrillMark'
import type { CartLine, CheckoutDetails } from './CartDrawer'
import { CartDrawer } from './CartDrawer'
import { DeliveryProgress } from './DeliveryProgress'
import { OrderCostBreakdown } from './OrderCostBreakdown'
import { MessengerDrawer } from './MessengerDrawer'
import { ProductCard } from './ProductCard'
import { ProfileDialog } from './ProfileDialog'
import type { Order, Product, SellerMessageType, User } from '../types'

type Tab = 'dashboard' | 'shop' | 'orders' | 'messages' | 'seller'
type MessageForm = { type: SellerMessageType; productId: string; message: string }

type Props = {
  user: User
  products: Product[]
  orders: Order[]
  cart: CartLine[]
  selectedCartIds: string[]
  onChangeSelectedCartIds: (ids: string[]) => void
  onAdd: (product: Product) => void
  onChangeQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onCheckout: (details: CheckoutDetails) => Promise<boolean>
  cartOpen: boolean
  onCloseCart: () => void
  onCancelOrder: (orderId: string) => void
  onSignOut: () => void
  onSaveProfile: (user: User) => Promise<User>
  onSendMessage: (data: { type: SellerMessageType; productId?: string; message: string }) => Promise<void>
}

const navigation: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ClipboardList },
  { id: 'shop', label: 'Shop products', icon: Store },
  { id: 'orders', label: 'Order tracking', icon: PackageCheck },
  { id: 'messages', label: 'Suggestion & feedback', icon: MessageSquareText },
]

const headings: Record<Tab, { title: string; description: string }> = {
  dashboard: { title: 'Your dashboard', description: 'A quick look at your orders, cart, and the latest grill sets.' },
  shop: { title: 'Shop products', description: 'Find a grill set that fits your next gathering.' },
  orders: { title: 'Order tracking', description: 'Follow your orders and check their latest status.' },
  messages: { title: 'Suggestion & feedback', description: 'Send product feedback, suggestions, or reports directly to the seller team.' },
  seller: { title: 'Store profile', description: 'Explore products sold by this seller and start a conversation.' },
}

function money(amount: number) {
  return `₱${amount.toLocaleString('en-PH')}`
}

function formatDeliveryDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function deliveryAddress(order: Order) {
  if (!order.deliveryStreetAddress) return `${order.address} · ${order.region}`
  return [
    order.deliveryStreetAddress,
    order.deliveryAdditionalDetails,
    order.deliveryBarangay,
    order.deliveryCity,
    order.deliveryProvince,
    order.deliveryZipCode,
    order.deliveryRegion,
  ].filter(Boolean).join(', ')
}

export function CustomerDashboard({
  user, products, orders, cart, selectedCartIds, onChangeSelectedCartIds, onAdd, onChangeQuantity, onRemove, onCheckout, cartOpen, onCloseCart, onCancelOrder, onSignOut, onSaveProfile, onSendMessage,
}: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dialog, setDialog] = useState<'cart' | null>(null)
  const [directCheckoutLine, setDirectCheckoutLine] = useState<CartLine | null>(null)
  const [directCheckoutSelected, setDirectCheckoutSelected] = useState(true)
  const [category, setCategory] = useState('All products')
  const [search, setSearch] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [messengerOpen, setMessengerOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [messageForm, setMessageForm] = useState<MessageForm>({ type: 'product-feedback', productId: '', message: '' })
  const [messageError, setMessageError] = useState('')
  const [messageSuccess, setMessageSuccess] = useState('')
  function buyNow(product: Product) {
    setDirectCheckoutLine({ product, quantity: 1 })
    setDirectCheckoutSelected(true)
    setDialog('cart')
  }
  function openMessenger(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setMessengerOpen(true)
  }
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const activeOrders = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status))
  const categories = ['All products', ...new Set(products.map((product) => product.category))]
  const filteredProducts = useMemo(() => products.filter((product) => (
    (category === 'All products' || product.category === category)
    && `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [category, products, search])

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
        <button onClick={() => setDialog('cart')}><span>Items in cart</span><strong>{cartCount}</strong><ShoppingBag size={18} /></button>
        <button onClick={() => chooseTab('orders')}><span>Total orders</span><strong>{orders.length}</strong><ClipboardList size={18} /></button>
      </div>
      <section className="customer-panel">
        <div className="customer-panel-heading"><div><h3>Recent orders</h3><p>Your latest order updates</p></div><button className="text-link" onClick={() => chooseTab('orders')}>View all</button></div>
        {!orders.length ? <p className="customer-empty">Your orders will appear here after checkout.</p> : orders.slice(0, 3).map((order) => (
          <div className="customer-order-row" key={order.id}><div><b>{order.id}</b><span>{order.items.map((item) => item.name).join(', ')}</span></div><strong className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</strong><span>{money(order.total)}</span><button className="text-link" onClick={() => setSelectedOrder(order)}>View details</button></div>
        ))}
      </section>
      <section className="customer-panel">
        <div className="customer-panel-heading"><div><h3>Popular grill sets</h3><p>Made for your next gathering</p></div><button className="text-link" onClick={() => chooseTab('shop')}>Shop all</button></div>
        <div className="customer-featured-grid">{products.slice(0, 2).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onBuyNow={buyNow} onView={setSelectedProduct} onSeller={(id) => { setSellerId(id); chooseTab('seller') }} onMessageSeller={() => setMessengerOpen(true)} />)}</div>
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
        <div className="customer-detail-actions"><strong>{money(selectedProduct.price)}</strong><button className="secondary-button" onClick={() => onAdd(selectedProduct)}>Add to cart</button><button className="primary-button" onClick={() => buyNow(selectedProduct)}>Buy now <ArrowRight size={16} /></button></div>
        {selectedProduct.sellerId && <button className="seller-profile-link" onClick={() => { setSellerId(selectedProduct.sellerId!); setSelectedProduct(null); chooseTab('seller') }}><Store size={14} /> Sold by {selectedProduct.sellerName || 'Store seller'} <span>View seller</span></button>}
        <button className="text-link customer-feedback-link" onClick={() => openProductFeedback(selectedProduct)}>Send private feedback about this product</button>
      </section>
    ) : (
      <>
        <div className="shop-search"><Search size={18} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search grill sets by name or category" aria-label="Search products" /><button type="button" onClick={() => setSearch('')} disabled={!search}>Clear</button></div>
        <div className="customer-shop-toolbar"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><span>{filteredProducts.length} products</span></div>
        {filteredProducts.length ? <div className="product-grid customer-product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onBuyNow={buyNow} onView={setSelectedProduct} onSeller={(id) => { setSellerId(id); chooseTab('seller') }} onMessageSeller={() => setMessengerOpen(true)} />)}</div> : <p className="customer-empty">No products match your search. Try another name or category.</p>}
      </>
    )
  ) : tab === 'orders' ? (
    <section className="customer-order-list">
      {!orders.length ? <div className="customer-empty-state"><PackageCheck size={30} /><h3>No orders yet</h3><p>Your order history and tracking updates will show here.</p><button className="primary-button" onClick={() => chooseTab('shop')}>Shop products <ArrowRight size={16} /></button></div> : orders.map((order) => (
        <article className="customer-tracking-card" key={order.id}>
          <div className="customer-tracking-head"><div><span className="order-number">ORDER {order.id} · {order.placedAt}</span><h3>{order.status}</h3></div><span className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span></div>
          <div className="order-summary"><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</span><strong>{money(order.total)}</strong></div>
          <div className="customer-order-card-actions"><button type="button" className="secondary-button" onClick={() => setSelectedOrder(order)}>View details</button>{order.status === 'Order Placed' && <button className="cancel-order" onClick={() => onCancelOrder(order.id)}>Cancel order</button>}</div>
          {order.status === 'Cancelled' ? <p className="terminal-note">This order is cancelled.</p> : <DeliveryProgress status={order.status} />}
        </article>
      ))}
    </section>
  ) : tab === 'messages' ? (
    <section className="customer-panel customer-message-panel">
      <div className="customer-panel-heading"><div><h3>Suggestion & feedback</h3><p>Send product feedback, suggestions, or reports privately to the seller team.</p></div><MessageSquareText size={20} /></div>
      <button className="messenger-launch" onClick={() => setMessengerOpen(true)}><MessageCircle size={17} /> Start a direct chat with the seller</button>
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
  ) : selectedProduct ? (
    <section className="customer-product-detail">
      <button className="back-link" onClick={() => setSelectedProduct(null)}><ArrowLeft size={15} /> Back to seller products</button>
      <img src={selectedProduct.image} alt={selectedProduct.name} />
      <span className="eyebrow">{selectedProduct.category}</span><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p>
      <div className="materials-note"><b>Materials</b><span>{selectedProduct.materials}</span></div>
      <div className="customer-detail-actions"><strong>{money(selectedProduct.price)}</strong><button className="secondary-button" onClick={() => onAdd(selectedProduct)}>Add to cart</button><button className="primary-button" onClick={() => buyNow(selectedProduct)}>Buy now <ArrowRight size={16} /></button></div>
      <button className="text-link customer-feedback-link" onClick={() => openProductFeedback(selectedProduct)}>Send private feedback about this product</button>
    </section>
  ) : (
    <section className="seller-profile-panel">
      <div className="seller-profile-heading"><span className="seller-profile-avatar"><Store size={23} /></span><div><span className="eyebrow">VERIFIED STORE · {sellerId}</span><h2>The Grill Phrenz J</h2><p>Grill sets and accessories for your next gathering.</p></div><button className="primary-button" onClick={() => setMessengerOpen(true)}><MessageCircle size={16} /> Message seller</button></div>
      <div className="customer-shop-toolbar"><span>{products.filter((product) => product.sellerId === sellerId).length} products from this seller</span><button className="text-link" onClick={() => chooseTab('shop')}>Back to all products</button></div>
      <div className="product-grid customer-product-grid">{products.filter((product) => product.sellerId === sellerId).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onBuyNow={buyNow} onView={setSelectedProduct} onSeller={(id) => { setSellerId(id); chooseTab('seller') }} onMessageSeller={() => setMessengerOpen(true)} />)}</div>
    </section>
  )

  return (
    <main className="customer-workspace">
      <header className="customer-topbar">
        <a className="wordmark" href="#customer-home"><GrillMark size={36} /><span>The Grill <b>Phrenz J</b></span></a>
        <nav className="customer-top-nav" aria-label="Customer navigation">
          {navigation.map(({ id }) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => chooseTab(id)}>{id === 'dashboard' ? 'Home' : id === 'shop' ? 'Shop' : id === 'orders' ? 'My orders' : 'Suggestion & feedback'}</button>)}
        </nav>
        <div className="customer-top-actions">
          <button className="customer-icon-action" onClick={() => setDialog('cart')} aria-label={`Shopping cart, ${cartCount} items`} title="Shopping cart">
            <ShoppingBag size={19} /><span className="customer-icon-label">Cart</span>{cartCount > 0 && <strong>{cartCount}</strong>}
          </button>
          <button type="button" className="customer-icon-action" onClick={openMessenger} aria-label="Messenger" aria-expanded={messengerOpen} aria-controls="customer-messenger-drawer" title="Message the seller">
            <MessageCircle size={19} /><span className="customer-icon-label">Chat</span>
          </button>
          <button className="customer-icon-action customer-profile-top" onClick={() => setProfileOpen(true)} aria-label="My profile" title="My profile">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <UserRound size={19} />}<span className="customer-icon-label">Profile</span>
          </button>
          <button className="customer-icon-action customer-signout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} /><span className="customer-icon-label">Sign out</span>
          </button>
        </div>
      </header>
      <div className="customer-layout" id="customer-home">
        <section className="customer-content">
          <div className="customer-page-heading"><div><span className="eyebrow">THE GRILL PHRENZ J</span><h1>{headings[tab].title}</h1><p>{headings[tab].description}</p></div></div>
          {content}
        </section>
      </div>
      {(dialog === 'cart' || cartOpen) && <CartDrawer
        items={directCheckoutLine ? [directCheckoutLine] : cart}
        user={user}
        selectedProductIds={directCheckoutLine ? (directCheckoutSelected ? [directCheckoutLine.product.id] : []) : selectedCartIds}
        onChangeSelected={(ids) => {
          if (directCheckoutLine) setDirectCheckoutSelected(ids.includes(directCheckoutLine.product.id))
          else onChangeSelectedCartIds(ids)
        }}
        onClose={() => { setDialog(null); setDirectCheckoutLine(null); onCloseCart() }}
        onChangeQuantity={(id, delta) => {
          if (directCheckoutLine?.product.id === id) {
            setDirectCheckoutLine((current) => current && current.product.id === id
              ? { ...current, quantity: Math.max(1, Math.min(current.quantity + delta, current.product.stock)) }
              : current)
          } else onChangeQuantity(id, delta)
        }}
        onRemove={(id) => {
          if (directCheckoutLine?.product.id === id) {
            setDirectCheckoutLine(null)
            setDialog(null)
          } else onRemove(id)
        }}
        onCheckout={async (details) => {
          const completed = await onCheckout(details)
          if (completed) {
            setDialog(null)
            setDirectCheckoutLine(null)
            onCloseCart()
          }
          return completed
        }}
      />}
      {profileOpen && <ProfileDialog user={user} cartCount={cartCount} drawer onClose={() => setProfileOpen(false)} onCart={() => { setProfileOpen(false); setDialog('cart') }} onOrders={() => { setProfileOpen(false); chooseTab('orders') }} onSave={onSaveProfile} onSignOut={onSignOut} />}
      {messengerOpen && <MessengerDrawer user={user} onClose={() => setMessengerOpen(false)} />}
      {selectedOrder && <div className="overlay order-details-overlay" onMouseDown={(event) => event.target === event.currentTarget && setSelectedOrder(null)}><section className="dialog order-details-dialog" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
        <button className="dialog-close icon-button" onClick={() => setSelectedOrder(null)} aria-label="Close order details"><X size={19} /></button>
        <span className="eyebrow">ORDER DETAILS · {selectedOrder.placedAt}</span><h2 id="order-details-title">{selectedOrder.id}</h2>
        <div className="customer-tracking-head"><h3>{selectedOrder.status}</h3><span className={`status-pill status-${selectedOrder.status.toLowerCase().replace(' ', '-')}`}>{selectedOrder.status}</span></div>
        <section className="order-detail-section"><h3>Purchased items</h3>{selectedOrder.items.map((item) => <div className="order-detail-item" key={item.productId}><span>{item.quantity} × {item.name}</span><b>{money(item.price * item.quantity)}</b></div>)}</section>
        <OrderCostBreakdown order={selectedOrder} />
        <section className="order-detail-section"><h3>Delivery information</h3><p>{deliveryAddress(selectedOrder)}</p><p>{selectedOrder.estimatedDeliveryDate ? `Estimated delivery: ${formatDeliveryDate(selectedOrder.estimatedDeliveryDate)}` : `Estimated ${selectedOrder.estimatedDeliveryDays ?? selectedOrder.deliveryDays} business days`}</p></section>
        <section className="order-detail-section"><h3>Payment</h3><p>{selectedOrder.payment || 'Not specified'} · {selectedOrder.paymentStatus || 'Payment pending'}{selectedOrder.paymentMethodUsed ? ` · ${selectedOrder.paymentMethodUsed}` : ''}</p></section>
        <section className="order-detail-section"><h3>Tracking history</h3>{selectedOrder.status === 'Cancelled' ? <p className="terminal-note">This order is cancelled.</p> : <DeliveryProgress status={selectedOrder.status} />}</section>
      </section></div>}
    </main>
  )
}
