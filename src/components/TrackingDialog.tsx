import { PackageCheck, X } from 'lucide-react'
import type { Order } from '../types'
import { DeliveryProgress } from './DeliveryProgress'
import { OrderCostBreakdown } from './OrderCostBreakdown'

type Props = { orders: Order[]; onClose: () => void; onCancel: (orderId: string) => void }

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
            <OrderCostBreakdown order={order} />
            <p className="order-destination">{deliveryAddress(order)}</p>
            <p className="order-destination">{order.estimatedDeliveryDate ? `Estimated delivery: ${formatDeliveryDate(order.estimatedDeliveryDate)}` : `Estimated ${order.estimatedDeliveryDays ?? order.deliveryDays} business days`}{order.payment ? ` · ${order.payment}` : ''}{order.paymentStatus ? ` · ${order.paymentStatus}` : ''}{order.paymentMethodUsed ? ` · ${order.paymentMethodUsed}` : ''}</p>
            {order.status === 'Cancelled' ? <p className="terminal-note">This order is cancelled and can no longer be changed.</p> : order.status === 'Delivered' ? <p className="terminal-note">This order is delivered and can no longer be changed.</p> : <>
              <DeliveryProgress status={order.status} />
              {order.status === 'Order Placed' && <button className="cancel-order" onClick={() => onCancel(order.id)}>Cancel order</button>}
            </>}
          </article>)}
        </div>}
      </section>
    </div>
  )
}