<script setup lang="ts">
/**
 * GlobalSearch — 替代 React 的 features/search/GlobalSearch.jsx
 * 全局文件搜索框，使用 Fuse.js 模糊匹配。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { FILES } from '../../data/files'

interface FileEntry {
  n: string // name
  sn: string // subject name
  tn: string // type name
  sz: string // size
  s: string // subject
  t: string // type
  p: string // path
  c: string // color
}

const query = ref('')
const results = ref<FileEntry[]>([])
const focused = ref(false)
const selectedIdx = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)

let fuse: any = null

function fileUrl(f: FileEntry) {
  return f.p.startsWith('http') ? f.p : '/' + f.p
}

function doSearch(q: string) {
  query.value = q
  selectedIdx.value = -1
  if (!q.trim() || !fuse) {
    results.value = []
    return
  }

  results.value = fuse
    .search(q)
    .slice(0, 10)
    .map((m: any) => m.item)
}

function openFile(f: FileEntry) {
  window.open(fileUrl(f), '_blank')
  focused.value = false
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    inputRef.value?.focus()
  }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName !== 'INPUT') {
    e.preventDefault()
    inputRef.value?.focus()
  }
  if (e.key === 'Escape') {
    focused.value = false
    inputRef.value?.blur()
  }
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIdx.value = Math.min(selectedIdx.value + 1, results.value.length - 1)
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIdx.value = Math.max(selectedIdx.value - 1, 0)
  }
  if (e.key === 'Enter' && selectedIdx.value >= 0 && results.value[selectedIdx.value]) {
    openFile(results.value[selectedIdx.value])
  }
}

onMounted(() => {
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js'
  script.onload = () => {
    if ((window as unknown as Record<string, unknown>)['Fuse']) {
      fuse = new (window as any).Fuse(FILES, {
        keys: ['n', 'sn'],
        threshold: 0.4,
        includeScore: true,
      })
    }
  }
  document.head.appendChild(script)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onBlur() {
  setTimeout(() => {
    focused.value = false
  }, 200)
}
</script>

<template>
  <div class="search-section gs-wrap">
    <div class="gs-input-wrap">
      <span class="gs-icon">🔍</span>
      <input
        ref="inputRef"
        :value="query"
        placeholder="搜索知识点、资料名称… (Ctrl+K)"
        class="gs-input"
        @input="doSearch(($event.target as HTMLInputElement).value)"
        @focus="focused = true"
        @blur="onBlur"
        @keydown="onInputKeydown"
      />
    </div>
    <div v-if="focused && results.length > 0" class="gs-dropdown">
      <div
        v-for="(f, i) in results"
        :key="i"
        class="gs-item"
        :class="{ 'gs-item--active': i === selectedIdx }"
        @click="openFile(f)"
        @mouseenter="selectedIdx = i"
      >
        <div class="gs-item-name">{{ f.n }}</div>
        <div class="gs-item-meta">
          <span class="gs-tag" :style="{ background: f.c + '20', color: f.c }">{{ f.sn }}</span>
          <span>{{ f.tn }}</span>
          <span class="gs-size">{{ f.sz }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gs-wrap {
  max-width: 560px;
  margin: 0 auto 28px;
  position: relative;
  z-index: 100;
}
.gs-input-wrap {
  position: relative;
}
.gs-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text3);
  font-size: 1rem;
  pointer-events: none;
}
.gs-input {
  width: 100%;
  padding: 12px 16px 12px 40px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 0.92rem;
  outline: none;
  box-sizing: border-box;
}
.gs-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 6px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-height: 420px;
  overflow-y: auto;
  z-index: 200;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}
.gs-item {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--border);
}
.gs-item--active {
  background: var(--accent-bg, rgba(108, 138, 255, 0.1));
}
.gs-item-name {
  font-weight: 600;
  color: var(--text);
}
.gs-item-meta {
  font-size: 0.75rem;
  color: var(--text3);
  margin-top: 2px;
}
.gs-tag {
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
}
.gs-size {
  margin-left: 6px;
}
</style>
