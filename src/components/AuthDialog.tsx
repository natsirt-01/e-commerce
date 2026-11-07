import { ArrowLeft, Eye, EyeOff, Flame, ShieldCheck, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { GoogleSignInButton, isGoogleConfigured } from './GoogleSignInButton'
import { api } from '../lib/api'
import type { User } from '../types'

type Mode = 'login' | 'register' | 'forgot'
type Props = { onClose: () => void; onAuthenticated: (user: User) => void }

function PasswordField({ label, autoComplete, value, onChange }: {
  label: string
  autoComplete?: string
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="password-field">
      {label}
      <span className="password-input-wrap">
        <input
          required
          type={visible ? 'text' : 'password'}
          minLength={10}
          pattern="(?=.*[^A-Za-z0-9]).{10,}"
          title="Use at least 10 characters and include at least one special character."
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="10+ characters with a special character"
        />
        <button
          className="password-visibility-toggle"
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      <small className="password-requirement">At least 10 characters and 1 special character.</small>
    </label>
  )
}

export function AuthDialog({ onClose, onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [codeSent, setCodeSent] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '', code: '' })

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  async function handleGoogleCredential(credential: string) {
    setError('')
    setSuccess('')
    if (mode === 'register' && !acceptedTerms) return setError('Please accept the Terms & Conditions before creating an account.')
    try {
      const result = await api.googleAuth(credential, mode === 'register' ? 'register' : 'login')
      if (mode === 'register') {
        if ('user' in result) setForm((current) => ({ ...current, name: result.user.name, email: result.user.email }))
        setMode('login')
        setAcceptedTerms(false)
        setSuccess('Account created. Sign in with Google to continue.')
      } else if ('role' in result) onAuthenticated(result)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Google sign-in failed. Please try again.') }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (mode === 'login') {
      try { onAuthenticated(await api.login(form.email, form.password)) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in.') }
      return
    }
    if (mode === 'register' && !codeSent) {
      if (!acceptedTerms) return setError('Please accept the Terms & Conditions first.')
      try {
        const result = await api.requestCode(form.email, 'register')
        setCodeSent(true)
        setSuccess(`Verification email sent. The code expires in ${result.expiresInMinutes} minutes.`)
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send a verification code.') }
      return
    }
    if (!codeSent) {
      try {
        const result = await api.requestCode(form.email, 'reset')
        setCodeSent(true)
        setSuccess(`Reset email sent. The code expires in ${result.expiresInMinutes} minutes.`)
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send a reset code.') }
      return
    }
    if (mode === 'forgot') {
      try {
        await api.resetPassword({ email: form.email, code: form.code, password: form.password })
        setMode('login')
        setCodeSent(false)
        setForm((current) => ({ ...current, password: '' }))
        setSuccess('Password updated. Sign in with your new password.')
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to reset the password.') }
      return
    }
    try {
      await api.register({ name: form.name, email: form.email, phone: form.phone, address: form.address, password: form.password, code: form.code })
      setMode('login')
      setCodeSent(false)
      setAcceptedTerms(false)
      setForm((current) => ({ ...current, password: '', code: '' }))
      setSuccess('Account created successfully. Please sign in to continue.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create the account.') }
  }

  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password'
  const buttonLabel = mode === 'login' ? 'Sign in' : mode === 'register' ? (codeSent ? 'Verify & create account' : 'Send verification email') : (codeSent ? 'Verify code' : 'Send reset email')

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="dialog-close icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="dialog-brand"><span className="brand-mark"><Flame size={18} /></span> THE GRILL PHRENZ J</div>
        {showTerms ? (
          <div className="terms-view">
            <button className="back-link" onClick={() => setShowTerms(false)}><ArrowLeft size={15} /> Back to registration</button>
            <h2>Terms & Conditions</h2>
            <p>When you create an account, you agree that we may use your name, email, phone number, and delivery address to manage your account, payments, and order updates. We do not sell your personal information.</p>
            <h3>Delivery and order tracking</h3>
            <p>Delivery dates are estimates and may change due to the courier, weather, and destination. The order status shows the latest update from our team.</p>
            <h3>Defective or missing items</h3>
            <p>Report an issue within 48 hours of delivery and include clear photos and your order number. We will review the report and offer repair, replacement, or refund depending on the findings and availability.</p>
            <h3>Cancellations</h3>
            <p>Orders can be cancelled while Order Placed. Delivery updates are managed by the store team, and completed or cancelled orders cannot be changed.</p>
            <p className="terms-note">These are sample terms. Replace them with your final business policies before accepting real customers.</p>
          </div>
        ) : (
          <>
            <h2 id="auth-title">{title}</h2>
            <p className="dialog-lead">{mode === 'register' ? 'Create an account for faster checkout and easy order tracking.' : mode === 'forgot' ? 'We will send a verification code to reset your password.' : 'Sign in to manage your profile and track your orders.'}</p>
            {mode === 'login' && isGoogleConfigured && <div className="google-auth-block">
              <GoogleSignInButton onCredential={handleGoogleCredential} onUnavailable={() => setError('Google sign-in needs a valid Web OAuth client ID in GOOGLE_CLIENT_ID.')} />
              <div className="auth-divider"><span>OR CONTINUE WITH EMAIL</span></div>
            </div>}
            <form className="auth-form" onSubmit={submit}>
              {mode === 'register' && !codeSent && <>
                <label>Full name<input required autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Jordan Smith" /></label>
                <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@gmail.com" /></label>
                <label>Mobile number<input required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="09XX XXX XXXX" /></label>
                <label>Delivery address<input required autoComplete="street-address" value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Barangay, city / municipality" /></label>
                <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={(value) => update('password', value)} />
                <label className="consent-row"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} /><span>I agree to the <button type="button" className="text-link" onClick={() => setShowTerms(true)}>Terms & Conditions</button> and the use of my data to process orders.</span></label>
                {isGoogleConfigured && <div className="google-auth-block register-google-block">
                  <GoogleSignInButton onCredential={handleGoogleCredential} onUnavailable={() => setError('Google sign-in needs a valid Web OAuth client ID in GOOGLE_CLIENT_ID.')} />
                  <div className="auth-divider"><span>OR REGISTER WITH EMAIL</span></div>
                </div>}
              </>}
              {mode === 'login' && <>
                <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@gmail.com" /></label>
                <PasswordField label="Password" autoComplete="current-password" value={form.password} onChange={(value) => update('password', value)} />
                <button type="button" className="text-link forgot-link" onClick={() => { setMode('forgot'); setCodeSent(false); setError(''); setSuccess('') }}>Forgot password?</button>
              </>}
              {mode === 'forgot' && !codeSent && <label>Email address<input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@gmail.com" /></label>}
              {codeSent && <>
                <p className="verification-note"><ShieldCheck size={16} /> Enter the 6-digit code sent to your email address.</p>
                <label>Verification code<input required inputMode="numeric" maxLength={6} value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="6-digit code" /></label>
                {mode === 'forgot' && <PasswordField label="New password" autoComplete="new-password" value={form.password} onChange={(value) => update('password', value)} />}
              </>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {success && <p className="success-message" role="status">{success}</p>}
              <button className="primary-button full-button" type="submit">{buttonLabel}</button>
            </form>
            <div className="auth-switch">
              {mode === 'login' ? <>New here? <button className="text-link" onClick={() => { setMode('register'); setError(''); setSuccess('') }}>Create an account</button></> : <>Already have an account? <button className="text-link" onClick={() => { setMode('login'); setCodeSent(false); setError(''); setSuccess('') }}>Sign in</button></>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}