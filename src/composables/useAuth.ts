/**
 * 全局认证状态 — 替代 React 的 AuthContext.jsx
 * 使用 Vue 模块级响应式对象，所有组件调用 useAuth() 共享同一实例。
 */
import { ref, readonly } from 'vue'
import { collectLocalProgressSnapshot } from '../features/account/progressSnapshot'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787'

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

// ── 模块级响应式状态（所有组件共享） ──
const user = ref<SessionUser | null>(null)
const stats = ref<AuthStats | null>(null)
const loading = ref(true)
const busy = ref(false)
const apiAvailable = ref(true)
const mustChangePassword = ref(false)
const lastImport = ref<{ imported: number; snapshot: unknown } | null>(null)

// ── 内部 API 工具函数 ──

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
    const error = Object.assign(new Error((data['error'] as string) || `HTTP ${response.status}`), {
      status: response.status,
    })
    throw error
  }
  return data
}

// ── 公共操作 ──

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

async function refresh(): Promise<SessionUser | null> {
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

// 应用启动时异步拉取登录状态
window.setTimeout(() => refresh(), 0)

/**
 * useAuth — 在任意 Vue 组件中调用，共享同一个响应式状态实例。
 * 使用 getter 语法，模板和 script 中均可直接用 auth.user.username 等，无需 .value。
 */
export function useAuth() {
  return {
    get user() {
      return user.value
    },
    get stats() {
      return stats.value
    },
    get loading() {
      return loading.value
    },
    get busy() {
      return busy.value
    },
    get apiAvailable() {
      return apiAvailable.value
    },
    get mustChangePassword() {
      return mustChangePassword.value
    },
    get lastImport() {
      return lastImport.value
    },
    // Keep raw refs for components that need reactivity via watch
    userRef: readonly(user),
    login: (username: string, password: string) => authenticate('login', username, password),
    register: (username: string, password: string) => authenticate('register', username, password),
    logout,
    refresh,
    refreshStats,
    importLocalProgress,
    syncStudyEvent,
    syncGaokaoAttempt,
    fetchGaokaoWeaknesses,
  }
}
