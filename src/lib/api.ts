import type { AdminCustomer, Order, OrderStatus, Product, SellerMessage, SellerMessageType, User } from '../types'

const tokenKey = 'grill-session-token'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  const token = localStorage.getItem(tokenKey)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`/api${path}`, { ...options, headers })
  if (response.status === 204) return undefined as T
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Unable to connect to the server. Please try again.')
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
  getAdminCustomers: () => request<AdminCustomer[]>('/admin/customers'),
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
  updateProfile: (data: Pick<User, 'name' | 'phone' | 'address'>) => request<User>('/me', { method: 'PUT', body: JSON.stringify(data) }),
  createOrder: (data: { name: string; email: string; phone: string; address: string; region: string; payment: string; items: { productId: string; quantity: number }[] }) => request<{ order: Order; checkoutUrl?: string }>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  refreshPayment: (orderId: string) => request<Pick<Order, 'id' | 'status' | 'paymentStatus'>>(`/orders/${orderId}/payment-status`),
  createProduct: (product: Product) => request<Product>('/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: (product: Product) => request<Product>(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify(product) }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  updateOrderStatus: (id: string, status: OrderStatus) => request<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  cancelOrder: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'PATCH' }),
  clearSession: () => localStorage.removeItem(tokenKey),
}