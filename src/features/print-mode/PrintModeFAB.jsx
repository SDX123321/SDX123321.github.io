import { useEffect } from 'react'

const PRINT_CSS = `
body.f2-print-mode{background:#fff!important;color:#1a1a1a!important}
body.f2-print-mode .main,main{margin:0!important;padding:16px!important;max-width:100%!important}
body.f2-print-mode nav,body.f2-print-mode .sidebar,body.f2-print-mode .sidebar-overlay,
body.f2-print-mode .nav-toggle,body.f2-print-mode .back-top,body.f2-print-mode .theme-toggle,
body.f2-print-mode [style*="position:fixed"],body.f2-print-mode .progress-bar,
body.f2-print-mode .sg-overlay,body.f2-print-mode .ux-marker,body.f2-print-mode .ux-back-to-marker{display:none!important}
body.f2-print-mode .card,body.f2-print-mode .section,body.f2-print-mode .quiz-container{background:#fff!important;border:1px solid #ddd!important;box-shadow:none!important;page-break-inside:avoid}
body.f2-print-mode .kb{background:#f7f7f7!important;border-left:4px solid #2563eb!important}
body.f2-print-mode .kb th{background:#2563eb!important;color:#fff!important}
body.f2-print-mode .quiz-correct{background:#dcfce7!important;color:#166534!important;border:1px solid #86efac!important}
body.f2-print-mode .quiz-wrong{background:#fef2f2!important;color:#991b1b!important;border:1px solid #fca5a5!important}
body.f2-print-mode img,body.f2-print-mode svg{max-width:100%!important}
body.f2-print-mode .collapsible-content{max-height:none!important;opacity:1!important;display:block!important}
body.f2-print-mode .section.collapsed .section-body{max-height:none!important;opacity:1!important;padding-bottom:20px!important}
body.f2-print-mode .section-divider{display:none!important}
body.f2-print-mode table{width:100%!important}
`

/**
 * Injects print-optimized CSS and provides a FAB button.
 * Replaces print-mode.js.
 */
export default function PrintModeFAB() {
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = PRINT_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  const printPage = () => {
    document.body.classList.add('f2-print-mode')
    setTimeout(() => {
      window.print()
      setTimeout(() => document.body.classList.remove('f2-print-mode'), 500)
    }, 100)
  }

  return (
    <button onClick={printPage} title="打印优化模式" style={{
      position: 'fixed', bottom: 305, right: 30, zIndex: 98,
      width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--card2,#22263a)', color: 'var(--text)', border: '1px solid var(--border)',
      cursor: 'pointer', fontSize: '1.2em', boxShadow: '0 4px 15px rgba(0,0,0,.3)', transition: 'transform .2s',
    }}>🖨</button>
  )
}
