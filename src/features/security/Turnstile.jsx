import { useEffect, useRef, useCallback } from 'react'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SITE_KEY = '0x4AAAAAADsVdTqRTGA-6yEz'

/**
 * Cloudflare Turnstile widget.
 * @param {{ onVerify: (token: string) => void, onError?: () => void, onExpire?: () => void, theme?: 'light'|'dark'|'auto' }} props
 */
export default function Turnstile({ onVerify, onError, onExpire, theme = 'auto' }) {
  const containerRef = useRef(null)
  const widgetId = useRef(null)
  const refMap = useRef({ onVerify, onError, onExpire })
  refMap.current = { onVerify, onError, onExpire }

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current) return
    if (widgetId.current != null) {
      try { window.turnstile.remove(widgetId.current) } catch {}
    }
    widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      callback: (token) => refMap.current.onVerify?.(token),
      'expired-callback': () => refMap.current.onExpire?.(),
      'error-callback': () => refMap.current.onError?.(),
    })
  }, [theme])

  useEffect(() => {
    if (window.turnstile) { renderWidget(); return }
    const existing = document.querySelector('script[src*="turnstile"]')
    if (existing) {
      existing.addEventListener('load', renderWidget, { once: true })
      return () => existing.removeEventListener('load', renderWidget)
    }
    const s = document.createElement('script')
    s.src = SCRIPT_URL; s.async = true; s.onload = renderWidget
    document.head.appendChild(s)
    return () => { if (widgetId.current != null) try { window.turnstile.remove(widgetId.current) } catch {} }
  }, [renderWidget])

  return <div ref={containerRef} style={{ display: 'inline-block' }} />
}
