import { MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import type { ChatThread, User } from '../types'

type Props = { user: User; onClose: () => void }

export function MessengerDrawer({ user, onClose }: Props) {
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const latestMessage = thread?.messages[thread.messages.length - 1]

  useEffect(() => {
    let active = true
    const refresh = () => api.getCustomerChat().then((next) => {
      if (active) {
        setThread(next)
        setError('')
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your chat.')
    })
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [thread?.messages.length])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      setThread(await api.sendCustomerChatMessage(text))
      setMessage('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send your message.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="overlay messenger-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section id="customer-messenger-drawer" className="messenger-drawer" role="dialog" aria-modal="true" aria-label="Chat with the store">
        <header className="messenger-header">
          <div className="messenger-avatar"><MessageCircle size={20} /></div>
          <div><b>The Grill Phrenz J</b><span>Store support · replies appear here</span></div>
          <button className="icon-button" onClick={onClose} aria-label="Close chat"><X size={19} /></button>
        </header>
        <section className="messenger-conversations" aria-label="Active conversations">
          <span className="eyebrow">CONVERSATIONS</span>
          <div className="messenger-conversation active" aria-current="true">
            <span className="messenger-conversation-avatar"><MessageCircle size={16} /></span>
            <span className="messenger-conversation-copy">
              <b>The Grill Phrenz J</b>
              <small>{latestMessage?.message || 'Start a conversation with store support'}</small>
            </span>
            <i aria-label="Active conversation" />
          </div>
        </section>
        <div className="messenger-messages" aria-live="polite">
          {!thread?.messages.length && <div className="messenger-empty"><MessageCircle size={24} /><b>Start a conversation</b><span>Ask about products, orders, or anything else.</span></div>}
          {thread?.messages.map((item) => <div key={item.id} className={`messenger-bubble ${item.senderRole === 'customer' ? 'outgoing' : 'incoming'}`}>
            <span>{item.senderName}</span><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}</time>
          </div>)}
          <div ref={endRef} />
        </div>
        {error && <p className="messenger-error" role="alert">{error}</p>}
        <form className="messenger-compose" onSubmit={submit}>
          <label className="sr-only" htmlFor="messenger-message">Your message</label>
          <textarea id="messenger-message" value={message} maxLength={2000} rows={2} placeholder="Write a message..." onChange={(event) => setMessage(event.target.value)} />
          <button className="primary-button" type="submit" disabled={!message.trim() || sending} aria-label="Send message"><Send size={17} /></button>
        </form>
        <p className="messenger-account-note">Chatting as {user.name}</p>
      </section>
    </div>,
    document.body,
  )
}
