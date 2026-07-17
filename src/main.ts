import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/app.css'

let handshakePromise: Promise<string> | null = null

async function getApiKey(): Promise<string> {
  const cached = sessionStorage.getItem('visitor_api_key')
  if (cached) return cached

  if (handshakePromise) return handshakePromise

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://127.0.0.1:8787'
  handshakePromise = (async () => {
    try {
      const response = await originalFetch(`${API_BASE}/api/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Handshake failed')
      const data = (await response.json()) as { apiKey: string }
      sessionStorage.setItem('visitor_api_key', data.apiKey)
      return data.apiKey
    } catch (error) {
      handshakePromise = null
      throw error
    }
  })()

  return handshakePromise
}

const originalFetch = window.fetch
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  let url = ''
  if (typeof input === 'string') {
    url = input
  } else if (input instanceof URL) {
    url = input.href
  } else {
    url = input.url
  }

  if (
    url.includes('/api/') &&
    !url.includes('/api/handshake') &&
    !url.includes('/api/turnstile-verify')
  ) {
    try {
      const apiKey = await getApiKey()
      init = init || {}
      const headers = new Headers(init.headers)
      headers.set('X-API-Key', apiKey)
      init.headers = headers
    } catch (e) {
      console.error('Failed to authenticate API requests:', e)
    }
  }
  return originalFetch(input, init)
}

async function bootstrap() {
  const app = createApp(App)
  app.use(router)

  if (import.meta.env.VITE_SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/vue')
      Sentry.init({
        app,
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
        integrations: [Sentry.browserTracingIntegration({ router })],
        tracesSampleRate: 0.1,
      })
    } catch {
      // Monitoring must never block the study interface.
    }
  }

  app.mount('#app')
}

void bootstrap()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
