import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * 全局错误边界。
 * 任何子组件渲染时抛错都会被捕获，避免整棵 React 树白屏。
 * 提供"重试"和"回首页"两个动作。
 *
 * 注：error 仅在 production 构建里携带 message/stack（dev 仍可用）。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 上报到 window.__errorSink__（如果有接 Sentry 等可在此挂载）
    if (typeof window !== 'undefined' && window.__errorSink__) {
      try { window.__errorSink__(error, info) } catch {}
    }
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleHome = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined') window.location.href = '/'
  }

  override render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message || '未知错误'

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--bg, #0c0e1a)',
        color: 'var(--text, #e8eaf0)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: 12 }}>&#128534;</div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 12px' }}>页面出错了</h1>
          <p style={{ color: 'var(--text-light, #9ba1b8)', lineHeight: 1.7, margin: '0 0 8px' }}>
            抱歉，渲染过程中遇到了问题。你可以尝试重新加载，或返回首页。
          </p>
          <p style={{
            fontSize: '.8rem',
            color: 'var(--text-dim, #6b7180)',
            background: 'rgba(255,255,255,.04)',
            padding: '8px 12px',
            borderRadius: 8,
            margin: '16px 0',
            wordBreak: 'break-all',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {msg}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 26px',
                background: 'var(--accent, #6c8aff)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '.9rem',
              }}
            >
              重试
            </button>
            <button
              onClick={this.handleHome}
              style={{
                padding: '10px 26px',
                background: 'transparent',
                color: 'var(--text, #e8eaf0)',
                border: '1px solid var(--border, #2a2e3c)',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '.9rem',
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    )
  }
}
