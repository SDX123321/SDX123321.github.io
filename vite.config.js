import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    // Sentry sourcemap 上传（仅在 SENTRY_AUTH_TOKEN 和 VITE_SENTRY_DSN 均存在时激活）
    process.env.SENTRY_AUTH_TOKEN && process.env.VITE_SENTRY_DSN
      ? sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          telemetry: false,
        })
      : null,
  ].filter(Boolean),
  base: '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
    watch: {
      ignored: ['**/target/**', '**/server-rs/target/**'],
    },
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    // 'hidden'：仍然生成并上传 sourcemap 给 Sentry 解析错误堆栈，
    // 但 JS 里不带 sourceMappingURL 注释，浏览器不会去下载（部署产物省约 11MB）。
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          'graph-vendor': ['three', '3d-force-graph'],
          'markdown-vendor': ['marked', 'dompurify', 'katex'],
          'docs-vendor': ['mammoth'],
        },
      },
    },
  },
})
