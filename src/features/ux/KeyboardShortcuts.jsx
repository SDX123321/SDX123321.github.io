import { useEffect, useState } from 'react'

const SHORTCUTS = [
  { key: '?', desc: '显示快捷键帮助' },
  { key: 'T', desc: '切换深浅色模式' },
  { key: 'Ctrl+K', desc: '聚焦搜索框' },
  { key: '/', desc: '聚焦搜索框' },
  { key: 'Esc', desc: '关闭弹窗/搜索' },
  { key: '↑', desc: '回到页面顶部' },
]

export default function KeyboardShortcuts({ onToggleTheme }) {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShowHelp(prev => !prev)
      }
      if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          onToggleTheme?.()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const input = document.querySelector('#globalSearch, .search-box input')
        if (input) input.focus()
      }
      if (e.key === 'Escape') {
        setShowHelp(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggleTheme])

  if (!showHelp) return null

  return (
    <div onClick={() => setShowHelp(false)} style={{
      display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10001, background: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card,#1a1d27)', borderRadius: 16, padding: 28,
        maxWidth: 400, width: '92vw', border: '1px solid var(--border,#2d3436)',
        boxShadow: '0 12px 40px rgba(0,0,0,.4)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: 'var(--text)' }}>⌨ 快捷键</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {SHORTCUTS.map(s => (
            <li key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.1)', fontSize: '.88rem', color: 'var(--text2,#9ba1b8)' }}>
              <span>{s.desc}</span>
              <kbd style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--bg3,#1e2235)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '.8rem', color: 'var(--text)' }}>{s.key}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
