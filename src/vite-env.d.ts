/// <reference types="vite/client" />

// Vite env 变量类型声明。用 `import.meta.env.VITE_XXX` 时自动提示。
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 第三方库的全局声明
interface Window {
  turnstile?: {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string
    remove: (id: string) => void
  }
  MathJax?: Record<string, unknown>
  anime?: unknown
  __errorSink__?: (error: unknown, info?: unknown) => void
}
