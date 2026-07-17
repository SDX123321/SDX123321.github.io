<script setup lang="ts">
/**
 * WrongBookFAB — 替代 React 的 features/wrong-book/WrongBookFAB.jsx
 * 错题本浮动按钮及弹窗，支持按页面分组、清空和导出。
 */
import { ref, computed } from 'vue'
import { useWrongBook } from '../../composables/useWrongBook'

const { wrongs, clearAll, exportAsText, grouped } = useWrongBook()
const open = ref(false)
const filter = ref('all')

const groups = computed(() => grouped())
const pages = computed(() => Object.keys(groups.value))
const filtered = computed(() =>
  filter.value === 'all' ? wrongs.value : groups.value[filter.value] || [],
)

function confirmClearAll() {
  if (window.confirm('确定清空所有错题？')) clearAll()
}
</script>

<template>
  <!-- FAB 按钮 -->
  <button class="wb-fab" title="错题本" @click="open = !open">
    📝
    <span v-if="wrongs.length > 0" class="wb-badge">{{ wrongs.length }}</span>
  </button>

  <!-- 弹窗 -->
  <Teleport to="body">
    <div v-if="open" class="wb-overlay" @click.self="open = false">
      <div class="wb-panel">
        <button class="wb-close" @click="open = false">&times;</button>
        <h3 class="wb-title">📝 错题本</h3>

        <!-- 分组 tab -->
        <div class="wb-tabs">
          <button :class="['wb-tab', { active: filter === 'all' }]" @click="filter = 'all'">
            全部 ({{ wrongs.length }})
          </button>
          <button
            v-for="p in pages"
            :key="p"
            :class="['wb-tab', { active: filter === p }]"
            @click="filter = p"
          >
            {{ p }} ({{ groups[p].length }})
          </button>
        </div>

        <!-- 错题列表 -->
        <p v-if="filtered.length === 0" class="wb-empty">暂无错题，继续加油！</p>
        <div v-else>
          <div v-for="(w, i) in [...filtered].reverse()" :key="i" class="wb-item">
            <div class="wb-question">{{ w.question }}</div>
            <div class="wb-answers">
              <span class="wb-wrong">✗ 你的答案: {{ w.userAnswer }}</span
              ><br />
              <span class="wb-correct">✓ 正确答案: {{ w.correctAnswer }}</span>
            </div>
            <div class="wb-time">{{ new Date(w.time).toLocaleString() }}</div>
          </div>
        </div>

        <!-- 操作 -->
        <div v-if="wrongs.length > 0" class="wb-actions">
          <button class="wb-btn wb-btn-clear" @click="confirmClearAll">清空错题</button>
          <button class="wb-btn wb-btn-export" @click="exportAsText">导出为文本</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wb-fab {
  position: fixed;
  bottom: 140px;
  right: 30px;
  z-index: 98;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--red, #ef4444);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}
.wb-fab:hover {
  transform: scale(1.1);
}
.wb-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #fff;
  color: var(--red, #ef4444);
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.wb-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-panel {
  background: var(--card, #1a1d27);
  border-radius: 16px;
  padding: 28px;
  max-width: 720px;
  width: 92vw;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  position: relative;
}
.wb-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.3rem;
  color: var(--text3);
  cursor: pointer;
  line-height: 1;
}
.wb-title {
  margin: 0 0 16px;
  font-size: 1.15rem;
  color: var(--accent2, #a29bfe);
}
.wb-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.wb-tab {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}
.wb-tab.active {
  background: var(--accent, #6c5ce7);
  color: #fff;
  border-color: var(--accent);
}
.wb-empty {
  color: var(--text2);
}
.wb-item {
  background: var(--card2, #232736);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 8px 0;
  border: 1px solid var(--border);
}
.wb-question {
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 0.92rem;
}
.wb-answers {
  font-size: 0.85rem;
  color: var(--text2);
}
.wb-wrong {
  color: var(--red, #ff6b6b);
}
.wb-correct {
  color: var(--green, #00cec9);
}
.wb-time {
  font-size: 0.72rem;
  color: var(--text3);
  margin-top: 4px;
}
.wb-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
.wb-btn {
  border: none;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.82rem;
}
.wb-btn-clear {
  background: var(--red, #ff6b6b);
  color: #fff;
}
.wb-btn-export {
  background: var(--card2, #22263a);
  color: var(--text);
  border: 1px solid var(--border);
}
</style>
