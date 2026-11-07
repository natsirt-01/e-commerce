import { LogOut } from 'lucide-react'

type Props = {
  onConfirm: () => void
  onCancel: () => void
}

export function LogoutConfirmation({ onConfirm, onCancel }: Props) {
  return (
    <div className="overlay logout-overlay" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="dialog logout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-description">
        <span className="profile-icon"><LogOut size={20} /></span>
        <span className="eyebrow">SIGN OUT</span>
        <h2 id="logout-title">Are you sure you want to logout?</h2>
        <p id="logout-description">You will be signed out of your account on this device.</p>
        <div className="logout-actions">
          <button type="button" className="back-link" onClick={onCancel}>No, stay logged in</button>
          <button type="button" className="primary-button" onClick={onConfirm}>Yes, log out</button>
        </div>
      </section>
    </div>
  )
}
