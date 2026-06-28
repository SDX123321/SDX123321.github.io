import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'

gsap.registerPlugin(ScrollToPlugin)

/**
 * Periodically saves scroll position per route path.
 * Restores on mount using GSAP for smooth scrolling.
 *
 * @param {number} intervalMs - save interval (default 8000)
 */
export default function useScrollMemory(intervalMs = 8000) {
  const location = useLocation()
  const keyRef = useRef('')

  useEffect(() => {
    const path = location.pathname
    keyRef.current = 'scroll_' + path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)

    let saved = 0
    try { saved = parseInt(localStorage.getItem(keyRef.current)) || 0 } catch (e) {}

    if (saved > 200) {
      const timer = setTimeout(() => {
        // GSAP smooth scroll to saved position
        gsap.to(window, {
          scrollTo: { y: saved, autoKill: true },
          duration: 0.8,
          ease: 'power2.inOut',
          onStart: () => showRestoreToast(saved),
        })
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [location.pathname])

  useEffect(() => {
    const saveNow = () => {
      try { localStorage.setItem(keyRef.current, String(window.scrollY)) } catch (e) {}
    }

    const interval = setInterval(saveNow, intervalMs)
    window.addEventListener('beforeunload', saveNow)
    const onVisChange = () => { if (document.visibilityState === 'hidden') saveNow() }
    document.addEventListener('visibilitychange', onVisChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', saveNow)
      document.removeEventListener('visibilitychange', onVisChange)
    }
  }, [intervalMs])
}

/**
 * Show a GSAP-animated toast at the bottom of the screen.
 * Also registers a "back to position" FAB that appears when user scrolls away.
 */
function showRestoreToast(savedY) {
  const toast = document.createElement('div')
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;z-index:9999;
    display:flex;align-items:center;gap:8px;
    padding:10px 22px;border-radius:24px;
    background:var(--card,#1e293b);color:var(--text,#e8eaf0);
    border:1px solid var(--border,#2d3436);
    box-shadow:0 6px 24px rgba(0,0,0,.3);
    font-size:.84rem;font-weight:500;
    pointer-events:none;white-space:nowrap;
    transform:translateX(-50%) translateY(30px);
    opacity:0;
  `
  toast.innerHTML = '<span style="font-size:1rem">📍</span>已恢复上次阅读位置'
  document.body.appendChild(toast)

  // GSAP entrance
  gsap.to(toast, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' })

  // GSAP exit after 2.5s
  gsap.to(toast, {
    opacity: 0, y: -10, duration: 0.35, ease: 'power2.in',
    delay: 2.5,
    onComplete: () => toast.remove(),
  })

  // "Back to position" FAB — shows when user scrolls away from saved position
  const fab = document.createElement('div')
  fab.style.cssText = `
    position:fixed;bottom:250px;right:30px;z-index:98;
    display:none;align-items:center;gap:8px;
    padding:8px 16px 8px 12px;border-radius:20px;
    background:var(--card,#1e293b);color:var(--accent,#6c63ff);
    border:1px solid var(--border,#2d3436);border-left:3px solid var(--accent,#6c63ff);
    box-shadow:0 4px 16px rgba(0,0,0,.25);
    cursor:pointer;font-size:.8rem;font-weight:600;white-space:nowrap;
    transform:translateX(20px);opacity:0;
  `
  fab.innerHTML = '<span>📍</span><span>上次位置</span>'
  document.body.appendChild(fab)

  fab.addEventListener('click', () => {
    gsap.to(window, { scrollTo: { y: savedY - 80, autoKill: true }, duration: 0.7, ease: 'power2.inOut' })
  })

  let fabVisible = false
  const onScroll = () => {
    const shouldShow = Math.abs(window.scrollY - savedY) > 600
    if (shouldShow && !fabVisible) {
      fabVisible = true
      fab.style.display = 'flex'
      gsap.to(fab, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' })
    } else if (!shouldShow && fabVisible) {
      fabVisible = false
      gsap.to(fab, {
        opacity: 0, x: 20, duration: 0.25, ease: 'power2.in',
        onComplete: () => { fab.style.display = 'none' },
      })
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  // Auto-cleanup FAB after 5 minutes to avoid stale elements
  setTimeout(() => {
    window.removeEventListener('scroll', onScroll)
    if (fab.parentNode) {
      gsap.to(fab, {
        opacity: 0, x: 20, duration: 0.3, ease: 'power2.in',
        onComplete: () => fab.remove(),
      })
    }
  }, 300000)
}
