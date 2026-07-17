/**
 * useScrollMemory — 替代 React 的 hooks/useScrollMemory.js
 * 按路由路径保存/恢复滚动位置，使用 GSAP 平滑滚动。
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'

gsap.registerPlugin(ScrollToPlugin)

export function useScrollMemory(intervalMs = 8000) {
  const route = useRoute()
  let scrollKey = ''
  let saveInterval: ReturnType<typeof setInterval> | null = null

  function getKey(path: string) {
    return 'scroll_' + path.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)
  }

  function saveNow() {
    try {
      localStorage.setItem(scrollKey, String(window.scrollY))
    } catch {
      /* quota exceeded */
    }
  }

  function showRestoreToast(savedY: number) {
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
      transform:translateX(-50%) translateY(30px);opacity:0;
    `
    toast.innerHTML = '<span style="font-size:1rem">📍</span>已恢复上次阅读位置'
    document.body.appendChild(toast)
    gsap.to(toast, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' })
    gsap.to(toast, {
      opacity: 0,
      y: -10,
      duration: 0.35,
      ease: 'power2.in',
      delay: 2.5,
      onComplete: () => toast.remove(),
    })

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
      gsap.to(window, {
        scrollTo: { y: savedY - 80, autoKill: true },
        duration: 0.7,
        ease: 'power2.inOut',
      })
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
          opacity: 0,
          x: 20,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: () => {
            fab.style.display = 'none'
          },
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    setTimeout(() => {
      window.removeEventListener('scroll', onScroll)
      if (fab.parentNode) {
        gsap.to(fab, {
          opacity: 0,
          x: 20,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => fab.remove(),
        })
      }
    }, 300_000)
  }

  function restoreScroll(path: string) {
    scrollKey = getKey(path)
    let saved = 0
    try {
      saved = parseInt(localStorage.getItem(scrollKey) || '0') || 0
    } catch {
      /* noop */
    }
    if (saved > 200) {
      setTimeout(() => {
        gsap.to(window, {
          scrollTo: { y: saved, autoKill: true },
          duration: 0.8,
          ease: 'power2.inOut',
          onStart: () => showRestoreToast(saved),
        })
      }, 300)
    }
  }

  watch(
    () => route.path,
    (path) => restoreScroll(path),
  )

  onMounted(() => {
    restoreScroll(route.path)
    saveInterval = setInterval(saveNow, intervalMs)
    window.addEventListener('beforeunload', saveNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow()
    })
  })

  onUnmounted(() => {
    if (saveInterval) clearInterval(saveInterval)
    window.removeEventListener('beforeunload', saveNow)
  })
}
