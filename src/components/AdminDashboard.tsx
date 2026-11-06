import { ArrowLeft, MessageSquareText, PackagePlus, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Order, OrderStatus, Product, SellerMessage } from '../types'

type Props = {
  products: Product[]
  orders: Order[]
  messages: SellerMessage[]
  onBack: () => void
  onSaveProduct: (product: Product) => Promise<Product>
  onDeleteProduct: (id: string) => Promise<void>
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>
}
const blankProduct = { name: '', category: '', description: '', materials: '', price: '', image: '', stock: '' }

export function AdminDashboard({ products, orders, messages, onBack, onSaveProduct, onDeleteProduct, onUpdateStatus }: Props) {
  const [tab, setTab] = useState<'products' | 'orders' | 'messages'>('products')
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(blankProduct)
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

  return (
    <main className="admin-page">
      <div className="admin-top"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to shop</button><span className="admin-label"><ShieldCheck size={16} /> ADMIN WORKSPACE</span></div>
      <div className="admin-title-row"><div><span className="eyebrow">THE GRILL PHRENZ J</span><h1>Store dashboard</h1><p>Manage products, orders, and customer delivery updates.</p></div><div className="admin-stats"><div><b>{products.length}</b><span>Products</span></div><div><b>{orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length}</b><span>Active orders</span></div></div></div>
      <div className="admin-tabs" role="tablist"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products <span>{products.length}</span></button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Orders <span>{orders.length}</span></button><button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>Seller messages <span>{messages.length}</span></button></div>
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
      </section> : <section className="admin-list order-admin-list"><div className="admin-section-title"><div><h2>Private messages from customers</h2><span className="admin-muted">Product feedback, suggestions, and problem reports.</span></div><MessageSquareText size={18} /></div>
        {!messages.length ? <p className="empty-admin">No customer messages yet.</p> : messages.map((message) => <article className="seller-message-row" key={message.id}>
          <div className="seller-message-heading"><div><span className="order-number">{message.type.replace('-', ' ')} · {new Date(message.createdAt).toLocaleString('en-PH')}</span><b>{message.customer} · {message.email}</b></div>{message.productName && <span className="seller-message-product">{message.productName}</span>}</div>
          <p>{message.message}</p>
        </article>)}
      </section>}
    </main>
  )
}