import { Camera, LogOut, PackageCheck, ShoppingBag, UserRound, X } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { User } from '../types'

type Props = {
  user: User
  cartCount: number
  onClose: () => void
  onSave: (user: User) => Promise<User>
  onSignOut: () => void
  onCart: () => void
  onOrders: () => void
  drawer?: boolean
}

export function ProfileDialog({ user, cartCount, onClose, onSave, onSignOut, onCart, onOrders, drawer = false }: Props) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone, address: user.address })
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ ...user, ...form, avatarUrl })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save profile changes.')
    } finally {
      setSaving(false)
    }
  }

  async function changeAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image smaller than 5 MB.')
      return
    }
    try {
      const image = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 320 / Math.max(image.width, image.height))
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not process this image.')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      image.close()
      const resized = canvas.toDataURL('image/webp', 0.8)
      if (resized.length > 700000) throw new Error('This image is too large to save. Choose a smaller image.')
      setAvatarUrl(resized)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read this image.')
    }
  }

  return (
    <div className={drawer ? 'overlay drawer-overlay' : 'overlay'} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`dialog profile-dialog${drawer ? ' profile-drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="dialog-close icon-button" onClick={onClose} aria-label="Close profile"><X size={19} /></button>
        {drawer && <label className="profile-avatar-upload" title="Upload a profile picture">
          {avatarUrl ? <img src={avatarUrl} alt="Your profile" /> : <UserRound size={26} />}
          <span><Camera size={14} /></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeAvatar(event)} aria-label="Upload profile picture" />
        </label>}
        <span className="eyebrow">YOUR ACCOUNT</span><h2 id="profile-title">Profile details</h2>
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
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button full-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
        <button className="signout-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </section>
    </div>
  )
}