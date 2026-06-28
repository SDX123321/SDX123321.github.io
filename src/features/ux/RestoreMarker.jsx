import { useEffect, useState, useRef } from 'react'

function getScrollKey() {
  const path = window.location.pathname
  return 'scroll_' + path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)
}

export default function RestoreMarker() {
  const [visible, setVisible] = useState(false)
  const [showBack, setShowBack] = useState(false)
  const markerRef = useRef(null)
  const backRef = useRef(null)

  useEffect(() => {
    const key = getScrollKey()
    const saved = parseInt(localStorage.getItem(key)) || 0
    if (saved <= 200) return

    // Wait for content to render
    const timer = setTimeout(() => {
      // Create bubble
      const el = document.createElement('div')
      el.className = 'ux-marker'
      el.style.cssText = 'position:absolute;left:20px;top:' + (saved - 60) + 'px;z-index:55;animation:uxBubbleIn .45s cubic-bezier(.34,1.56,.64,1);pointer-events:auto'
      el.innerHTML = '<div style="position:relative;display:flex;align-items:center;gap:12px;padding:12px 16px 12px 14px;background:var(--card,#1e2235);border:1px solid var(--border,#2d3436);border-left:3px solid var(--accent,#6c63ff);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.25);min-width:200px">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:var(--accent,#6c63ff);flex-shrink:0;animation:uxDotPulse 2s ease-in-out infinite"></div>' +
        '<div style="flex:1;font-size:.82rem;color:var(--text)">上次学到这里</div>' +
        '<button class="ux-marker-go" style="padding:5px 14px;border-radius:8px;border:none;background:var(--accent,#6c63ff);color:#fff;font-size:.78rem;font-weight:600;cursor:pointer">跳转</button>' +
        '<button class="ux-marker-close" style="position:absolute;top:6px;right:8px;width:20px;height:20px;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center">&times;</button>' +
        '</div>'
      const main = document.querySelector('.main') || document.querySelector('main') || document.body
      main.appendChild(el)
      markerRef.current = el

      // Jump button
      el.querySelector('.ux-marker-go').addEventListener('click', (e) => {
        e.stopPropagation()
        window.scrollTo({ top: saved - 80, behavior: 'smooth' })
      })
      el.addEventListener('click', () => window.scrollTo({ top: saved - 80, behavior: 'smooth' }))

      // Close button
      el.querySelector('.ux-marker-close').addEventListener('click', (e) => {
        e.stopPropagation()
        el.style.animation = 'uxBubbleOut .35s ease forwards'
        setTimeout(() => el.remove(), 350)
      })

      // Auto hide after 6s
      setTimeout(() => {
        if (el.parentNode) {
          el.style.animation = 'uxBubbleOut .35s ease forwards'
          setTimeout(() => { if (el.parentNode) el.remove() }, 350)
        }
      }, 6000)

      // Create back FAB
      const back = document.createElement('div')
      back.className = 'ux-back-to-marker'
      back.style.cssText = 'position:fixed;bottom:250px;right:30px;z-index:99;display:none;pointer-events:auto'
      back.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px 8px 12px;background:var(--card,#1e2235);border:1px solid var(--border,#2d3436);border-left:3px solid var(--accent,#6c63ff);border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;font-size:.8rem;color:var(--accent,#6c63ff);font-weight:600;white-space:nowrap">' +
        '<span>📍</span><span>上次学到这里</span></div>'
      document.body.appendChild(back)
      back.addEventListener('click', () => window.scrollTo({ top: saved - 80, behavior: 'smooth' }))
      backRef.current = back

      // Scroll listener
      const handler = () => {
        const dist = Math.abs(window.scrollY - saved)
        if (back) back.style.display = dist > 600 ? 'block' : 'none'
      }
      window.addEventListener('scroll', handler, { passive: true })

      setVisible(true)
    }, 1500)

    return () => {
      clearTimeout(timer)
      markerRef.current?.remove()
      backRef.current?.remove()
    }
  }, [])

  return null
}
