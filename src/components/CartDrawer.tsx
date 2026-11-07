import { Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { AvailablePromotions, CheckoutQuote, DeliveryAddress, Product, User } from '../types'
import { api } from '../lib/api'
import { CentralLuzonAddressFields } from './CentralLuzonAddressFields'

export type CartLine = { product: Product; quantity: number }
export type CheckoutDetails = DeliveryAddress & {
  name: string
  email: string
  phone: string
  payment: 'Cash on delivery' | 'Cashless'
  selectedItems: { productId: string; quantity: number }[]
  checkoutRequestId: string
  promotionId?: string
  applyWelcomeDiscount: boolean
}
type Props = {
  items: CartLine[]
  onClose: () => void
  onChangeQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onCheckout: (details: CheckoutDetails) => Promise<boolean>
  user: User
  selectedProductIds: string[]
  onChangeSelected: (productIds: string[]) => void
}

function money(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
}

export function CartDrawer({ items, onClose, onChangeQuantity, onRemove, onCheckout, user, selectedProductIds, onChangeSelected }: Props) {
  const [details, setDetails] = useState<Omit<CheckoutDetails, 'selectedItems' | 'checkoutRequestId' | 'promotionId' | 'applyWelcomeDiscount'>>(() => ({
    name: user.name,
    email: user.email,
    phone: user.phone,
    payment: 'Cash on delivery',
    deliveryRegion: 'Central Luzon (Region III)',
    deliveryProvinceCode: '',
    deliveryProvince: '',
    deliveryCityCode: '',
    deliveryCity: '',
    deliveryBarangayCode: '',
    deliveryBarangay: '',
    deliveryZipCode: '',
    deliveryStreetAddress: '',
    deliveryAdditionalDetails: '',
  }))
  const [promotions, setPromotions] = useState<AvailablePromotions | null>(null)
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [discountsOpen, setDiscountsOpen] = useState(false)
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [promotionsError, setPromotionsError] = useState('')
  const [appliedPromotionId, setAppliedPromotionId] = useState('')
  const [applyWelcomeDiscount, setApplyWelcomeDiscount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const checkoutRequestId = useRef('')
  const promotionsRequestId = useRef(0)
  const selectedIds = useMemo(() => new Set(selectedProductIds), [selectedProductIds])
  const selectedItems = useMemo(
    () => items.filter(({ product }) => selectedIds.has(product.id)),
    [items, selectedIds],
  )
  const selectedSubtotal = selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const allSelected = items.length > 0 && selectedItems.length === items.length
  const selectedPromotion = promotions?.promotions.find((promotion) => promotion.id === appliedPromotionId)

  const changeAddress = useCallback((updates: Partial<DeliveryAddress>) => setDetails((current) => ({ ...current, ...updates })), [])

  const refreshPromotions = useCallback(async (initializeWelcomeDiscount = false) => {
    const requestId = ++promotionsRequestId.current
    try {
      const result = await api.getCheckoutPromotions()
      if (requestId !== promotionsRequestId.current) return
      setPromotions(result)
      setPromotionsError('')
      if (initializeWelcomeDiscount) setApplyWelcomeDiscount(result.welcomeDiscountEligible)
    } catch (reason) {
      if (requestId === promotionsRequestId.current) {
        setPromotionsError(reason instanceof Error ? reason.message : 'Unable to load available discounts.')
      }
    } finally {
      if (requestId === promotionsRequestId.current) setPromotionsLoading(false)
    }
  }, [])

  useEffect(() => () => { promotionsRequestId.current += 1 }, [])

  useEffect(() => {
    const addressReady = details.deliveryProvinceCode && details.deliveryCityCode && details.deliveryBarangayCode &&
      details.deliveryZipCode && details.deliveryStreetAddress.trim()
    if (!selectedItems.length || !addressReady) {
      setQuote(null)
      setQuoteError('')
      setQuoteLoading(false)
      return
    }

    const controller = new AbortController()
    setQuoteLoading(true)
    setQuoteError('')
    api.getCheckoutQuote({
      items: selectedItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      deliveryRegion: details.deliveryRegion,
      deliveryProvinceCode: details.deliveryProvinceCode,
      deliveryCityCode: details.deliveryCityCode,
      deliveryBarangayCode: details.deliveryBarangayCode,
      deliveryZipCode: details.deliveryZipCode,
      deliveryStreetAddress: details.deliveryStreetAddress,
      deliveryAdditionalDetails: details.deliveryAdditionalDetails,
      ...(appliedPromotionId ? { promotionId: appliedPromotionId } : {}),
      applyWelcomeDiscount,
    }, controller.signal).then(setQuote).catch((reason) => {
      if (!controller.signal.aborted) {
        setQuote(null)
        setQuoteError(reason instanceof Error ? reason.message : 'Unable to calculate checkout totals.')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setQuoteLoading(false)
    })
    return () => controller.abort()
  }, [appliedPromotionId, applyWelcomeDiscount, details, selectedItems])

  function toggleSelected(productId: string, selected: boolean) {
    const next = selected
      ? [...new Set([...selectedProductIds, productId])]
      : selectedProductIds.filter((id) => id !== productId)
    onChangeSelected(next)
  }

  function applyPromotion(promotionId: string) {
    const promotion = promotions?.promotions.find((entry) => entry.id === promotionId)
    if (!promotion?.eligible) return
    setAppliedPromotionId(promotionId)
    if (!promotion.allowWelcomeStacking) setApplyWelcomeDiscount(false)
  }

  function toggleDiscounts() {
    const opening = !discountsOpen
    setDiscountsOpen(opening)
    if (opening) {
      setPromotionsLoading(true)
      void refreshPromotions(!promotions)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedItems.length) {
      setQuoteError('Select at least one product to purchase.')
      return
    }
    if (!quote || quoteLoading) {
      setQuoteError('Complete the delivery address and wait for the verified checkout total.')
      return
    }
    setSubmitting(true)
    if (!checkoutRequestId.current) checkoutRequestId.current = window.crypto.randomUUID()
    try {
      const completed = await onCheckout({
        ...details,
        selectedItems: selectedItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        checkoutRequestId: checkoutRequestId.current,
        ...(appliedPromotionId ? { promotionId: appliedPromotionId } : {}),
        applyWelcomeDiscount,
      })
      if (completed) checkoutRequestId.current = ''
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-heading"><div><span className="eyebrow">YOUR NEXT GATHERING</span><h2 id="cart-title">Shopping bag <span>{items.length}</span></h2></div><button className="icon-button" onClick={onClose} aria-label="Close bag"><X /></button></div>
        {!items.length ? <div className="empty-cart"><ShoppingBag size={38} /><h3>Your bag is empty.</h3><p>Choose a grill set to get started.</p></div> : <>
          <label className="cart-select-all"><input type="checkbox" checked={allSelected} onChange={(event) => onChangeSelected(event.target.checked ? items.map(({ product }) => product.id) : [])} /> Select all products</label>
          <div className="cart-lines">{items.map(({ product, quantity }) => <article className={`cart-line ${selectedIds.has(product.id) ? '' : 'cart-line-unselected'}`} key={product.id}>
            <label className="cart-item-check"><input type="checkbox" checked={selectedIds.has(product.id)} onChange={(event) => toggleSelected(product.id, event.target.checked)} aria-label={`Select ${product.name} for checkout`} /></label>
            <img src={product.image} alt="" />
            <div className="cart-line-info"><b>{product.name}</b><span>{money(product.price)}</span><div className="quantity-control"><button type="button" onClick={() => onChangeQuantity(product.id, -1)} aria-label={`Decrease ${product.name} quantity`}><Minus size={13} /></button><span>{quantity}</span><button type="button" onClick={() => onChangeQuantity(product.id, 1)} aria-label={`Increase ${product.name} quantity`}><Plus size={13} /></button></div></div>
            <button type="button" className="remove-button" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name}`}><Trash2 size={16} /><span>Remove</span></button>
          </article>)}</div>
          <form className="checkout-form" onSubmit={(event) => void submit(event)}>
            <h3>Contact details</h3>
            <div className="checkout-grid"><label>Full name<input required value={details.name} onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))} placeholder="Juan Dela Cruz" /></label><label>Email<input required type="email" value={user.email} readOnly /></label></div>
            <label>Mobile number<input required type="tel" value={details.phone} onChange={(event) => setDetails((current) => ({ ...current, phone: event.target.value }))} placeholder="09XX XXX XXXX" /></label>
            <CentralLuzonAddressFields value={details} onChange={changeAddress} />

            <button type="button" className="discount-toggle" aria-expanded={discountsOpen} onClick={toggleDiscounts}><Tag size={15} /> Apply Discount <span>{discountsOpen ? '−' : '+'}</span></button>
            {discountsOpen && <section className="discount-options" aria-label="Available discounts" aria-busy={promotionsLoading}>
              {promotionsLoading && <p className="admin-muted" role="status">Refreshing available discounts…</p>}
              {promotionsError && <p className="form-error" role="alert">{promotionsError}</p>}
              {promotions?.welcomeDiscountEligible && <article className="discount-option"><div><b>New customer welcome discount</b><p>One-time 10% discount on selected products.</p></div><button type="button" className={applyWelcomeDiscount ? 'secondary-button selected-discount' : 'secondary-button'} onClick={() => {
                if (!applyWelcomeDiscount && selectedPromotion && !selectedPromotion.allowWelcomeStacking) {
                  setQuoteError('Remove the current promotion before applying the welcome discount.')
                  return
                }
                setApplyWelcomeDiscount((applied) => !applied)
              }}>{applyWelcomeDiscount ? 'Remove' : 'Apply'}</button></article>}
              {!promotionsLoading && promotions && !promotions.promotions.length && !promotions.welcomeDiscountEligible && <p className="admin-muted">No discounts are currently available.</p>}
              {promotions?.promotions.map((promotion) => <article className="discount-option" key={promotion.id}>
                <div><b>{promotion.name}</b><p>{promotion.description || 'Store promotion'} · {promotion.discountPercent}% off{promotion.freeShipping ? ' · Free shipping' : ''}</p>{!promotion.eligible && <small>{promotion.ineligibleReason}</small>}</div>
                <button type="button" className={appliedPromotionId === promotion.id ? 'secondary-button selected-discount' : 'secondary-button'} disabled={!promotion.eligible && appliedPromotionId !== promotion.id} onClick={() => appliedPromotionId === promotion.id ? setAppliedPromotionId('') : applyPromotion(promotion.id)}>{appliedPromotionId === promotion.id ? 'Remove' : 'Apply'}</button>
              </article>)}
              {selectedPromotion && selectedPromotion.allowWelcomeStacking && promotions?.welcomeDiscountEligible && <label className="stack-discount"><input type="checkbox" checked={applyWelcomeDiscount} onChange={(event) => setApplyWelcomeDiscount(event.target.checked)} /> Combine the welcome discount with this admin-approved promotion</label>}
            </section>}

            <label>Payment method<select value={details.payment} onChange={(event) => setDetails((current) => ({ ...current, payment: event.target.value as CheckoutDetails['payment'] }))}><option>Cash on delivery</option><option value="Cashless">Cashless with Xendit</option></select></label>
            {details.payment === 'Cashless' && <p className="payment-note">Continue to Xendit's secure hosted checkout. Available payment methods depend on the merchant account.</p>}
            <section className="checkout-summary" aria-live="polite">
              <h3>Order summary</h3>
              {selectedItems.map(({ product, quantity }) => <div className="checkout-summary-row" key={product.id}><span>{quantity}× {product.name}</span><b>{money(product.price * quantity)}</b></div>)}
              <div className="checkout-summary-row"><span>Product subtotal</span><b>{money(quote?.productSubtotal ?? selectedSubtotal)}</b></div>
              <div className="checkout-summary-row"><span>Shipping fee{quote?.originalShippingFee && quote.shippingFee === 0 ? ' (free shipping)' : ''}</span><b>{quote ? money(quote.shippingFee) : 'Calculate after address'}</b></div>
              {quote?.welcomeDiscountAmount ? <div className="checkout-summary-row discount-summary"><span>Welcome discount (10%)</span><b>−{money(quote.welcomeDiscountAmount)}</b></div> : null}
              {quote?.promotionDiscountAmount ? <div className="checkout-summary-row discount-summary"><span>{quote.promotionName} discount</span><b>−{money(quote.promotionDiscountAmount)}</b></div> : null}
              {quote?.freeShippingDiscount ? <div className="checkout-summary-row discount-summary"><span>Free shipping discount</span><b>−{money(quote.freeShippingDiscount)}</b></div> : null}
              <div className="checkout-summary-total"><span>Final total</span><strong>{quote ? money(quote.total) : money(selectedSubtotal)}</strong></div>
              {quote?.estimatedDeliveryDays && <p>Estimated delivery: {quote.estimatedDeliveryDays} business days</p>}
              {!quote && <p>Complete your Central Luzon address to calculate shipping and discounts.</p>}
            </section>
            {quoteError && <p className="form-error" role="alert">{quoteError}</p>}
            <button className="primary-button full-button" type="submit" disabled={!selectedItems.length || !quote || quoteLoading || submitting}>
              {submitting ? 'Submitting order…' : quoteLoading ? 'Calculating total…' : details.payment === 'Cashless' ? 'Continue to payment' : 'Place order'} <span>→</span>
            </button>
            <p className="checkout-caption">Shipping and discounts are recalculated and verified by the server before order placement.</p>
          </form>
        </>}
      </aside>
    </div>
  )
}
