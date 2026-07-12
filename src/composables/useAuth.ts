import { ref } from 'vue'

export interface SessionUser {
  id: string
  username: string
  role: string
}

const user = ref<SessionUser | null>(null)
const ready = ref(false)
const busy = ref(false)
const mustChangePassword = ref(false)

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function refresh() {
  try {
    const body = await request('/api/me')
    user.value = body.user ?? body
    mustChangePassword.value = Boolean(body.mustChangePassword)
  } catch {
    user.value = null
    mustChangePassword.value = false
  } finally {
    ready.value = true
  }
}

async function authenticate(mode: 'login' | 'register', username: string, password: string) {
  busy.value = true
  try {
    const body = await request(`/api/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    user.value = body.user
    await refresh()
  } finally {
    busy.value = false
  }
}

async function logout() {
  await request('/api/auth/logout', { method: 'POST', body: '{}' })
  user.value = null
  mustChangePassword.value = false
}

export function useAuth() {
  if (!ready.value && !busy.value) void refresh()
  return {
    get user() {
      return user.value
    },
    get ready() {
      return ready.value
    },
    get busy() {
      return busy.value
    },
    get mustChangePassword() {
      return mustChangePassword.value
    },
    login: (username: string, password: string) => authenticate('login', username, password),
    register: (username: string, password: string) => authenticate('register', username, password),
    logout,
    refresh,
  }
}
