<script setup lang="ts">
/**
 * PageSearch — 替代 React 的 features/search/PageSearch.jsx
 * 当前页面内容搜索（Ctrl+F 拦截），高亮并跳转匹配项。
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'

const open = ref(false)
const query = ref('')
const matches = ref<HTMLElement[]>([])
const currentIdx = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

function clearMarks() {
  document.querySelectorAll('mark.psm').forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent || ''))
  })
  document.querySelectorAll('.main, main').forEach((el) => el.normalize())
}

function doSearch(q: string) {
  clearMarks()
  query.value = q
  if (!q.trim()) {
    matches.value = []
    return
  }
  const main = document.querySelector('.main') || document.querySelector('main')
  if (!main) return
  const found: HTMLElement[] = []
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
  const nodes: Node[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach((node) => {
    const idx = (node.textContent || '').toLowerCase().indexOf(q.toLowerCase())
    if (idx >= 0 && (node.parentElement as HTMLElement).closest('mark') === null) {
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + q.length)
        const mark = document.createElement('mark')
        mark.className = 'psm'
        mark.style.cssText =
          'background:rgba(250,204,21,.4);color:inherit;padding:0 1px;border-radius:2px;'
        range.surroundContents(mark)
        found.push(mark)
      } catch {
        /* text node split across elements */
      }
    }
  })
  matches.value = found
  currentIdx.value = 0
  if (found.length > 0) scrollToMatch(found, 0)
}

function scrollToMatch(marks: HTMLElement[], idx: number) {
  marks.forEach((m, i) => {
    m.style.outline = i === idx ? '2px solid var(--accent)' : 'none'
  })
  marks[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

watch(currentIdx, (idx) => {
  if (matches.value.length > 0) scrollToMatch(matches.value, idx)
})

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'f') {
    if (document.querySelector('.main')) {
      e.preventDefault()
      open.value = true
      setTimeout(() => inputRef.value?.focus(), 50)
    }
  }
  if (e.key === 'Escape' && open.value) {
    open.value = false
    clearMarks()
  }
  if (e.key === 'F3' || (e.key === 'g' && e.ctrlKey)) {
    e.preventDefault()
    currentIdx.value = (currentIdx.value + 1) % Math.max(matches.value.length, 1)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearMarks()
})
</script>

<template>
  <div v-if="open" class="ps-bar">
    <span class="ps-icon">🔍</span>
    <input
      ref="inputRef"
      :value="query"
      autofocus
      placeholder="搜索当前页面…"
      class="ps-input"
      @input="doSearch(($event.target as HTMLInputElement).value)"
      @keydown.enter="currentIdx = (currentIdx + 1) % Math.max(matches.length, 1)"
      @keydown.escape="
        open = false
        clearMarks()
      "
    />
    <span class="ps-count">
      {{ matches.length > 0 ? `${currentIdx + 1}/${matches.length}` : query ? '无匹配' : '' }}
    </span>
    <button class="ps-nav" @click="currentIdx = Math.max(currentIdx - 1, 0)">▲</button>
    <button class="ps-nav" @click="currentIdx = (currentIdx + 1) % Math.max(matches.length, 1)">
      ▼
    </button>
    <button
      class="ps-close"
      @click="
        open = false
        clearMarks()
      "
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.ps-bar {
  position: fixed;
  top: 3px;
  left: 280px;
  right: 0;
  z-index: 99;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--card, #1e293b);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.ps-icon {
  font-size: 0.78rem;
  color: var(--text3);
}
.ps-input {
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.82rem;
  outline: none;
}
.ps-count {
  font-size: 0.75rem;
  color: var(--text3);
  min-width: 40px;
}
.ps-nav,
.ps-close {
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 0.8rem;
}
.ps-close {
  font-size: 0.9rem;
  color: var(--text3);
}
</style>
