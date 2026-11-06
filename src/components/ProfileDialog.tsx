import { LogOut, PackageCheck, ShoppingBag, UserRound, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { User } from '../types'

type Props = {
  user: User
  cartCount: number
  onClose: () => void
  onSave: (user: User) => void
  onSignOut: () => void
  onCart: () => void
  onOrders: () => void
}

export function ProfileDialog({ user, cartCount, onClose, onSave, onSignOut, onCart, onOrders }: Props) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone, address: user.address })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ ...user, ...form })
  }

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="dialog-close icon-button" onClick={onClose} aria-label="Close profile"><X size={19} /></button>
        <span className="profile-icon"><UserRound size={20} /></span><span className="eyebrow">YOUR ACCOUNT</span><h2 id="profile-title">Profile details</h2>
        <div className="account-actions">
          <button type="button" className="account-action" onClick={onCart}><ShoppingBag size={16} /> Shopping bag <span>{cartCount}</span></button>
          <button type="button" className="account-action" onClick={onOrders}><PackageCheck size={16} /> My orders</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Email address<input type="email" value={form.email} readOnly /></label>
          <p className="profile-email-note">Email is used for sign-in and order updates.</p>
          <label>Mobile number<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Delivery address<input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <button type="submit" className="primary-button full-button">Save profile</button>
        </form>
        <button className="signout-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </section>
    </div>
  )
}