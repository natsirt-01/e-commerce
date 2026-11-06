import { LogOut, MessageSquareText, PackagePlus, Pencil, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { AdminCustomer, Order, OrderStatus, Product, SellerMessage, User } from '../types'

type Props = {
  products: Product[]
  orders: Order[]
  messages: SellerMessage[]
  customers: AdminCustomer[]
  onSignOut: () => void
  onSaveProduct: (product: Product) => Promise<Product>
  onDeleteProduct: (id: string) => Promise<void>
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>
  onUpdateCustomer: (id: string, data: Pick<User, 'name' | 'phone' | 'address'>) => Promise<void>
  onSetCustomerActive: (id: string, active: boolean) => Promise<void>
  onDeleteCustomer: (id: string) => Promise<void>
}
const blankProduct = { name: '', category: '', description: '', materials: '', price: '', image: '', stock: '' }
const blankCustomer = { name: '', phone: '', address: '' }

export function AdminDashboard({ products, orders, messages, customers, onSignOut, onSaveProduct, onDeleteProduct, onUpdateStatus, onUpdateCustomer, onSetCustomerActive, onDeleteCustomer }: Props) {
  const [tab, setTab] = useState<'products' | 'orders' | 'customers' | 'messages'>('products')
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(blankProduct)
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null)
  const [customerForm, setCustomerForm] = useState(blankCustomer)
  const [notice, setNotice] = useState('')

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

  return (
    <main className="admin-page">
      <div className="admin-top"><span className="admin-label"><ShieldCheck size={16} /> ADMIN WORKSPACE</span><button className="back-link" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div>
      <div className="admin-title-row"><div><span className="eyebrow">THE GRILL PHRENZ J</span><h1>Store dashboard</h1><p>Manage products, customer accounts, orders, and messages.</p></div><div className="admin-stats"><div><b>{products.length}</b><span>Products</span></div><div><b>{customers.length}</b><span>Customer accounts</span></div><div><b>{orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length}</b><span>Active orders</span></div></div></div>
      <div className="admin-tabs" role="tablist"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products <span>{products.length}</span></button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Orders <span>{orders.length}</span></button><button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>Customers <span>{customers.length}</span></button><button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>Messages <span>{messages.length}</span></button></div>
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
        {orders.map((order) => <article className="admin-order-row" key={order.id}><div className="admin-order-main"><span className="order-number">{order.id} · {order.placedAt}</span><b>{order.customer}</b><span>{order.address} · {order.region}</span><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')} · ₱{order.total.toLocaleString('en-PH')} · {order.payment}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}</span></div><div className="admin-status-control"><span className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span><select aria-label={`Update status for ${order.id}`} disabled={order.status === 'Delivered' || order.status === 'Cancelled'} value={order.status} onChange={async (e) => { try { await onUpdateStatus(order.id, e.target.value as OrderStatus); setNotice('Order status updated.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update order status.') } }}><option>Pending</option><option>On delivery</option><option>Delivered</option><option>Cancelled</option></select>{(order.status === 'Delivered' || order.status === 'Cancelled') && <small>Final status</small>}</div></article>)}
      </section> : tab === 'customers' ? <section className="admin-list order-admin-list"><div className="admin-section-title"><div><h2>Customer accounts</h2><span className="admin-muted">Edit customer details or deactivate and remove accounts.</span></div><UserRound size={18} /></div>{notice && <p className="success-message">{notice}</p>}
        {!customers.length ? <p className="empty-admin">No customer accounts yet.</p> : customers.map((customer) => <article className="admin-customer-row" key={customer.id}>
          <div className="admin-customer-info"><b>{customer.name}</b><span>{customer.email}</span><span>{customer.phone || 'No phone number'} · {customer.address || 'No delivery address'}</span><small className={customer.active ? 'customer-active' : 'customer-inactive'}>{customer.active ? 'Active' : 'Deactivated'}</small></div>
          <div className="admin-customer-actions">
            <button className="icon-button" onClick={() => { setEditingCustomer(customer.id); setCustomerForm({ name: customer.name, phone: customer.phone, address: customer.address }) }} aria-label={`Edit ${customer.name}`}><Pencil size={15} /></button>
            <button className="icon-button" onClick={async () => { try { await onSetCustomerActive(customer.id, !customer.active); setNotice(customer.active ? 'Customer account deactivated.' : 'Customer account reactivated.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to update customer account status.') } }}>{customer.active ? 'Deactivate' : 'Reactivate'}</button>
            <button className="icon-button danger-icon" onClick={async () => { if (window.confirm(`Permanently delete ${customer.name}'s account? Existing order records will be kept.`)) { try { await onDeleteCustomer(customer.id); if (editingCustomer === customer.id) setEditingCustomer(null); setNotice('Customer account deleted.') } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to delete customer account.') } } }} aria-label={`Delete ${customer.name}`}><Trash2 size={15} /></button>
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
      </section> : <section className="admin-list order-admin-list"><div className="admin-section-title"><div><h2>Private messages from customers</h2><span className="admin-muted">Product feedback, suggestions, and problem reports.</span></div><MessageSquareText size={18} /></div>
        {!messages.length ? <p className="empty-admin">No customer messages yet.</p> : messages.map((message) => <article className="seller-message-row" key={message.id}>
          <div className="seller-message-heading"><div><span className="order-number">{message.type.replace('-', ' ')} · {new Date(message.createdAt).toLocaleString('en-PH')}</span><b>{message.customer} · {message.email}</b></div>{message.productName && <span className="seller-message-product">{message.productName}</span>}</div>
          <p>{message.message}</p>
        </article>)}
      </section>}
    </main>
  )
}