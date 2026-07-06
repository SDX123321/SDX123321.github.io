import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

function dwellKey(pathname) {
  return 'dwell_' + pathname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 48)
}

function courseFromPath(pathname) {
  const match = pathname.match(/\/courses\/([^/]+)/)
  return match?.[1] || null
}

function subjectFromPath(pathname) {
  const match = pathname.match(/\/courses\/gaokao\/([^/]+)/)
  return match?.[1] || null
}

export default function StudyTracker() {
  const location = useLocation()
  const { syncStudyEvent } = useAuth()
  const startedAtRef = useRef(Date.now())
  const pathRef = useRef(location.pathname)

  useEffect(() => {
    const flush = () => {
      const now = Date.now()
      const seconds = Math.max(0, Math.round((now - startedAtRef.current) / 1000))
      const path = pathRef.current
      if (seconds < 5) {
        startedAtRef.current = now
        return
      }

      try {
        const key = dwellKey(path)
        const raw = localStorage.getItem(key)
        const current = raw ? Number(JSON.parse(raw)) || 0 : 0
        localStorage.setItem(key, JSON.stringify(current + seconds))
      } catch {}

      syncStudyEvent({
        eventType: 'page_dwell',
        course: courseFromPath(path),
        subject: subjectFromPath(path),
        pagePath: path,
        payload: { seconds },
      })
      startedAtRef.current = now
    }

    const interval = setInterval(flush, 30000)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      clearInterval(interval)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [syncStudyEvent])

  useEffect(() => {
    const previousPath = pathRef.current
    const now = Date.now()
    const seconds = Math.max(0, Math.round((now - startedAtRef.current) / 1000))
    if (previousPath !== location.pathname && seconds >= 5) {
      try {
        const key = dwellKey(previousPath)
        const raw = localStorage.getItem(key)
        const current = raw ? Number(JSON.parse(raw)) || 0 : 0
        localStorage.setItem(key, JSON.stringify(current + seconds))
      } catch {}
      syncStudyEvent({
        eventType: 'page_dwell',
        course: courseFromPath(previousPath),
        subject: subjectFromPath(previousPath),
        pagePath: previousPath,
        payload: { seconds },
      })
    }
    pathRef.current = location.pathname
    startedAtRef.current = now
  }, [location.pathname, syncStudyEvent])

  return null
}
