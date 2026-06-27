import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Saves and restores scroll position per route path.
 * Replaces remember.js — saves every 10s, on beforeunload, and on visibilitychange.
 * Restores on mount with a brief toast notification.
 *
 * @param {number} intervalMs - save interval in ms (default 10000)
 */
export default function useScrollMemory(intervalMs = 10000) {
  const location = useLocation()
  const keyRef = useRef('')

  useEffect(() => {
    const path = location.pathname
    keyRef.current = 'scroll_' + path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)

    // Restore saved position
    let saved = 0
    try {
      saved = parseInt(localStorage.getItem(keyRef.current)) || 0
    } catch (e) {}

    if (saved > 200) {
      // Wait a moment for content to render, then scroll
      const timer = setTimeout(() => {
        window.scrollTo({ top: saved, behavior: 'instant' })
        showToast()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Save periodically
    const interval = setInterval(() => {
      try {
        localStorage.setItem(keyRef.current, String(window.scrollY))
      } catch (e) {}
    }, intervalMs)

    // Save on unload
    const saveNow = () => {
      try {
        localStorage.setItem(keyRef.current, String(window.scrollY))
      } catch (e) {}
    }
    window.addEventListener('beforeunload', saveNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow()
    })

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', saveNow)
    }
  }, [intervalMs])
}

function showToast() {
  const toast = document.createElement('div')
  toast.textContent = '📍 已恢复上次阅读位置'
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card,#1e293b);color:var(--text,#e8eaf0);padding:8px 20px;border-radius:20px;font-size:.82rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:fadeInUp .3s ease;pointer-events:none;'
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity .4s'
    setTimeout(() => toast.remove(), 400)
  }, 2200)
}
