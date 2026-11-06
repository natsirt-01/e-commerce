import { ArrowUpRight, Plus } from 'lucide-react'
import type { Product } from '../types'

type Props = { product: Product; onAdd: (product: Product) => void; onView: (product: Product) => void }

export function ProductCard({ product, onAdd, onView }: Props) {
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
        <div className="product-bottom">
          <strong>₱{product.price.toLocaleString('en-PH')}</strong>
          <button className="add-button" onClick={() => onAdd(product)} disabled={product.stock < 1} aria-label={`Add ${product.name} to cart`}>
            <Plus size={17} /><span>Add</span>
          </button>
        </div>
      </div>
    </article>
  )
}