import { useEffect, useState } from 'react'

/**
 * Registers the service worker and handles install/update prompts.
 * Replaces pwa.js.
 */
export default function PWAManager() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker.register('/site/sw.js').then(reg => {
      // Check for updates periodically
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            setShowUpdate(true)
          }
        })
      })
    }).catch(() => {})

    // Capture install prompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstall(false)
  }

  const handleReload = () => {
    window.location.reload()
  }

  return (
    <>
      {showInstall && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--card,#1e293b)', border: '1px solid var(--border,#334155)',
          borderRadius: 12, padding: '12px 20px', zIndex: 10003,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: '.88rem',
          color: 'var(--text,#e8eaf0)', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
        }}>
          <span>📱</span>
          <span>安装到桌面，离线也能用</span>
          <button onClick={handleInstall} style={{
            padding: '6px 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent,#6c5ce7)', color: '#fff',
            fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>安装</button>
          <button onClick={() => setShowInstall(false)} style={{
            background: 'none', border: 'none', color: 'var(--text3,#6b7194)',
            cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1,
          }}>&times;</button>
        </div>
      )}
      {showUpdate && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--card,#1e293b)', border: '1px solid var(--border,#334155)',
          borderRadius: 12, padding: '12px 20px', zIndex: 10003,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: '.88rem',
          color: 'var(--text,#e8eaf0)', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
        }}>
          <span>🔄</span>
          <span>有新版本可用</span>
          <button onClick={handleReload} style={{
            padding: '6px 16px', borderRadius: 8, border: 'none',
            background: 'var(--success,#10b981)', color: '#fff',
            fontSize: '.82rem', fontWeight: 600, cursor: 'pointer',
          }}>刷新</button>
        </div>
      )}
    </>
  )
}
