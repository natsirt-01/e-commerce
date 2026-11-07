import type { AdminCustomer, AvailablePromotions, ChatThread, CheckoutQuote, CheckoutQuoteRequest, DeliveryAddress, DeliveryEstimateSettings, LocationOption, Order, OrderStatus, PaymentFeeSettings, PaymentReport, Product, Promotion, SellerMessage, SellerMessageType, User } from '../types'

const tokenKey = 'grill-session-token'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  const token = localStorage.getItem(tokenKey)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...options, headers })
  } catch {
    throw new Error('Unable to reach the store server. Please make sure the API server is running and try again.')
  }
  if (response.status === 204) return undefined as T
  const responseText = await response.text()
  let payload: (T & { error?: string }) | undefined
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as T & { error?: string }
    } catch {
      if (!response.ok) {
        throw new Error(response.status >= 500
          ? 'The store server is temporarily unavailable. Please try again in a moment.'
          : `The server returned an invalid response (HTTP ${response.status}).`)
      }
      throw new Error('The store server returned an invalid response. Please try again.')
    }
  }
  if (!response.ok) throw new Error(payload?.error || `Unable to connect to the server (HTTP ${response.status}). Please try again.`)
  if (payload === undefined) throw new Error('The store server returned an empty response. Please try again.')
  return payload
}

function saveSession(result: { token: string; user: User }) {
  localStorage.setItem(tokenKey, result.token)
  return result.user
}

export const api = {
  getProducts: () => request<Product[]>('/products'),
  getOrders: () => request<Order[]>('/orders'),
  getAdminMessages: () => request<SellerMessage[]>('/admin/messages'),
  getCustomerChat: () => request<ChatThread>('/chat'),
  sendCustomerChatMessage: (message: string) => request<ChatThread>('/chat/messages', { method: 'POST', body: JSON.stringify({ message }) }),
  getAdminChats: () => request<ChatThread[]>('/admin/chats'),
  sendAdminChatMessage: (threadId: string, message: string) => request<ChatThread>(`/admin/chats/${encodeURIComponent(threadId)}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  getAdminCustomers: () => request<AdminCustomer[]>('/admin/customers'),
  getDeliveryProvinces: (signal?: AbortSignal) => request<LocationOption[]>('/locations/provinces', { signal }),
  getDeliveryCities: (provinceCode: string, signal?: AbortSignal) => request<LocationOption[]>(`/locations/provinces/${encodeURIComponent(provinceCode)}/cities`, { signal }),
  getDeliveryBarangays: (cityCode: string, signal?: AbortSignal) => request<LocationOption[]>(`/locations/cities/${encodeURIComponent(cityCode)}/barangays`, { signal }),
  getDeliveryZipCodes: (provinceCode: string, cityCode: string, barangayCode: string, signal?: AbortSignal) => {
    const query = barangayCode ? `?barangayCode=${encodeURIComponent(barangayCode)}` : ''
    return request<string[]>(`/locations/provinces/${encodeURIComponent(provinceCode)}/cities/${encodeURIComponent(cityCode)}/zip-codes${query}`, { signal })
  },
  getDeliveryEstimate: (provinceCode: string, cityCode: string, signal?: AbortSignal) => request<{ days: number }>(`/locations/estimate?provinceCode=${encodeURIComponent(provinceCode)}&cityCode=${encodeURIComponent(cityCode)}`, { signal }),
  getAdminDeliveryEstimates: () => request<DeliveryEstimateSettings>('/admin/delivery-estimates'),
  updateAdminDeliveryEstimates: (settings: DeliveryEstimateSettings) => request<DeliveryEstimateSettings>('/admin/delivery-estimates', { method: 'PUT', body: JSON.stringify(settings) }),
  getCheckoutPromotions: () => request<AvailablePromotions>('/promotions'),
  getCheckoutQuote: (data: CheckoutQuoteRequest, signal?: AbortSignal) => request<CheckoutQuote>('/checkout/quote', { method: 'POST', body: JSON.stringify(data), signal }),
  getAdminPromotions: () => request<Promotion[]>('/admin/promotions'),
  createAdminPromotion: (promotion: Omit<Promotion, 'id' | 'createdAt'>) => request<Promotion>('/admin/promotions', { method: 'POST', body: JSON.stringify(promotion) }),
  updateAdminPromotion: (promotion: Promotion) => request<Promotion>(`/admin/promotions/${encodeURIComponent(promotion.id)}`, { method: 'PUT', body: JSON.stringify(promotion) }),
  setAdminPromotionActive: (id: string, active: boolean) => request<Promotion>(`/admin/promotions/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  getAdminPaymentFeeSettings: () => request<PaymentFeeSettings>('/admin/payment-fees'),
  updateAdminPaymentFeeSettings: (settings: PaymentFeeSettings) => request<PaymentFeeSettings>('/admin/payment-fees', { method: 'PUT', body: JSON.stringify(settings) }),
  getAdminPaymentReport: () => request<PaymentReport>('/admin/payment-report'),
  updateAdminCustomer: (id: string, data: Pick<User, 'name' | 'phone' | 'address'>) => request<AdminCustomer>(`/admin/customers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  setAdminCustomerActive: (id: string, active: boolean) => request<AdminCustomer>(`/admin/customers/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteAdminCustomer: (id: string) => request<void>(`/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sendSellerMessage: (data: { type: SellerMessageType; productId?: string; message: string }) => request<{ submitted: boolean }>('/messages', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request<User>('/me'),
  requestCode: (email: string, purpose: 'register' | 'reset') => request<{ sent: boolean; expiresInMinutes: number }>('/auth/request-code', { method: 'POST', body: JSON.stringify({ email, purpose }) }),
  login: async (email: string, password: string) => saveSession(await request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })),
  register: (data: { name: string; email: string; phone: string; address: string; password: string; code: string }) => request<{ created: boolean }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  googleAuth: async (credential: string, action: 'register' | 'login') => {
    const result = await request<{ created?: boolean; token?: string; user: User }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential, action }) })
    return action === 'register' ? result : saveSession(result as { token: string; user: User })
  },
  resetPassword: (data: { email: string; code: string; password: string }) => request<{ ok: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (data: Pick<User, 'name' | 'phone' | 'address'> & { avatarUrl?: string }) => request<User>('/me', { method: 'PUT', body: JSON.stringify(data) }),
  createOrder: (data: DeliveryAddress & { name: string; email: string; phone: string; payment: string; items: { productId: string; quantity: number }[]; checkoutRequestId: string; promotionId?: string; applyWelcomeDiscount?: boolean }) => request<{ order: Order; checkoutUrl?: string }>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  refreshPayment: (orderId: string) => request<Pick<Order, 'id' | 'status' | 'paymentStatus'>>(`/orders/${orderId}/payment-status`),
  createProduct: (product: Product) => request<Product>('/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: (product: Product) => request<Product>(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify(product) }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  updateOrderStatus: (id: string, status: OrderStatus) => request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  cancelOrder: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'PATCH' }),
  clearSession: () => localStorage.removeItem(tokenKey),
}