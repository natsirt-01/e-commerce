import { Check, PackageCheck, X } from 'lucide-react'
import type { Order, OrderStatus } from '../types'

type Props = { orders: Order[]; onClose: () => void; onCancel: (orderId: string) => void }
const steps: OrderStatus[] = ['Pending', 'On delivery', 'Delivered']

export function TrackingDialog({ orders, onClose, onCancel }: Props) {
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-title">
        <button className="dialog-close icon-button" onClick={onClose} aria-label="Close tracking"><X size={19} /></button>
        <span className="eyebrow">FROM OUR WORKSHOP TO YOUR DOOR</span><h2 id="tracking-title">Order tracking</h2>
        {!orders.length ? <div className="empty-cart tracking-empty"><PackageCheck size={38} /><h3>No orders linked to this account.</h3><p>Place an order at checkout to see tracking updates here.</p></div> : <div className="order-list">
          {orders.map((order) => <article className="order-card" key={order.id}>
            <div className="order-topline"><div><span className="order-number">ORDER {order.id}</span><b>{order.status}</b></div><span className={`status-pill status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span></div>
            <div className="order-summary"><span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</span><strong>₱{order.total.toLocaleString('en-PH')}</strong></div>
            <p className="order-destination">{order.region} · Estimated {order.deliveryDays} business days · {order.payment}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}</p>
            {order.status === 'Cancelled' ? <p className="terminal-note">This order is cancelled and can no longer be changed.</p> : order.status === 'Delivered' ? <p className="terminal-note">This order is delivered and can no longer be changed.</p> : <>
              <div className="tracking-steps">{steps.map((step, index) => {
                const current = steps.indexOf(order.status)
                return <div className={index <= current ? 'tracking-step complete' : 'tracking-step'} key={step}><span>{index < current ? <Check size={13} /> : index + 1}</span><small>{step}</small></div>
              })}</div>
              {order.status === 'Pending' && <button className="cancel-order" onClick={() => onCancel(order.id)}>Cancel order</button>}
            </>}
          </article>)}
        </div>}
      </section>
    </div>
  )
}