import { Menu, ShieldCheck, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { GrillMark } from './GrillMark'
import type { User } from '../types'

type Props = {
  user: User | null
  onAccount: () => void
  onAdmin: () => void
}

export function SiteHeader({ user, onAccount, onAdmin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="site-header">
      <a className="wordmark" href="#home" aria-label="The Grill Phrenz J home">
        <GrillMark />
        <span>The Grill <b>Phrenz J</b></span>
      </a>
      <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'}>
        <a href="#collection" onClick={() => setMenuOpen(false)}>Shop grills</a>
        <a href="#story" onClick={() => setMenuOpen(false)}>Our promise</a>
        {user?.role === 'admin' && <button className="nav-button" onClick={onAdmin}><ShieldCheck size={16} /> Admin</button>}
        <button className="nav-button account-link" onClick={onAccount}><UserRound size={16} /> {user?.name || 'Log in'}</button>
      </nav>
    </header>
  )
}