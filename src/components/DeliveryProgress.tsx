import { Check } from 'lucide-react'
import type { OrderStatus } from '../types'

const steps: Exclude<OrderStatus, 'Cancelled'>[] = [
  'Order Placed',
  'Order Confirmed',
  'Preparing Order',
  'Out for Delivery',
  'Delivered',
]

export function DeliveryProgress({ status }: { status: OrderStatus }) {
  if (status === 'Cancelled') return null
  const currentStep = steps.indexOf(status)

  return (
    <div className="tracking-steps">
      {steps.map((step, index) => (
        <div className={index <= currentStep ? 'tracking-step complete' : 'tracking-step'} key={step}>
          <span>{index < currentStep ? <Check size={13} /> : index + 1}</span>
          <small>{step}</small>
        </div>
      ))}
    </div>
  )
}
