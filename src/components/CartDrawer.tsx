import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Product, User } from '../types'

export type CartLine = { product: Product; quantity: number }
export type CheckoutDetails = { name: string; email: string; phone: string; address: string; region: string; payment: 'Cash on delivery' | 'Cashless' }
type Props = {
  items: CartLine[]
  onClose: () => void
  onChangeQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onCheckout: (details: CheckoutDetails) => void
  user: User
}

const deliveryWindows: Record<string, string> = { Luzon: '2–4 days', Visayas: '3–6 days', Mindanao: '5–9 days' }

export function CartDrawer({ items, onClose, onChangeQuantity, onRemove, onCheckout, user }: Props) {
  const [details, setDetails] = useState<CheckoutDetails>(() => ({ name: user.name, email: user.email, phone: user.phone, address: user.address, region: 'Mindanao', payment: 'Cash on delivery' }))
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const change = (key: keyof CheckoutDetails, value: string) => setDetails((current) => ({ ...current, [key]: value }))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCheckout(details)
  }

  return (
    <div className="overlay drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-heading"><div><span className="eyebrow">YOUR NEXT GATHERING</span><h2 id="cart-title">Shopping bag <span>{items.length}</span></h2></div><button className="icon-button" onClick={onClose} aria-label="Close bag"><X /></button></div>
        {items.length === 0 ? <div className="empty-cart"><ShoppingBag size={38} /><h3>Your bag is empty.</h3><p>Choose a grill set to get started.</p></div> : <>
          <div className="cart-lines">{items.map(({ product, quantity }) => <article className="cart-line" key={product.id}>
            <img src={product.image} alt="" />
            <div className="cart-line-info"><b>{product.name}</b><span>₱{product.price.toLocaleString('en-PH')}</span><div className="quantity-control"><button onClick={() => onChangeQuantity(product.id, -1)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{quantity}</span><button onClick={() => onChangeQuantity(product.id, 1)} aria-label="Increase quantity"><Plus size={13} /></button></div></div>
            <button className="remove-button" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name}`}><Trash2 size={16} /></button>
          </article>)}</div>
          <form className="checkout-form" onSubmit={submit}>
            <h3>Delivery details</h3>
            <div className="checkout-grid"><label>Full name<input required value={details.name} onChange={(e) => change('name', e.target.value)} placeholder="Juan Dela Cruz" /></label><label>Email<input required type="email" value={user.email} readOnly /></label></div>
            <label>Mobile number<input required type="tel" value={details.phone} onChange={(e) => change('phone', e.target.value)} placeholder="09XX XXX XXXX" /></label>
            <label>Delivery address<input required value={details.address} onChange={(e) => change('address', e.target.value)} placeholder="Barangay, city / municipality" /></label>
            <div className="checkout-grid"><label>Destination region<select value={details.region} onChange={(e) => change('region', e.target.value)}><option>Luzon</option><option>Visayas</option><option>Mindanao</option></select></label><label>Payment method<select value={details.payment} onChange={(e) => change('payment', e.target.value)}><option>Cash on delivery</option><option value="Cashless">Cashless with Xendit</option></select></label></div>
            {details.payment === 'Cashless' && <p className="payment-note">You will continue to Xendit's secure hosted checkout. Payment availability depends on your Xendit account setup.</p>}
            <div className="delivery-estimate"><span>Estimated delivery</span><b>{deliveryWindows[details.region]} from Pampanga</b></div>
            <div className="cart-total"><span>Total</span><strong>₱{total.toLocaleString('en-PH')}</strong></div>
            <button className="primary-button full-button" type="submit">{details.payment === 'Cashless' ? 'Continue to payment' : 'Place order'} <span>→</span></button>
            <p className="checkout-caption">Delivery dates are estimates and may vary by courier and destination.</p>
          </form>
        </>}
      </aside>
    </div>
  )
}