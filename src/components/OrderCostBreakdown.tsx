import type { Order } from '../types'

function money(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
}

export function OrderCostBreakdown({ order }: { order: Order }) {
  if (order.productSubtotal === undefined) return null

  return (
    <dl className="order-cost-breakdown">
      <div><dt>Product subtotal</dt><dd>{money(order.productSubtotal)}</dd></div>
      {order.originalShippingFee !== undefined && order.originalShippingFee !== order.shippingFee && <div><dt>Original shipping fee</dt><dd>{money(order.originalShippingFee)}</dd></div>}
      <div><dt>Shipping charged</dt><dd>{money(order.shippingFee || 0)}</dd></div>
      {!!order.welcomeDiscountAmount && <div className="order-discount-row"><dt>Welcome discount</dt><dd>−{money(order.welcomeDiscountAmount)}</dd></div>}
      {!!order.promotionDiscountAmount && <div className="order-discount-row"><dt>{order.promotionName || 'Promotion discount'}</dt><dd>−{money(order.promotionDiscountAmount)}</dd></div>}
      {!!order.freeShippingDiscount && <div className="order-discount-row"><dt>Free shipping discount</dt><dd>−{money(order.freeShippingDiscount)}</dd></div>}
      <div className="order-cost-total"><dt>Order total</dt><dd>{money(order.total)}</dd></div>
    </dl>
  )
}
