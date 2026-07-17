<script setup lang="ts">
/**
 * PWAManager — 替代 React 的 features/pwa/PWAManager.jsx
 * 注册 Service Worker，处理安装和更新提示。渲染为空节点。
 */
import { ref, onMounted } from 'vue'

const showInstall = ref(false)
const showUpdate = ref(false)

let deferredPrompt: any = null

onMounted(() => {
  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdate.value = true
            }
          })
        })
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('[PWA] SW registration failed:', err)
      })
  }

  // 安装提示
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e
    showInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    showInstall.value = false
    deferredPrompt = null
  })
})

function installApp() {
  deferredPrompt?.prompt()
  deferredPrompt?.userChoice.then(() => {
    showInstall.value = false
    deferredPrompt = null
  })
}

function applyUpdate() {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }))
    window.location.reload()
  })
}
</script>

<template>
  <Teleport to="body">
    <!-- 安装横幅 -->
    <div v-if="showInstall" class="pwa-banner">
      <span>将「期末复习笔记」添加到桌面，离线也能用 📱</span>
      <button class="pwa-btn pwa-btn-install" @click="installApp">添加到主屏幕</button>
      <button class="pwa-btn pwa-btn-close" @click="showInstall = false">×</button>
    </div>

    <!-- 更新提示 -->
    <div v-if="showUpdate" class="pwa-banner pwa-banner-update">
      <span>✨ 发现新版本，刷新即可生效</span>
      <button class="pwa-btn pwa-btn-install" @click="applyUpdate">立即刷新</button>
      <button class="pwa-btn pwa-btn-close" @click="showUpdate = false">×</button>
    </div>
  </Teleport>
</template>

<style scoped>
.pwa-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 14px 24px;
  background: var(--card, #1a1d27);
  border-top: 1px solid var(--border, #2d3436);
  font-size: 0.88rem;
  color: var(--text);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
}
.pwa-banner-update {
  background: rgba(108, 138, 255, 0.1);
  border-top-color: var(--accent, #6c8aff);
}
.pwa-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 0.85rem;
}
.pwa-btn-install {
  background: var(--accent, #6c8aff);
  color: #fff;
  font-weight: 600;
}
.pwa-btn-close {
  background: none;
  border: 1px solid var(--border);
  color: var(--text3);
}
</style>
