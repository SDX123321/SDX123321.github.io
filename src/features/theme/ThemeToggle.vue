<script setup lang="ts">
/**
 * ThemeToggle — 替代 React 的 features/theme/ThemeToggle.jsx
 * 主题切换按钮（深色/浅色）。
 */
import { useTheme } from '../../composables/useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    id="themeToggle"
    class="theme-btn"
    :title="isDark ? '切换为浅色模式' : '切换为深色模式'"
    :aria-label="isDark ? '切换为浅色模式' : '切换为深色模式'"
    @click="toggleTheme"
  >
    <span v-if="isDark">☀</span>
    <span v-else>🌙</span>
  </button>
</template>

<style scoped>
.theme-btn {
  position: fixed;
  top: 14px;
  right: 18px;
  z-index: 95;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 1rem;
  transition: transform 0.2s;
}
.theme-btn:hover {
  transform: scale(1.1);
}
</style>
