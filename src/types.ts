export type Product = {
  id: string
  name: string
  category: string
  description: string
  materials: string
  price: number
  image: string
  badge?: string
  stock: number
}

export type User = {
  id: string
  name: string
  email: string
  phone: string
  address: string
  role: 'customer' | 'admin'
}

export type AdminCustomer = User & { active: boolean }

export type OrderStatus = 'Pending' | 'On delivery' | 'Delivered' | 'Cancelled'

export type Order = {
  id: string
  customer: string
  email: string
  address: string
  region: string
  items: { productId: string; name: string; quantity: number; price: number }[]
  total: number
  payment: 'Cash on delivery' | 'Cashless'
  paymentStatus?: string
  status: OrderStatus
  placedAt: string
  deliveryDays: number
}

export type SellerMessageType = 'product-feedback' | 'suggestion' | 'product-report'

export type SellerMessage = {
  id: string
  userId: string
  customer: string
  email: string
  type: SellerMessageType
  productId?: string
  productName?: string
  message: string
  createdAt: string
}