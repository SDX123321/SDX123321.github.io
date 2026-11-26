import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/app.css'

let handshakePromise: Promise<string> | null = null
const apiBase = import.meta.env.VITE_API_BASE_URL || ''
const apiRoot = new URL(`${apiBase.replace(/\/$/, '')}/api/`, window.location.href)
const originalFetch = window.fetch.bind(window)

async function getApiKey(): Promise<string> {
  const cached = sessionStorage.getItem('visitor_api_key')
  if (cached) return cached

  if (handshakePromise) return handshakePromise

  handshakePromise = (async () => {
    const response = await originalFetch(new URL('handshake', apiRoot), { method: 'POST' })
    if (!response.ok) throw new Error('Handshake failed')
    const data = (await response.json()) as { apiKey: string }
    sessionStorage.setItem('visitor_api_key', data.apiKey)
    return data.apiKey
  })().finally(() => {
    handshakePromise = null
  })

  return handshakePromise
}

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input, window.location.href)
  const endpoint = url.pathname.slice(apiRoot.pathname.length)
  if (
    url.origin !== apiRoot.origin ||
    !url.pathname.startsWith(apiRoot.pathname) ||
    endpoint === 'handshake' ||
    endpoint.startsWith('turnstile-verify')
  ) {
    return originalFetch(input, init)
  }
  const request = new Request(input, init)
  const apiKey = await getApiKey().catch(() => null)
  if (!apiKey) return originalFetch(request)
  request.headers.set('X-API-Key', apiKey)
  const response = await originalFetch(request)
  if (response.status !== 401) return response
  const result = (await response.clone().json().catch(() => null)) as { error?: string } | null
  if (result?.error !== 'invalid_api_key') return response
  if (sessionStorage.getItem('visitor_api_key') === apiKey) {
    sessionStorage.removeItem('visitor_api_key')
  }
  const freshKey = await getApiKey().catch(() => null)
  if (!freshKey || input instanceof Request || init?.body instanceof ReadableStream) return response
  const retry = new Request(input, init)
  retry.headers.set('X-API-Key', freshKey)
  return originalFetch(retry)
}

async function bootstrap() {
  const app = createApp(App)
  app.use(createPinia())
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
