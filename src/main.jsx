import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/theme.css'
import './styles/animations.css'

// Sentry 初始化（通过在 CI/环境里设 VITE_SENTRY_DSN 激活，不设则为 no-op）
if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        // 挂接到 ErrorBoundary 的钩子，double-report 由 Sentry 内置去重
        beforeSend(event) {
          // 可选：过滤掉不需要上报的错误（如用户网络恢复重试）
          return event
        },
      })

      // 挂载到 window，让 ErrorBoundary 通过 __errorSink__ 上报
      window.__errorSink__ = (error, info) => {
        try {
          Sentry.captureException(error, {
            captureContext: {
              extra: { componentStack: info?.componentStack || null },
            },
          })
        } catch {
          // Sentry 本身出事不影响用户
        }
      }

      // 现在渲染 App（Sentry 已就绪）
      renderApp()
    })
    .catch(() => {
      // Sentry 加载失败不影响站点
      renderApp()
    })
} else {
  // 没有 DSN 时不接入 Sentry
  renderApp()
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
