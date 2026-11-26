import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collectLocalProgressSnapshot } from '../features/account/progressSnapshot'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export interface SessionUser {
  id: string
  username: string
  role: string
  [key: string]: unknown
}

export interface AuthStats {
  totalStudySeconds: number
  chapterDoneCount: number
  wrongCount: number
  practiceDoneCount: number
  masteryItemCount: number
  currentStreakDays: number
  recentPaths: string[]
  [key: string]: unknown
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const stats = ref<AuthStats | null>(null)
  const loading = ref(true)
  const busy = ref(false)
  const apiAvailable = ref(true)
  const mustChangePassword = ref(false)
  const lastImport = ref<{ imported: number; snapshot: unknown } | null>(null)
  let pendingRefresh: Promise<SessionUser | null> | undefined
  let initialization: Promise<SessionUser | null> | undefined

  async function api(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      const error = Object.assign(
        new Error((data['error'] as string) || `HTTP ${response.status}`),
        {
          status: response.status,
        },
      )
      throw error
    }
    return data
  }

  async function refreshStats(): Promise<AuthStats | null> {
    try {
      const data = await api('/api/me/stats')
      stats.value = data['stats'] as AuthStats
      apiAvailable.value = true
      return stats.value
    } catch (e: unknown) {
      const err = e as { status?: number }
      if (err.status === 401) stats.value = null
      else apiAvailable.value = false
      return null
    }
  }

  function initialize() {
    initialization ??= refresh()
    return initialization
  }

  function refresh(): Promise<SessionUser | null> {
    pendingRefresh ??= refreshSession().finally(() => {
      pendingRefresh = undefined
    })
    return pendingRefresh
  }

  async function refreshSession(): Promise<SessionUser | null> {
    try {
      const data = await api('/api/me')
      user.value = (data['user'] ?? data) as SessionUser
      mustChangePassword.value = Boolean(data['mustChangePassword'])
      apiAvailable.value = true
      await refreshStats()
      return user.value
    } catch (e: unknown) {
      const err = e as { status?: number }
      if (err.status === 401) user.value = null
      else apiAvailable.value = false
      mustChangePassword.value = false
      return null
    } finally {
      loading.value = false
    }
  }

  async function importLocalProgress(): Promise<unknown> {
    const payload = collectLocalProgressSnapshot()
    try {
      const data = await api('/api/me/import-local', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      stats.value = data['stats'] as AuthStats
      lastImport.value = { imported: data['imported'] as number, snapshot: payload.snapshot }
      apiAvailable.value = true
      return data
    } catch (e: unknown) {
      const err = e as { status?: number }
      apiAvailable.value = err.status === 401 ? apiAvailable.value : false
      return null
    }
  }

  async function authenticate(
    mode: 'login' | 'register',
    username: string,
    password: string,
  ): Promise<SessionUser | null> {
    busy.value = true
    try {
      const data = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      user.value = data['user'] as SessionUser
      apiAvailable.value = true
      await importLocalProgress()
      await refreshStats()
      return user.value
    } finally {
      busy.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' })
    } catch {
      /* session may already be expired */
    }
    user.value = null
    stats.value = null
    mustChangePassword.value = false
  }

  async function syncStudyEvent(event: Record<string, unknown>): Promise<boolean> {
    if (!user.value) return false
    try {
      await api('/api/study/event', { method: 'POST', body: JSON.stringify(event) })
      apiAvailable.value = true
      return true
    } catch (e: unknown) {
      const err = e as { status?: number }
      if (err.status === 401) user.value = null
      else apiAvailable.value = false
      return false
    }
  }

  async function syncGaokaoAttempt(attempt: Record<string, unknown>): Promise<boolean> {
    if (!user.value) return false
    try {
      await api('/api/gaokao/attempts', { method: 'POST', body: JSON.stringify(attempt) })
      apiAvailable.value = true
      return true
    } catch (e: unknown) {
      const err = e as { status?: number }
      if (err.status === 401) user.value = null
      else apiAvailable.value = false
      return false
    }
  }

  async function fetchGaokaoWeaknesses(): Promise<unknown[]> {
    if (!user.value) return []
    try {
      const data = await api('/api/gaokao/weaknesses')
      apiAvailable.value = true
      return (data['weaknesses'] as unknown[]) || []
    } catch (e: unknown) {
      const err = e as { status?: number }
      if (err.status === 401) user.value = null
      else apiAvailable.value = false
      return []
    }
  }

  return {
    user,
    stats,
    loading,
    busy,
    apiAvailable,
    mustChangePassword,
    lastImport,
    login: (u: string, p: string) => authenticate('login', u, p),
    register: (u: string, p: string) => authenticate('register', u, p),
    logout,
    initialize,
    refresh,
    refreshStats,
    importLocalProgress,
    syncStudyEvent,
    syncGaokaoAttempt,
    fetchGaokaoWeaknesses,
  }
})
