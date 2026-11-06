import { useEffect, useRef } from 'react'

type GoogleCredential = { credential: string }
type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: GoogleCredential) => void }) => void
  renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string; shape: string; width: string; locale: string }) => void
}

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}

type Props = { onCredential: (credential: string) => void; onUnavailable: () => void }
declare const __GOOGLE_CLIENT_ID__: string
const clientId = __GOOGLE_CLIENT_ID__
export const isGoogleConfigured = Boolean(clientId)

export function GoogleSignInButton({ onCredential, onUnavailable }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)

  useEffect(() => { callback.current = onCredential }, [onCredential])

  useEffect(() => {
    const buttonElement = mount.current
    if (!clientId || !buttonElement) return
    const listeners = new AbortController()
    const renderGoogleButton = () => {
      if (!window.google?.accounts.id) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => callback.current(response.credential) })
      window.google.accounts.id.renderButton(buttonElement, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: String(Math.min(390, buttonElement.clientWidth || 390)), locale: 'en' })
    }
    const existingScript = document.querySelector<HTMLScriptElement>('#google-identity-services')
    if (window.google?.accounts.id) renderGoogleButton()
    else if (existingScript) existingScript.addEventListener('load', renderGoogleButton, { once: true, signal: listeners.signal })
    else {
      const script = document.createElement('script')
      script.id = 'google-identity-services'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.addEventListener('load', renderGoogleButton, { once: true, signal: listeners.signal })
      document.head.appendChild(script)
    }
    return () => { listeners.abort(); buttonElement.replaceChildren() }
  }, [])

  if (clientId) return <div className="google-button-mount" ref={mount} />
  return <button className="google-fallback-button" type="button" onClick={onUnavailable}><span className="google-letter">G</span>Continue with Google</button>
}