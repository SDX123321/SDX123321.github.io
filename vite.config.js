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
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true, // 启用 Sourcemap 以便 Sentry 解析错误堆栈
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router'],
        },
      },
    },
  },
})
