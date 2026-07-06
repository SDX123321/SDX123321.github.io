import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { collectLocalProgressSnapshot } from './progressSnapshot'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787'
const AuthContext = createContext(null)

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed')
    error.status = response.status
    throw error
  }
  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState(true)
  const [lastImport, setLastImport] = useState(null)

  const refreshStats = useCallback(async () => {
    try {
      const data = await api('/api/me/stats')
      setStats(data.stats)
      setApiAvailable(true)
      return data.stats
    } catch (error) {
      if (error.status === 401) setStats(null)
      else setApiAvailable(false)
      return null
    }
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const data = await api('/api/me')
      setUser(data.user)
      setApiAvailable(true)
      await refreshStats()
      return data.user
    } catch (error) {
      if (error.status === 401) setUser(null)
      else setApiAvailable(false)
      return null
    } finally {
      setLoading(false)
    }
  }, [refreshStats])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshMe()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshMe])

  const importLocalProgress = useCallback(async () => {
    const payload = collectLocalProgressSnapshot()
    try {
      const data = await api('/api/me/import-local', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setStats(data.stats)
      setLastImport({ imported: data.imported, snapshot: payload.snapshot })
      setApiAvailable(true)
      return data
    } catch (error) {
      setApiAvailable(error.status === 401 ? apiAvailable : false)
      return null
    }
  }, [apiAvailable])

  const login = useCallback(async (username, password) => {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(data.user)
    setApiAvailable(true)
    await importLocalProgress()
    await refreshStats()
    return data.user
  }, [importLocalProgress, refreshStats])

  const register = useCallback(async (username, password) => {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(data.user)
    setApiAvailable(true)
    await importLocalProgress()
    await refreshStats()
    return data.user
  }, [importLocalProgress, refreshStats])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // The session may already be expired locally or on the API.
    }
    setUser(null)
    setStats(null)
  }, [])

  const syncStudyEvent = useCallback(async event => {
    if (!user) return false
    try {
      await api('/api/study/event', {
        method: 'POST',
        body: JSON.stringify(event),
      })
      setApiAvailable(true)
      return true
    } catch (error) {
      if (error.status === 401) setUser(null)
      else setApiAvailable(false)
      return false
    }
  }, [user])

  const syncGaokaoAttempt = useCallback(async attempt => {
    if (!user) return false
    try {
      await api('/api/gaokao/attempts', {
        method: 'POST',
        body: JSON.stringify(attempt),
      })
      setApiAvailable(true)
      return true
    } catch (error) {
      if (error.status === 401) setUser(null)
      else setApiAvailable(false)
      return false
    }
  }, [user])

  const value = useMemo(() => ({
    user,
    stats,
    loading,
    apiAvailable,
    lastImport,
    login,
    register,
    logout,
    refreshMe,
    refreshStats,
    importLocalProgress,
    syncStudyEvent,
    syncGaokaoAttempt,
  }), [
    user,
    stats,
    loading,
    apiAvailable,
    lastImport,
    login,
    register,
    logout,
    refreshMe,
    refreshStats,
    importLocalProgress,
    syncStudyEvent,
    syncGaokaoAttempt,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
