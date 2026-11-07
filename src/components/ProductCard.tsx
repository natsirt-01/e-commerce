import { ArrowUpRight, MessageCircle, Plus, Store } from 'lucide-react'
import type { Product } from '../types'

type Props = {
  product: Product
  onAdd: (product: Product) => void
  onBuyNow?: (product: Product) => void
  onView: (product: Product) => void
  onSeller?: (sellerId: string) => void
  onMessageSeller?: () => void
}

export function ProductCard({ product, onAdd, onBuyNow, onView, onSeller, onMessageSeller }: Props) {
  return (
    <article className="product-card">
      <button className="product-image-button" onClick={() => onView(product)} aria-label={`View ${product.name}`}>
        <img src={product.image} alt={product.name} loading="lazy" />
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <span className="image-arrow"><ArrowUpRight size={17} /></span>
      </button>
      <div className="product-info">
        <div className="product-category">{product.category}</div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        {product.sellerId && (onSeller || onMessageSeller) && <div className="product-seller">
          <button type="button" onClick={() => onSeller?.(product.sellerId!)}><Store size={13} /> {product.sellerName || 'Store seller'} · {product.sellerId}</button>
          {onMessageSeller && <button type="button" onClick={onMessageSeller} aria-label={`Message the seller of ${product.name}`} title="Message seller"><MessageCircle size={14} /></button>}
        </div>}
        <div className="product-bottom">
          <strong>₱{product.price.toLocaleString('en-PH')}</strong>
          {onBuyNow ? <div className="product-actions">
            <button className="buy-now-button" onClick={() => onBuyNow(product)} disabled={product.stock < 1}>Buy now</button>
            <button className="add-button" onClick={() => onAdd(product)} disabled={product.stock < 1} aria-label={`Add ${product.name} to cart`}>
              <Plus size={17} /><span>Add</span>
            </button>
          </div> : <button className="add-button" onClick={() => onAdd(product)} disabled={product.stock < 1} aria-label={`Add ${product.name} to cart`}>
            <Plus size={17} /><span>Add</span>
          </button>}
        </div>
      </div>
    </article>
  )
}