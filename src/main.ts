import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/app.css'

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
