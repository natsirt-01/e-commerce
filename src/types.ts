export type Product = {
  id: string
  name: string
  category: string
  description: string
  materials: string
  price: number
  image: string
  badge?: string
  sellerId?: string
  sellerName?: string
  stock: number
}

export type User = {
  id: string
  name: string
  email: string
  phone: string
  address: string
  role: 'customer' | 'admin'
  avatarUrl?: string
  welcomeDiscountEligible?: boolean
  welcomeDiscountUsed?: boolean
}

export type AdminCustomer = User & { active: boolean }

export type OrderStatus =
  | 'Order Placed'
  | 'Order Confirmed'
  | 'Preparing Order'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'

export type LocationOption = { code: string; name: string }

export type DeliveryAddress = {
  deliveryRegion: string
  deliveryProvinceCode: string
  deliveryProvince: string
  deliveryCityCode: string
  deliveryCity: string
  deliveryBarangayCode: string
  deliveryBarangay: string
  deliveryZipCode: string
  deliveryStreetAddress: string
  deliveryAdditionalDetails: string
}

export type DeliveryEstimateSettings = {
  provinceDays: Record<string, number>
  cityDays: Record<string, number>
  provinceFees: Record<string, number>
  cityFees: Record<string, number>
}

export type Promotion = {
  id: string
  name: string
  description: string
  discountPercent: number
  freeShipping: boolean
  active: boolean
  startDate: string
  expirationDate: string
  allowWelcomeStacking: boolean
  createdAt: string
}

export type AvailablePromotions = {
  welcomeDiscountEligible: boolean
  promotions: (Pick<Promotion, 'id' | 'name' | 'description' | 'discountPercent' | 'freeShipping' | 'allowWelcomeStacking'> & { eligible: boolean; ineligibleReason: string })[]
}

export type CheckoutQuoteRequest = {
  items: { productId: string; quantity: number }[]
  deliveryRegion: string
  deliveryProvinceCode: string
  deliveryCityCode: string
  deliveryBarangayCode: string
  deliveryZipCode: string
  deliveryStreetAddress: string
  deliveryAdditionalDetails: string
  promotionId?: string
  applyWelcomeDiscount?: boolean
}

export type CheckoutQuote = {
  items: { productId: string; name: string; quantity: number; price: number }[]
  productSubtotal: number
  shippingFee: number
  originalShippingFee: number
  welcomeDiscountAmount: number
  welcomeDiscountEligible: boolean
  welcomeDiscountApplied: boolean
  promotionDiscountAmount: number
  promotionId: string
  promotionName: string
  freeShippingDiscount: number
  estimatedDeliveryDays: number
  total: number
}

export type PaymentFeeRate = { method: string; percentage: number; fixed: number; minimum: number }
export type PaymentFeeSettings = { rates: Record<string, PaymentFeeRate> }
export type PaymentReport = {
  totalOnlineSales: number
  totalEstimatedFees: number
  totalEstimatedNet: number
  transactions: {
    orderId: string
    customer: string
    paymentMethod: string
    grossAmount: number
    feeRate: PaymentFeeRate | null
    estimatedFee: number | null
    estimatedNet: number | null
  }[]
  feeSettings: PaymentFeeSettings
}

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
  deliveryStatus?: OrderStatus
  deliveryRegion?: string
  deliveryProvinceCode?: string
  deliveryProvince?: string
  deliveryCityCode?: string
  deliveryCity?: string
  deliveryBarangayCode?: string
  deliveryBarangay?: string
  deliveryZipCode?: string
  deliveryStreetAddress?: string
  deliveryAdditionalDetails?: string
  estimatedDeliveryDays?: number
  estimatedDeliveryDate?: string
  productSubtotal?: number
  shippingFee?: number
  originalShippingFee?: number
  welcomeDiscountAmount?: number
  welcomeDiscountUsed?: boolean
  promotionDiscountAmount?: number
  promotionId?: string
  promotionName?: string
  freeShippingDiscount?: number
  discountAmount?: number
  grossPaymentAmount?: number
  paymentMethodUsed?: string
  transactionFeeEstimate?: number
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

export type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  senderRole: 'customer' | 'admin'
  message: string
  createdAt: string
}

export type ChatThread = {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  messages: ChatMessage[]
  updatedAt: string
}