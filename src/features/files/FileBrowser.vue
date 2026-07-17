<script setup lang="ts">
/**
 * FileBrowser — 替代 React 的 features/files/FileBrowser.jsx
 * 文件列表浏览器，支持学科/类型筛选和预览弹窗。
 */
import { ref, computed } from 'vue'
import { FILES } from '../../data/files'

interface FileEntry {
  n: string
  sn: string
  tn: string
  sz: string
  s: string
  t: string
  p: string
  c: string
}

const TYPE_MAP: Record<string, string> = {
  exam: '历年试卷',
  review: '复习资料',
  answer: '参考答案',
  textbook: '电子课本',
  slides: '课件',
  homework: '作业',
  lab: '实验',
}

const subject = ref('')
const type = ref('')
const previewFile = ref<FileEntry | null>(null)
const tip = ref<{ file: FileEntry; x: number; y: number } | null>(null)

const subjects = computed(() => {
  const seen = new Set<string>()
  return (FILES as FileEntry[]).reduce((acc: { slug: string; name: string }[], f) => {
    if (!seen.has(f.s)) {
      seen.add(f.s)
      acc.push({ slug: f.s, name: f.sn })
    }
    return acc
  }, [])
})

const filtered = computed(() =>
  (FILES as FileEntry[]).filter(
    (f) => (!subject.value || f.s === subject.value) && (!type.value || f.t === type.value),
  ),
)

function fileUrl(f: FileEntry) {
  return f.p.startsWith('http') ? f.p : '/' + f.p
}

function downloadFile(f: FileEntry) {
  if (f.t === 'textbook') {
    if (confirm('该电子课本仅供个人学习交流使用，不得用于商业用途。是否继续？')) {
      window.open(fileUrl(f), '_blank')
    }
    return
  }
  window.open(fileUrl(f), '_blank')
}

function getPreviewUrl(f: FileEntry) {
  const url = fileUrl(f)
  if (f.p.endsWith('.pptx') || f.p.endsWith('.docx')) {
    return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
  }
  return url
}

function showTip(f: FileEntry, e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = { file: f, x: r.left + 16, y: r.top - 4 }
}
</script>

<template>
  <div>
    <!-- 筛选栏 -->
    <div id="filterBar" class="fb-filters">
      <div class="fb-filter-group">
        <span class="fb-label">学科：</span>
        <button
          :class="['filter-btn', { active: subject === '' }]"
          data-g="s"
          data-v=""
          @click="subject = ''"
        >
          全部
        </button>
        <button
          v-for="s in subjects"
          :key="s.slug"
          :class="['filter-btn', { active: subject === s.slug }]"
          :data-g="'s'"
          :data-v="s.slug"
          @click="subject = s.slug"
        >
          {{ s.name }}
        </button>
      </div>
      <div class="fb-filter-group">
        <span class="fb-label">类型：</span>
        <button
          :class="['filter-btn', { active: type === '' }]"
          data-g="t"
          data-v=""
          @click="type = ''"
        >
          全部
        </button>
        <button
          v-for="[k, name] in Object.entries(TYPE_MAP)"
          :key="k"
          :class="['filter-btn', { active: type === k }]"
          :data-g="'t'"
          :data-v="k"
          @click="type = k"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <div id="fileCount" class="fb-count">共 {{ filtered.length }} 个文件</div>

    <!-- 文件列表 -->
    <div id="fileList" class="fb-grid">
      <div
        v-for="(f, i) in filtered"
        :key="i"
        class="file-card"
        @mouseenter="showTip(f, $event)"
        @mouseleave="tip = null"
      >
        <div class="fb-card-left">
          <div class="fb-icon" :style="{ background: f.c + '20', color: f.c }">
            {{ f.tn.slice(0, 2) }}
          </div>
          <div class="fb-info">
            <div class="fb-name">{{ f.n }}</div>
            <div class="fb-meta">
              <span class="fb-tag" :style="{ background: f.c + '20', color: f.c }">{{ f.sn }}</span>
              {{ f.sz }}
            </div>
          </div>
        </div>
        <div class="fb-actions">
          <button class="dl-btn dl-btn-preview" @click="previewFile = f">预览</button>
          <button class="dl-btn dl-btn-download" @click="downloadFile(f)">下载</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 预览弹窗 -->
  <Teleport to="body">
    <div v-if="previewFile" class="fb-modal-overlay" @click.self="previewFile = null">
      <div class="fb-modal">
        <div class="fb-modal-header">
          <span class="fb-modal-title">📄 {{ previewFile.n }}</span>
          <div class="fb-modal-actions">
            <a
              :href="getPreviewUrl(previewFile)"
              target="_blank"
              rel="noreferrer"
              class="fb-modal-open"
              >↗ 新窗口打开</a
            >
            <button class="fb-modal-close" @click="previewFile = null">×</button>
          </div>
        </div>
        <div class="fb-modal-body">
          <iframe :src="getPreviewUrl(previewFile)" class="fb-frame" :title="previewFile.n" />
        </div>
      </div>
    </div>

    <!-- 悬浮 Tooltip -->
    <div
      v-if="tip"
      class="file-tip file-tip-fixed"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
    >
      <div class="file-tip-row">
        <span class="file-tip-label">名称</span><span class="file-tip-value">{{ tip.file.n }}</span>
      </div>
      <div class="file-tip-row">
        <span class="file-tip-label">学科</span
        ><span class="file-tip-value">{{ tip.file.sn }}</span>
      </div>
      <div class="file-tip-row">
        <span class="file-tip-label">类型</span
        ><span class="file-tip-value">{{ tip.file.tn }}</span>
      </div>
      <div class="file-tip-row">
        <span class="file-tip-label">大小</span
        ><span class="file-tip-value">{{ tip.file.sz }}</span>
      </div>
      <div class="file-tip-row">
        <span class="file-tip-label">路径</span
        ><span class="file-tip-value file-tip-path">{{ tip.file.p }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fb-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.fb-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.fb-label {
  font-size: 0.78rem;
  color: var(--text3);
  font-weight: 600;
}
.fb-count {
  font-size: 0.8rem;
  color: var(--text3);
  margin-bottom: 10px;
}
.fb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}
.file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--card2, #1e2235);
  cursor: pointer;
}
.fb-card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.fb-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
}
.fb-info {
  min-width: 0;
}
.fb-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-meta {
  font-size: 0.72rem;
  color: var(--text3);
  margin-top: 2px;
}
.fb-tag {
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
}
.fb-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}
.fb-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fb-modal {
  background: var(--card, #1e293b);
  border-radius: 16px;
  padding: 20px;
  max-width: 90vw;
  width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.fb-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.fb-modal-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}
.fb-modal-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.fb-modal-open {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 0.78rem;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.fb-modal-close {
  background: none;
  border: none;
  color: var(--text3);
  cursor: pointer;
  font-size: 1.3rem;
  line-height: 1;
}
.fb-modal-body {
  flex: 1;
  overflow: auto;
  border-radius: 8px;
}
.fb-frame {
  width: 100%;
  height: 70vh;
  border: none;
  border-radius: 8px;
}
.file-tip-path {
  font-size: 0.72rem;
  color: var(--text3);
}
</style>
