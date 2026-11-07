import { BadgePercent, Bell, CircleDollarSign, ClipboardList, Home, LogOut, Mail, MapPin, MessageSquareText, PackagePlus, Pencil, Phone, Send, ShieldCheck, Tag, Trash2, Truck, UserRound, UserRoundX } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { GrillMark } from './GrillMark'
import { OrderCostBreakdown } from './OrderCostBreakdown'
import type { AdminCustomer, ChatThread, DeliveryEstimateSettings, LocationOption, Order, OrderStatus, PaymentFeeRate, PaymentFeeSettings, PaymentReport, Product, Promotion, SellerMessage, User } from '../types'

type Props = {
  products: Product[]
  orders: Order[]
  messages: SellerMessage[]
  chatThreads: ChatThread[]
  customers: AdminCustomer[]
  deliveryEstimates: DeliveryEstimateSettings
  promotions: Promotion[]
  paymentFeeSettings: PaymentFeeSettings
  paymentReport: PaymentReport
  onSignOut: () => void
  onSaveProduct: (product: Product) => Promise<Product>
  onDeleteProduct: (id: string) => Promise<void>
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>
  onUpdateCustomer: (id: string, data: Pick<User, 'name' | 'phone' | 'address'>) => Promise<void>
  onSetCustomerActive: (id: string, active: boolean) => Promise<void>
  onDeleteCustomer: (id: string) => Promise<void>
  onSaveDeliveryEstimates: (settings: DeliveryEstimateSettings) => Promise<void>
  onSavePromotion: (promotion: Omit<Promotion, 'id' | 'createdAt'> & { id?: string }) => Promise<Promotion>
  onSetPromotionActive: (id: string, active: boolean) => Promise<void>
  onSavePaymentFeeSettings: (settings: PaymentFeeSettings) => Promise<void>
  onRefreshPaymentReport: () => Promise<void>
  onRefreshChats: () => Promise<void>
  onReplyToChat: (threadId: string, message: string) => Promise<void>
}
const blankProduct = { name: '', category: '', description: '', materials: '', price: '', image: '', stock: '' }
const blankCustomer = { name: '', phone: '', address: '' }
const blankPromotion = { name: '', description: '', discountPercent: '10', freeShipping: false, active: true, startDate: '', expirationDate: '', allowWelcomeStacking: false }

function ProvinceDeliveryDefaultsForm({
  provinces,
  currentDays,
  currentFees,
  onSave,
  onNotice,
}: {
  provinces: LocationOption[]
  currentDays: Record<string, number>
  currentFees: Record<string, number>
  onSave: (days: Record<string, number>, fees: Record<string, number>) => Promise<void>
  onNotice: (message: string) => void
}) {
  const [daysInput, setDaysInput] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(currentDays).map(([code, days]) => [code, String(days)]),
  ))
  const [feesInput, setFeesInput] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(currentFees).map(([code, fee]) => [code, String(fee)]),
  ))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const daysByProvince: Record<string, number> = {}
    const feesByProvince: Record<string, number> = {}
    for (const province of provinces) {
      const days = Number(daysInput[province.code])
      const fee = Number(feesInput[province.code])
      if (!Number.isInteger(days) || days < 1 || days > 60) return onNotice(`Enter between 1 and 60 days for ${province.name}.`)
      if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return onNotice(`Enter a valid shipping fee for ${province.name}.`)
      daysByProvince[province.code] = days
      feesByProvince[province.code] = fee
    }
    try {
      await onSave(daysByProvince, feesByProvince)
      onNotice('Province shipping fees and delivery estimates saved.')
    } catch (reason) { onNotice(reason instanceof Error ? reason.message : 'Unable to save shipping and delivery settings.') }
  }

  return (
    <form className="delivery-defaults-form" onSubmit={(event) => void submit(event)}>
      {provinces.map((province) => <label key={province.code}>{province.name}<span><span>Days</span><input required type="number" min="1" max="60" value={daysInput[province.code] ?? ''} onChange={(event) => setDaysInput((current) => ({ ...current, [province.code]: event.target.value }))} /><span>₱</span><input required type="number" min="0" max="100000" step="0.01" value={feesInput[province.code] ?? ''} onChange={(event) => setFeesInput((current) => ({ ...current, [province.code]: event.target.value }))} /></span></label>)}
      <button className="primary-button compact-button" type="submit">Save province defaults</button>
    </form>
  )
}

function formatDeliveryDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function orderAddress(order: Order) {
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

export function AdminDashboard({ products, orders, messages, chatThreads, customers, deliveryEstimates, promotions, paymentFeeSettings, paymentReport, onSignOut, onSaveProduct, onDeleteProduct, onUpdateStatus, onUpdateCustomer, onSetCustomerActive, onDeleteCustomer, onSaveDeliveryEstimates, onSavePromotion, onSetPromotionActive, onSavePaymentFeeSettings, onRefreshPaymentReport, onRefreshChats, onReplyToChat }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'products' | 'orders' | 'customers' | 'delivery' | 'promotions' | 'payments' | 'messages'>('dashboard')
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(blankProduct)
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null)
  const [customerForm, setCustomerForm] = useState(blankCustomer)
  const [deliveryProvinces, setDeliveryProvinces] = useState<LocationOption[]>([])
  const [deliveryCitiesResult, setDeliveryCitiesResult] = useState<{ provinceCode: string; items: LocationOption[] }>({ provinceCode: '', items: [] })
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('')
  const [selectedCityCode, setSelectedCityCode] = useState('')
  const [cityDaysInput, setCityDaysInput] = useState('')
  const [cityFeeInput, setCityFeeInput] = useState('')
  const [editingPromotionId, setEditingPromotionId] = useState('')
  const [promotionForm, setPromotionForm] = useState(blankPromotion)
  const [feeMethodInput, setFeeMethodInput] = useState('')
  const [feePercentageInput, setFeePercentageInput] = useState('')
  const [feeFixedInput, setFeeFixedInput] = useState('')
  const [feeMinimumInput, setFeeMinimumInput] = useState('')
  const [notice, setNotice] = useState('')
  const [chatReplies, setChatReplies] = useState<Record<string, string>>({})
  const deliveryCities = deliveryCitiesResult.provinceCode === selectedProvinceCode ? deliveryCitiesResult.items : []
  const activeOrders = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status))
  const grossSales = orders.filter((order) => order.status !== 'Cancelled').reduce((total, order) => total + order.total, 0)
  const lowStockProducts = products.filter((product) => product.stock <= 5).length
  const sections = [
    { id: 'dashboard', label: 'Dashboard', detail: 'Store overview', group: 'OVERVIEW', icon: Home },
    { id: 'products', label: 'Products & inventory', detail: 'Catalog and stock', group: 'STORE', icon: PackagePlus, count: products.length },
    { id: 'orders', label: 'Orders & fulfillment', detail: 'Track and process', group: 'STORE', icon: ClipboardList, count: orders.length },
    { id: 'delivery', label: 'Delivery & shipping', detail: 'Coverage and rates', group: 'OPERATIONS', icon: Truck },
    { id: 'customers', label: 'Customer accounts', detail: 'Profiles and access', group: 'COMMUNITY', icon: UserRound, count: customers.length },
    { id: 'messages', label: 'Customer inbox', detail: 'Feedback and direct chats', group: 'COMMUNITY', icon: MessageSquareText, count: messages.length + chatThreads.length },
    { id: 'promotions', label: 'Promotions', detail: 'Offers and discounts', group: 'GROWTH', icon: Tag },
  ] as const
  const sectionDetails: Record<typeof tab, { title: string; description: string }> = {
    dashboard: { title: 'Dashboard', description: 'Store performance and activity at a glance.' },
    products: { title: 'Products', description: 'Manage your grill collection and inventory.' },
    orders: { title: 'Orders', description: 'Review customer orders and keep deliveries moving.' },
    customers: { title: 'Customers', description: 'Manage customer accounts and contact details.' },
    delivery: { title: 'Shipping', description: 'Set delivery estimates and shipping fees.' },
    promotions: { title: 'Promotions', description: 'Manage offers available at checkout.' },
    payments: { title: 'Payments', description: 'Review online payment fees and transaction reports.' },
    messages: { title: 'Messages', description: 'Read private feedback and questions from customers.' },
  }

  useEffect(() => {
    if (tab !== 'messages') return
    const refresh = () => { void onRefreshChats().catch((reason) => setNotice(reason instanceof Error ? reason.message : 'Unable to refresh direct chats.')) }
    refresh()
    const interval = window.setInterval(refresh, 4000)
    return () => window.clearInterval(interval)
  }, [tab, onRefreshChats])

  useEffect(() => {
    const controller = new AbortController()
    api.getDeliveryProvinces(controller.signal).then((items) => {
      setDeliveryProvinces(items)
      setSelectedProvinceCode((current) => current || items[0]?.code || '')
    }).catch((reason) => {
      if (!controller.signal.aborted) setNotice(reason instanceof Error ? reason.message : 'Unable to load delivery provinces.')
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!selectedProvinceCode) return
    const controller = new AbortController()
    api.getDeliveryCities(selectedProvinceCode, controller.signal).then((items) => {
      setDeliveryCitiesResult({ provinceCode: selectedProvinceCode, items })
    }).catch((reason) => {
      if (!controller.signal.aborted) setNotice(reason instanceof Error ? reason.message : 'Unable to load city estimates.')
    })
    return () => controller.abort()
  }, [selectedProvinceCode])

  function startEdit(product?: Product) {
    setEditing(product || null)
    setForm(product ? { name: product.name, category: product.category, description: product.description, materials: product.materials, price: String(product.price), image: product.image, stock: String(product.stock) } : blankProduct)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const product: Product = { id: editing?.id || `grill-${Date.now()}`, name: form.name, category: form.category, description: form.description, materials: form.materials, price: Number(form.price), image: form.image, stock: Number(form.stock), badge: editing?.badge }
    const wasEditing = Boolean(editing)
    try {
      await onSaveProduct(product)
      setNotice(wasEditing ? 'Product updated.' : 'Product added.')
      startEdit()
      window.setTimeout(() => setNotice(''), 2600)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save product.') }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>, customerId: string) {
    event.preventDefault()
    try {
      await onUpdateCustomer(customerId, customerForm)
      setEditingCustomer(null)
      setNotice('Customer account updated.')
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update customer account.') }
  }

  async function saveCityEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCityCode) return setNotice('Select a city or municipality first.')
    if (!cityDaysInput && !cityFeeInput) return setNotice('Enter a delivery estimate, a city shipping fee, or both.')
    const cityDays = { ...deliveryEstimates.cityDays }
    const cityFees = { ...deliveryEstimates.cityFees }
    if (cityDaysInput) {
      const days = Number(cityDaysInput)
      if (!Number.isInteger(days) || days < 1 || days > 60) return setNotice('City delivery estimate must be between 1 and 60 business days.')
      cityDays[selectedCityCode] = days
    } else delete cityDays[selectedCityCode]
    if (cityFeeInput) {
      const fee = Number(cityFeeInput)
      if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return setNotice('City shipping fee must be between ₱0 and ₱100,000.')
      cityFees[selectedCityCode] = fee
    } else delete cityFees[selectedCityCode]
    try {
      await onSaveDeliveryEstimates({ ...deliveryEstimates, cityDays, cityFees })
      setNotice('City shipping and delivery overrides saved.')
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save city overrides.') }
  }

  async function removeCityEstimate() {
    if (!selectedCityCode || !(selectedCityCode in deliveryEstimates.cityDays) && !(selectedCityCode in deliveryEstimates.cityFees)) return
    const cityDays = { ...deliveryEstimates.cityDays }
    const cityFees = { ...deliveryEstimates.cityFees }
    delete cityDays[selectedCityCode]
    delete cityFees[selectedCityCode]
    try {
      await onSaveDeliveryEstimates({ ...deliveryEstimates, cityDays, cityFees })
      setCityDaysInput('')
      setCityFeeInput('')
      setNotice('City overrides removed. Province defaults will be used.')
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to remove city overrides.') }
  }

  async function submitPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const saved = await onSavePromotion({
        ...promotionForm,
        discountPercent: Number(promotionForm.discountPercent),
        ...(editingPromotionId ? { id: editingPromotionId } : {}),
      })
      setEditingPromotionId('')
      setPromotionForm(blankPromotion)
      setNotice(`Promotion "${saved.name}" saved.`)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save promotion.') }
  }

  async function saveFeeRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const method = feeMethodInput.trim()
    const percentage = Number(feePercentageInput)
    const fixed = Number(feeFixedInput || 0)
    const minimum = Number(feeMinimumInput || 0)
    if (!method || !Number.isFinite(percentage) || !Number.isFinite(fixed) || !Number.isFinite(minimum)) return setNotice('Enter a method and valid fee values.')
    const rate: PaymentFeeRate = { method, percentage, fixed, minimum }
    try {
      await onSavePaymentFeeSettings({ rates: { ...paymentFeeSettings.rates, [method.toLowerCase()]: rate } })
      setNotice(`Estimated fee rate for ${method} saved.`)
      setFeeMethodInput('')
      setFeePercentageInput('')
      setFeeFixedInput('')
      setFeeMinimumInput('')
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to save payment fee rates.') }
  }

  async function removeFeeRate(method: string) {
    const rates = { ...paymentFeeSettings.rates }
    delete rates[method.toLowerCase()]
    try {
      await onSavePaymentFeeSettings({ rates })
      setNotice(`Fee estimate for ${method} removed.`)
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to remove the payment fee rate.') }
  }

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <a className="admin-brand" href="#admin-home"><GrillMark size={40} /><span><b>THE GRILL PHRENZ J</b><small>OWNER WORKSPACE</small></span></a>
          <span className="admin-sidebar-label">WORKSPACE</span>
          <nav aria-label="Store management">
            {sections.map(({ id, label, detail, group, icon: Icon, ...entry }, index) => <div className="admin-nav-item" key={id}>
              {index === 0 || sections[index - 1].group !== group ? <span className="admin-nav-group">{group}</span> : null}
              <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
                <Icon size={17} /><span className="admin-nav-copy"><b>{label}</b><small>{detail}</small></span>{'count' in entry && <em>{entry.count}</em>}
              </button>
            </div>)}
          </nav>
          <div className="admin-sidebar-footer">
            <span className="admin-live"><i /> Store is online</span>
            <div className="admin-sidebar-account"><span className="admin-avatar">O</span><span><b>Store Owner</b><small>Administrator</small></span><button className="admin-signout" onClick={onSignOut} aria-label="Sign out"><LogOut size={15} /></button></div>
          </div>
        </aside>
        <div className="admin-main">
          <header className="admin-top">
            <div className="admin-greeting"><span>OWNER WORKSPACE</span><b>Welcome back, Store Owner</b><small>Here’s what’s happening at your store today.</small></div>
            <div className="admin-top-actions">
              <span className="admin-store-toggle"><i /> Store is live</span>
              <button className="admin-notifications" onClick={() => setTab('messages')} aria-label={`Customer inbox, ${messages.length + chatThreads.length} total`} title="View customer inbox"><Bell size={18} />{messages.length + chatThreads.length > 0 && <span>{messages.length + chatThreads.length}</span>}</button>
              <div className="admin-top-user"><span className="admin-avatar">O</span><span><b>Store Owner</b><small>Administrator</small></span></div>
            </div>
          </header>
          <div className="admin-content">
          {tab === 'dashboard' ? <>
            <section className="admin-hero" id="admin-home">
              <div className="admin-hero-copy"><span className="admin-label"><ShieldCheck size={15} /> STORE OVERVIEW</span><h1>Your store,<br /><em>at a glance.</em></h1><p>Keep orders moving, inventory ready, and every customer experience on point.</p></div>
              <div className="admin-hero-image"><img src={products[0]?.image || '/products/grilling-station.png'} alt="Featured grill from the store collection" /><span>BUILT FOR THE GOOD TIMES</span></div>
            </section>
            <section className="admin-stats" aria-label="Store performance">
              <div className="admin-stat-card"><span>Gross sales</span><b>₱{grossSales.toLocaleString('en-PH')}</b><small>All non-cancelled orders</small><i className="admin-stat-icon">₱</i></div>
              <div className="admin-stat-card"><span>Active orders</span><b>{activeOrders.length}</b><small>Orders in progress</small><i className="admin-stat-icon"><Truck size={19} /></i></div>
              <div className="admin-stat-card"><span>Products</span><b>{products.length}</b><small>{lowStockProducts} running low on stock</small><i className="admin-stat-icon"><PackagePlus size={19} /></i></div>
              <div className="admin-stat-card"><span>Customers</span><b>{customers.length}</b><small>Registered accounts</small><i className="admin-stat-icon"><UserRound size={19} /></i></div>
            </section>
            <div className="admin-dashboard-grid">
              <section className="admin-list admin-overview-panel">
                <div className="admin-section-title"><div><h2>Recent orders</h2><span className="admin-muted">Latest activity from your customers</span></div><button className="text-link" onClick={() => setTab('orders')}>View all</button></div>
                {!orders.length ? <p className="empty-admin">Your orders will appear here after the first checkout.</p> : <>
                  <div className="admin-recent-order-head" aria-hidden="true"><span>ORDER</span><span>TOTAL</span><span>STATUS</span></div>
                  {orders.slice(0, 5).map((order) => <article className="admin-recent-order" key={order.id}>
                    <div><b>{order.customer}</b><span>{order.id} · {order.placedAt}</span></div>
                    <strong>₱{order.total.toLocaleString('en-PH')}</strong>
                    <span className={`status-pill status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span>
                  </article>)}
                </>}
              </section>
              <section className="admin-list admin-overview-panel">
                <div className="admin-section-title"><div><h2>Inventory watch</h2><span className="admin-muted">Products that need attention</span></div><PackagePlus size={18} /></div>
                {!lowStockProducts ? <div className="admin-inventory-ok"><span>✓</span><div><b>Everything looks stocked</b><small>No products at or below 5 units.</small></div></div> : products.filter((product) => product.stock <= 5).map((product) => <article className="admin-low-stock" key={product.id}>
                  <img src={product.image} alt="" /><span><b>{product.name}</b><small>Only {product.stock} left in stock</small></span><button className="icon-button" onClick={() => { setTab('products'); startEdit(product) }} aria-label={`Restock ${product.name}`}><Pencil size={15} /></button>
                </article>)}
                <button className="admin-overview-link" onClick={() => setTab('products')}>Manage inventory <PackagePlus size={14} /></button>
              </section>
            </div>
          </> : <>
          <header className="admin-section-heading"><div><span className="eyebrow">STORE MANAGEMENT</span><h1>{sectionDetails[tab].title}</h1><p>{sectionDetails[tab].description}</p></div><span className="admin-section-date">OWNER WORKSPACE</span></header>
      {tab === 'products' ? <div className="admin-products-layout">
        <section className="admin-list"><div className="admin-section-title"><h2>Product inventory</h2><button className="primary-button compact-button" onClick={() => startEdit()}><PackagePlus size={16} /> Add product</button></div>
          {products.map((product) => <article className="inventory-row" key={product.id}><img src={product.image} alt="" /><div className="inventory-info"><b>{product.name}</b><span>{product.category} · {product.stock} in stock</span><strong>₱{product.price.toLocaleString('en-PH')}</strong></div><button className="icon-button" onClick={() => startEdit(product)} aria-label={`Edit ${product.name}`}><Pencil size={16} /></button><button className="icon-button danger-icon" onClick={async () => { if (window.confirm(`Delete ${product.name}?`)) { try { await onDeleteProduct(product.id); setNotice('Product deleted.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to delete product.') } } }} aria-label={`Delete ${product.name}`}><Trash2 size={16} /></button></article>)}
        </section>
        <section className="product-editor"><h2>{editing ? 'Edit product' : 'Add a product'}</h2><p>Details shown in the public catalog.</p><form className="editor-form" onSubmit={submit}>
          <label>Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Category<input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Portable, Complete set..." /></label>
          <label>Description<textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Materials<input required value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} /></label>
          <div className="checkout-grid"><label>Price (₱)<input required type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label><label>Stock<input required type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label></div>
          <label>Product image path or URL<input required value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="/products/grilling-station.png or https://..." /></label>
          {notice && <p className="success-message">{notice}</p>}<button className="primary-button full-button" type="submit">{editing ? 'Save changes' : 'Add product'}</button>
        </form></section>
      </div> : tab === 'orders' ? <section className="admin-list order-admin-list"><div className="admin-section-title"><h2>Order management</h2><span className="admin-muted">Status updates appear in customer tracking.</span></div>{notice && <p className="success-message">{notice}</p>}
        {!orders.length && <p className="empty-admin">No orders yet. New customer checkouts will appear here.</p>}
        {orders.map((order) => <article className="admin-order-row" key={order.id}><div className="admin-order-main"><span className="order-number">{order.id} · {order.placedAt}</span><b>{order.customer}</b><span><MapPin size={13} /> {orderAddress(order)}</span><span>{order.estimatedDeliveryDate ? `Estimated delivery: ${formatDeliveryDate(order.estimatedDeliveryDate)}` : `Estimated ${order.estimatedDeliveryDays ?? order.deliveryDays} business days`}</span><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')} · ₱{order.total.toLocaleString('en-PH')} · {order.payment}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}{order.paymentMethodUsed ? ` · ${order.paymentMethodUsed}` : ''}</span><OrderCostBreakdown order={order} /></div><div className="admin-status-control"><span className={`status-pill status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span><select aria-label={`Update status for ${order.id}`} disabled={order.status === 'Delivered' || order.status === 'Cancelled'} value={order.status} onChange={async (e) => { try { await onUpdateStatus(order.id, e.target.value as OrderStatus); setNotice('Order delivery status updated.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update order status.') } }}><option>Order Placed</option><option>Order Confirmed</option><option>Preparing Order</option><option>Out for Delivery</option><option>Delivered</option><option>Cancelled</option></select>{(order.status === 'Delivered' || order.status === 'Cancelled') && <small>Final status</small>}</div></article>)}
      </section> : tab === 'customers' ? <section className="admin-list order-admin-list customer-accounts-list"><div className="admin-section-title"><div><h2>Customer accounts</h2><span className="admin-muted">Edit customer details or deactivate and remove accounts.</span></div><UserRound size={18} /></div>{notice && <p className="success-message">{notice}</p>}
        {!customers.length ? <p className="empty-admin">No customer accounts yet.</p> : customers.map((customer) => <article className="admin-customer-row" key={customer.id}>
          <div className="admin-customer-info">
            <b>{customer.name}</b>
            <span className="customer-email"><Mail size={14} />{customer.email}</span>
            <div className="customer-contact">
              <span><Phone size={13} />{customer.phone || 'No phone number'}</span>
              <span><MapPin size={13} />{customer.address || 'No delivery address'}</span>
            </div>
            <small className={`customer-status ${customer.active ? 'customer-active' : 'customer-inactive'}`}><i />{customer.active ? 'Active' : 'Deactivated'}</small>
          </div>
          <div className="admin-customer-actions">
            <button className="customer-action customer-action-edit" type="button" onClick={() => { setEditingCustomer(customer.id); setCustomerForm({ name: customer.name, phone: customer.phone, address: customer.address }) }} aria-label={`Edit ${customer.name}`} title="Edit customer"><Pencil size={15} /></button>
            <button
              className={`customer-action ${customer.active ? 'customer-action-deactivate' : 'customer-action-reactivate'}`}
              type="button"
              onClick={async () => {
                try {
                  await onSetCustomerActive(customer.id, !customer.active)
                  setNotice(customer.active ? 'Customer account deactivated.' : 'Customer account reactivated.')
                } catch (reason) {
                  setNotice(reason instanceof Error ? reason.message : 'Unable to update customer account status.')
                }
              }}
            ><UserRoundX size={15} />{customer.active ? 'Deactivate' : 'Reactivate'}</button>
            <button className="customer-action customer-action-delete" type="button" onClick={async () => { if (window.confirm(`Permanently delete ${customer.name}'s account? Existing order records will be kept.`)) { try { await onDeleteCustomer(customer.id); if (editingCustomer === customer.id) setEditingCustomer(null); setNotice('Customer account deleted.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to delete customer account.') } } }} aria-label={`Delete ${customer.name}`} title="Delete customer"><Trash2 size={15} /></button>
          </div>
          {editingCustomer === customer.id && <form className="admin-customer-form" onSubmit={(event) => void submitCustomer(event, customer.id)}>
            <label>Full name<input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label>
            <label>Sign-in email<input type="email" value={customer.email} readOnly /></label>
            <label>Mobile number<input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label>
            <label>Delivery address<input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></label>
            <p className="admin-muted">Sign-in email addresses cannot be changed here.</p>
            <div><button className="primary-button compact-button" type="submit">Save account</button><button className="back-link" type="button" onClick={() => setEditingCustomer(null)}>Cancel</button></div>
          </form>}
        </article>)}
      </section> : tab === 'delivery' ? <section className="admin-list delivery-settings-list">
        <div className="admin-section-title"><div><h2>Shipping fees & delivery estimates</h2><span className="admin-muted">Configure future checkout fees and estimated business days. Existing orders keep their saved totals.</span></div><Truck size={18} /></div>
        <ProvinceDeliveryDefaultsForm key={JSON.stringify([deliveryEstimates.provinceDays, deliveryEstimates.provinceFees])} provinces={deliveryProvinces} currentDays={deliveryEstimates.provinceDays} currentFees={deliveryEstimates.provinceFees} onNotice={setNotice} onSave={(days, fees) => onSaveDeliveryEstimates({ ...deliveryEstimates, provinceDays: days, provinceFees: fees })} />
        <form className="delivery-city-override" onSubmit={(event) => void saveCityEstimate(event)}>
          <h3>City / municipality override</h3>
          <p>Set an optional shipping fee, delivery estimate, or both for a specific city.</p>
          <label>Province<select required value={selectedProvinceCode} onChange={(event) => { setSelectedProvinceCode(event.target.value); setSelectedCityCode(''); setCityDaysInput(''); setCityFeeInput('') }}><option value="">Select province</option>{deliveryProvinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select></label>
          <label>City / Municipality<select required value={selectedCityCode} onChange={(event) => { const cityCode = event.target.value; setSelectedCityCode(cityCode); setCityDaysInput(cityCode && deliveryEstimates.cityDays[cityCode] ? String(deliveryEstimates.cityDays[cityCode]) : ''); setCityFeeInput(cityCode && deliveryEstimates.cityFees[cityCode] !== undefined ? String(deliveryEstimates.cityFees[cityCode]) : '') }} disabled={!deliveryCities.length}><option value="">Select city / municipality</option>{deliveryCities.map((city) => <option key={city.code} value={city.code}>{city.name}</option>)}</select></label>
          <label>Estimated days<input type="number" min="1" max="60" value={cityDaysInput} onChange={(event) => setCityDaysInput(event.target.value)} placeholder="Province default" /></label>
          <label>Shipping fee (₱)<input type="number" min="0" max="100000" step="0.01" value={cityFeeInput} onChange={(event) => setCityFeeInput(event.target.value)} placeholder="Province default" /></label>
          {selectedCityCode && <p className="admin-muted">Current override: {deliveryEstimates.cityDays[selectedCityCode] ? `${deliveryEstimates.cityDays[selectedCityCode]} business days` : 'province delivery estimate'} · {deliveryEstimates.cityFees[selectedCityCode] !== undefined ? `₱${deliveryEstimates.cityFees[selectedCityCode]} shipping` : 'province shipping fee'}</p>}
          <div className="delivery-settings-actions"><button className="primary-button compact-button" type="submit">Save city overrides</button><button className="back-link" type="button" onClick={() => void removeCityEstimate()} disabled={!selectedCityCode || !(selectedCityCode in deliveryEstimates.cityDays) && !(selectedCityCode in deliveryEstimates.cityFees)}>Remove city overrides</button></div>
        </form>
        {notice && <p className="success-message" role="status">{notice}</p>}
      </section> : tab === 'promotions' ? <section className="admin-list admin-promotion-management">
        <div className="admin-section-title"><div><h2>Discount and promotion management</h2><span className="admin-muted">Create customer coupons. Each account can redeem a promotion once.</span></div><BadgePercent size={18} /></div>
        <form className="editor-form promotion-editor" onSubmit={(event) => void submitPromotion(event)}>
          <label>Promotion name<input required maxLength={80} value={promotionForm.name} onChange={(event) => setPromotionForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Description<textarea maxLength={500} rows={2} value={promotionForm.description} onChange={(event) => setPromotionForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="checkout-grid"><label>Discount percentage<input required type="number" min="0" max="100" step="0.01" value={promotionForm.discountPercent} onChange={(event) => setPromotionForm((current) => ({ ...current, discountPercent: event.target.value }))} /></label><label>Start date (optional)<input type="date" value={promotionForm.startDate} onChange={(event) => setPromotionForm((current) => ({ ...current, startDate: event.target.value }))} /></label></div>
          <label>Expiration date (optional)<input type="date" value={promotionForm.expirationDate} onChange={(event) => setPromotionForm((current) => ({ ...current, expirationDate: event.target.value }))} /></label>
          <label className="admin-checkbox-label"><input type="checkbox" checked={promotionForm.freeShipping} onChange={(event) => setPromotionForm((current) => ({ ...current, freeShipping: event.target.checked }))} /> Include free shipping</label>
          <label className="admin-checkbox-label"><input type="checkbox" checked={promotionForm.allowWelcomeStacking} onChange={(event) => setPromotionForm((current) => ({ ...current, allowWelcomeStacking: event.target.checked }))} /> Allow this promotion to combine with the one-time welcome discount</label>
          <label className="admin-checkbox-label"><input type="checkbox" checked={promotionForm.active} onChange={(event) => setPromotionForm((current) => ({ ...current, active: event.target.checked }))} /> Active</label>
          {notice && <p className="success-message" role="status">{notice}</p>}
          <div><button className="primary-button compact-button" type="submit">{editingPromotionId ? 'Save promotion' : 'Create promotion'}</button>{editingPromotionId && <button className="back-link" type="button" onClick={() => { setEditingPromotionId(''); setPromotionForm(blankPromotion) }}>Cancel edit</button>}</div>
        </form>
        <div className="promotion-list">
          {!promotions.length && <p className="empty-admin">No promotions have been created.</p>}
          {promotions.map((promotion) => <article className="promotion-admin-row" key={promotion.id}>
            <div><b>{promotion.name}</b><p>{promotion.description || 'No description'} · {promotion.discountPercent}% off{promotion.freeShipping ? ' · Free shipping' : ''}</p><small>Created {new Date(promotion.createdAt).toLocaleDateString('en-PH')} · {promotion.active ? 'Active' : 'Inactive'}{promotion.allowWelcomeStacking ? ' · Welcome discount stacking enabled' : ''}</small>{(promotion.startDate || promotion.expirationDate) && <small>{promotion.startDate || 'No start date'} – {promotion.expirationDate || 'No expiration'}</small>}</div>
            <div className="promotion-actions"><button className="back-link" type="button" onClick={() => { setEditingPromotionId(promotion.id); setPromotionForm({ name: promotion.name, description: promotion.description, discountPercent: String(promotion.discountPercent), freeShipping: promotion.freeShipping, active: promotion.active, startDate: promotion.startDate, expirationDate: promotion.expirationDate, allowWelcomeStacking: promotion.allowWelcomeStacking }) }}>Edit</button><button className="secondary-button" type="button" onClick={async () => { try { await onSetPromotionActive(promotion.id, !promotion.active); setNotice(`Promotion ${promotion.active ? 'deactivated' : 'activated'}.`) } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update promotion.') } }}>{promotion.active ? 'Deactivate' : 'Activate'}</button></div>
          </article>)}
        </div>
      </section> : tab === 'payments' ? <section className="admin-list payment-fee-management">
        <div className="admin-section-title"><div><h2>Xendit transaction fee estimates</h2><span className="admin-muted">Reports only; transaction fees are never added to customer checkout totals.</span></div><CircleDollarSign size={18} /></div>
        <div className="payment-summary-grid"><article><span>Total paid online sales</span><b>₱{paymentReport.totalOnlineSales.toLocaleString('en-PH')}</b></article><article><span>Estimated transaction fees</span><b>₱{paymentReport.totalEstimatedFees.toLocaleString('en-PH')}</b></article><article><span>Estimated net earnings</span><b>₱{paymentReport.totalEstimatedNet.toLocaleString('en-PH')}</b></article></div>
        <p className="admin-muted">Only successfully paid online orders are counted. Estimates use the fee rates configured below. Configure rates only from your actual Xendit merchant pricing; unknown methods are not assigned an invented fee.</p>
        <form className="editor-form fee-rate-form" onSubmit={(event) => void saveFeeRate(event)}>
          <h3>Configure a verified payment method rate</h3>
          <label>Method name as reported by Xendit<input required maxLength={60} value={feeMethodInput} onChange={(event) => setFeeMethodInput(event.target.value)} placeholder="Enter a method enabled on your account" /></label>
          <div className="checkout-grid"><label>Percentage (%)<input required type="number" min="0" max="100" step="0.01" value={feePercentageInput} onChange={(event) => setFeePercentageInput(event.target.value)} /></label><label>Fixed fee (₱)<input type="number" min="0" step="0.01" value={feeFixedInput} onChange={(event) => setFeeFixedInput(event.target.value)} placeholder="0" /></label></div>
          <label>Minimum fee (₱)<input type="number" min="0" step="0.01" value={feeMinimumInput} onChange={(event) => setFeeMinimumInput(event.target.value)} placeholder="0" /></label>
          <button className="primary-button compact-button" type="submit">Save verified rate</button>
        </form>
        <div className="fee-rate-list">{Object.entries(paymentFeeSettings.rates).map(([key, rate]) => <article className="fee-config-row" key={key}><span><b>{rate.method}</b><small>{rate.percentage}% + ₱{rate.fixed} · minimum ₱{rate.minimum}</small></span><button className="back-link" type="button" onClick={() => void removeFeeRate(rate.method)}>Remove rate</button></article>)}</div>
        <div className="admin-section-title"><h3>Paid online transactions</h3><button className="back-link" type="button" onClick={() => void onRefreshPaymentReport()}>Refresh report</button></div>
        {paymentReport.transactions.some((entry) => entry.estimatedFee === null) && <p className="field-help">Some paid orders have no reported payment method or configured rate. Their fees and net earnings remain unestimated.</p>}
        {!paymentReport.transactions.length ? <p className="empty-admin">No successfully paid online orders yet.</p> : paymentReport.transactions.map((transaction) => <article className="financial-transaction-row" key={transaction.orderId}>
          <div><b>{transaction.orderId} · {transaction.customer}</b><span>Method: {transaction.paymentMethod} · Gross: ₱{transaction.grossAmount.toLocaleString('en-PH')}</span></div>
          <div><span>Estimated fee: {transaction.estimatedFee === null ? 'Not configured' : `₱${transaction.estimatedFee.toLocaleString('en-PH')}`}</span><b>Estimated net: {transaction.estimatedNet === null ? 'Not available' : `₱${transaction.estimatedNet.toLocaleString('en-PH')}`}</b></div>
        </article>)}
      </section> : <section className="admin-list order-admin-list"><div className="admin-section-title"><div><h2>Suggestion & feedback</h2><span className="admin-muted">Product feedback, suggestions, and problem reports.</span></div><MessageSquareText size={18} /></div>
        {!messages.length ? <p className="empty-admin">No customer feedback yet.</p> : messages.map((message) => <article className="seller-message-row" key={message.id}>
          <div className="seller-message-heading"><div><span className="order-number">{message.type.replace('-', ' ')} · {new Date(message.createdAt).toLocaleString('en-PH')}</span><b>{message.customer} · {message.email}</b></div>{message.productName && <span className="seller-message-product">{message.productName}</span>}</div>
          <p>{message.message}</p>
        </article>)}
        <div className="admin-section-title chat-admin-heading"><div><h2>Direct Messenger chats</h2><span className="admin-muted">Replies sync with customer chats automatically.</span></div><button className="back-link" type="button" onClick={() => void onRefreshChats()}>Refresh</button></div>
        {!chatThreads.length ? <p className="empty-admin">No direct chat threads yet.</p> : chatThreads.map((thread) => <article className="admin-chat-thread" key={thread.id}>
          <div className="seller-message-heading"><div><b>{thread.customerName}</b><span>{thread.customerEmail} · Updated {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString('en-PH') : '—'}</span></div></div>
          <div className="admin-chat-messages">{thread.messages.map((item) => <div key={item.id} className={`admin-chat-message ${item.senderRole === 'admin' ? 'from-admin' : ''}`}><b>{item.senderName}</b><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleString('en-PH')}</time></div>)}</div>
          <form className="admin-chat-reply" onSubmit={(event) => {
            event.preventDefault()
            const text = (chatReplies[thread.id] || '').trim()
            if (!text) return
            void onReplyToChat(thread.id, text).then(() => setChatReplies((current) => ({ ...current, [thread.id]: '' }))).catch((reason) => setNotice(reason instanceof Error ? reason.message : 'Unable to send chat reply.'))
          }}>
            <input aria-label={`Reply to ${thread.customerName}`} maxLength={2000} value={chatReplies[thread.id] || ''} onChange={(event) => setChatReplies((current) => ({ ...current, [thread.id]: event.target.value }))} placeholder="Write a reply..." />
            <button type="submit" className="primary-button compact-button" disabled={!(chatReplies[thread.id] || '').trim()}><Send size={14} /> Reply</button>
          </form>
        </article>)}
        {notice && <p className="form-error" role="alert">{notice}</p>}
      </section>}
          </>}
          </div>
        </div>
      </div>
    </main>
  )
}