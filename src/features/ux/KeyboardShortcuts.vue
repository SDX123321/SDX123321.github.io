<script setup lang="ts">
/**
 * KeyboardShortcuts — 替代 React 的 features/ux/KeyboardShortcuts.jsx
 * 显示键盘快捷键帮助弹窗，支持 T 切换主题、Ctrl+K 聚焦搜索。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useTheme } from '../../composables/useTheme'

const { toggleTheme } = useTheme()
const showHelp = ref(false)

const SHORTCUTS = [
  { key: '?', desc: '显示快捷键帮助' },
  { key: 'T', desc: '切换深浅色模式' },
  { key: 'Ctrl+K', desc: '聚焦搜索框' },
  { key: '/', desc: '聚焦搜索框' },
  { key: 'Esc', desc: '关闭弹窗/搜索' },
  { key: '↑', desc: '回到页面顶部' },
]

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    return

  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault()
    showHelp.value = !showHelp.value
  }
  if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    toggleTheme()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const input = document.querySelector<HTMLElement>('#globalSearch, .search-box input')
    input?.focus()
  }
  if (e.key === 'Escape') showHelp.value = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="showHelp" class="ks-overlay" @click.self="showHelp = false">
      <div class="ks-panel">
        <h3 class="ks-title">⌨ 快捷键</h3>
        <ul class="ks-list">
          <li v-for="s in SHORTCUTS" :key="s.key" class="ks-item">
            <span class="ks-desc">{{ s.desc }}</span>
            <kbd class="ks-kbd">{{ s.key }}</kbd>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ks-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ks-panel {
  background: var(--card, #1a1d27);
  border-radius: 16px;
  padding: 28px;
  max-width: 400px;
  width: 92vw;
  border: 1px solid var(--border, #2d3436);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
.ks-title {
  margin: 0 0 16px;
  font-size: 1.05rem;
  color: var(--text);
}
.ks-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.ks-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  font-size: 0.88rem;
  color: var(--text2, #9ba1b8);
}
.ks-kbd {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg3, #1e2235);
  border: 1px solid var(--border);
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--text);
}
</style>
