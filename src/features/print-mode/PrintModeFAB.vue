<script setup lang="ts">
/**
 * PrintModeFAB — 替代 React 的 features/print-mode/PrintModeFAB.jsx
 * 浮动按钮，一键切换打印优化模式。
 */
import { ref } from 'vue'

const PRINT_CSS = `
body.f2-print-mode{background:#fff!important;color:#1a1a1a!important}
body.f2-print-mode .main,main{margin:0!important;padding:16px!important;max-width:100%!important}
body.f2-print-mode .sidebar,.sidebar{display:none!important}
body.f2-print-mode nav,header,footer,.fab-group{display:none!important}
body.f2-print-mode .section{border:none!important;padding:0!important}
body.f2-print-mode table{font-size:.85rem}
body.f2-print-mode pre{border:1px solid #ccc;overflow:visible;white-space:pre-wrap}
@media print{body.f2-print-mode .no-print{display:none!important}}
`

const active = ref(false)
let styleEl: HTMLStyleElement | null = null

function toggle() {
  active.value = !active.value
  if (active.value) {
    styleEl = document.createElement('style')
    styleEl.textContent = PRINT_CSS
    document.head.appendChild(styleEl)
    document.body.classList.add('f2-print-mode')
  } else {
    styleEl?.remove()
    document.body.classList.remove('f2-print-mode')
  }
}
</script>

<template>
  <button class="pm-fab" :title="active ? '退出打印模式' : '打印优化模式'" @click="toggle">
    🖨
  </button>
</template>

<style scoped>
.pm-fab {
  position: fixed;
  bottom: 85px;
  right: 30px;
  z-index: 98;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card, #1e2235);
  color: var(--text);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 1.2em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}
.pm-fab:hover {
  transform: scale(1.1);
}
</style>
