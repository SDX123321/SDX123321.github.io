<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Download,
  FileArchive,
  FileAudio,
  FileText,
  Filter,
  LockKeyhole,
  Search,
  X,
} from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

const emit = defineEmits<{ (event: 'require-auth'): void }>()
const route = useRoute()
const auth = useAuth()
const items = ref<any[]>([])
const total = ref(0)
const cursor = ref<number | null>(null)
const loading = ref(false)
const error = ref('')
const query = ref(String(route.query.q || ''))
const grade = ref('all')
const subject = ref(String(route.query.subject || 'all'))
const year = ref('')
const region = ref('all')
const kind = ref('all')
let timer: number | undefined
const subjectOptions = [
  ['all', '全部学科'],
  ['chinese', '语文'],
  ['math', '数学'],
  ['english', '英语'],
  ['physics', '物理'],
  ['chemistry', '化学'],
  ['biology', '生物'],
  ['politics', '政治'],
  ['history', '历史'],
  ['geography', '地理'],
]
const kindNames: Record<string, string> = {
  paper: '试卷',
  answer: '答案解析',
  'answer-sheet': '答题卡',
  audio: '听力',
  image: '图片',
  archive: '压缩包',
  other: '其他',
}
const gradeNames: Record<string, string> = {
  'grade-1': '高一',
  'grade-2': '高二',
  'grade-3': '高三',
  other: '其他',
}
const formatSize = (value: number) =>
  value < 1024 ** 2
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / 1024 ** 2).toFixed(1)} MB`
const hasFilters = computed(
  () =>
    query.value ||
    grade.value !== 'all' ||
    subject.value !== 'all' ||
    year.value ||
    region.value !== 'all' ||
    kind.value !== 'all',
)

async function load(reset = true) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ limit: '24' })
  if (!reset && cursor.value !== null) params.set('cursor', String(cursor.value))
  if (query.value.trim()) params.set('q', query.value.trim())
  if (grade.value !== 'all') params.set('grade', grade.value)
  if (subject.value !== 'all') params.set('subject', subject.value)
  if (year.value) params.set('year', year.value)
  if (region.value !== 'all') params.set('region', region.value)
  if (kind.value !== 'all') params.set('kind', kind.value)
  try {
    const response = await fetch(`/api/high-school/materials?${params}`)
    if (!response.ok) throw new Error('资料目录加载失败')
    const body = await response.json()
    items.value = reset ? body.items : [...items.value, ...body.items]
    total.value = body.pageInfo.total
    cursor.value = body.pageInfo.nextCursor
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '加载失败'
  } finally {
    loading.value = false
  }
}
function schedule() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => load(true), 220)
}
function clearFilters() {
  query.value = ''
  grade.value = 'all'
  subject.value = 'all'
  year.value = ''
  region.value = 'all'
  kind.value = 'all'
  void load(true)
}
function download(item: any) {
  if (!auth.user) {
    emit('require-auth')
    return
  }
  window.location.assign(`/api/high-school/materials/${item.id}/download`)
}
function iconFor(item: any) {
  return item.kind === 'audio' ? FileAudio : item.kind === 'archive' ? FileArchive : FileText
}
watch([grade, subject, year, region, kind], () => load(true))
onMounted(() => load(true))
</script>

<template>
  <main id="main-content" class="hs-main hs-page-main">
    <section class="hs-container hs-page-heading">
      <div>
        <p class="hs-kicker">本机资料目录</p>
        <h1>从 {{ total.toLocaleString('zh-CN') }} 份资料里，找到此刻需要的那一份。</h1>
        <p>文件按内容去重，目录公开浏览；登录后可下载原文件。</p>
      </div>
    </section>
    <section class="hs-container hs-resource-layout">
      <aside class="hs-filter-panel">
        <div class="hs-filter-title">
          <Filter :size="18" /><strong>筛选资料</strong
          ><button v-if="hasFilters" type="button" @click="clearFilters">
            <X :size="15" />清空
          </button>
        </div>
        <label
          >年级<select v-model="grade">
            <option value="all">全部年级</option>
            <option value="grade-1">高一</option>
            <option value="grade-2">高二</option>
            <option value="grade-3">高三</option>
          </select></label
        >
        <label
          >学科<select v-model="subject">
            <option v-for="option in subjectOptions" :key="option[0]" :value="option[0]">
              {{ option[1] }}
            </option>
          </select></label
        >
        <label
          >年份<input v-model="year" type="number" min="1990" max="2030" placeholder="例如 2026"
        /></label>
        <label
          >地区<select v-model="region">
            <option value="all">全部地区</option>
            <option value="江苏">江苏</option>
            <option value="全国">全国</option>
            <option value="南京">南京</option>
            <option value="苏州">苏州</option>
            <option value="南通">南通</option>
            <option value="无锡">无锡</option>
          </select></label
        >
        <label
          >类型<select v-model="kind">
            <option value="all">全部类型</option>
            <option value="paper">试卷</option>
            <option value="answer">答案解析</option>
            <option value="answer-sheet">答题卡</option>
            <option value="audio">听力</option>
            <option value="archive">压缩包</option>
            <option value="other">其他</option>
          </select></label
        >
      </aside>
      <div class="hs-resource-results">
        <div class="hs-library-search">
          <Search :size="20" /><label class="sr-only" for="material-search">搜索资料</label
          ><input
            id="material-search"
            v-model="query"
            type="search"
            placeholder="搜索试卷、学校、地区或年份"
            @input="schedule"
          /><span>{{ total.toLocaleString('zh-CN') }} 项</span>
        </div>
        <div v-if="error" class="hs-empty">
          <FileText :size="28" />
          <h3>{{ error }}</h3>
          <button type="button" @click="load(true)">重新加载</button>
        </div>
        <div v-else-if="loading && !items.length" class="hs-material-list">
          <div v-for="n in 8" :key="n" class="hs-material-row hs-skeleton" />
        </div>
        <div v-else-if="items.length" class="hs-material-list">
          <article v-for="item in items" :key="item.id" class="hs-material-row">
            <span class="hs-file-icon"><component :is="iconFor(item)" :size="21" /></span>
            <div class="hs-material-copy">
              <div>
                <span>{{ gradeNames[item.grade] || item.grade }}</span
                ><span>{{ kindNames[item.kind] || item.kind }}</span
                ><span v-if="item.year">{{ item.year }}</span
                ><span :class="item.ragStatus === 'indexed' ? 'is-indexed' : ''">{{
                  item.ragStatus === 'indexed' ? '可语义检索' : '目录资料'
                }}</span>
              </div>
              <h2>{{ item.fileName }}</h2>
              <p>
                {{ item.region === 'other' ? '地区未标注' : item.region }} ·
                {{ formatSize(item.sizeBytes) }}
              </p>
            </div>
            <button type="button" :aria-label="`下载 ${item.fileName}`" @click="download(item)">
              <Download v-if="auth.user" :size="18" /><LockKeyhole v-else :size="18" /><span>{{
                auth.user ? '下载' : '登录下载'
              }}</span>
            </button>
          </article>
          <button
            v-if="cursor !== null"
            class="hs-load-more"
            type="button"
            :disabled="loading"
            @click="load(false)"
          >
            {{ loading ? '正在加载…' : '加载更多资料' }}
          </button>
        </div>
        <div v-else class="hs-empty">
          <Search :size="28" />
          <h3>没有找到匹配资料</h3>
          <p>尝试减少筛选条件或换一个关键词。</p>
        </div>
      </div>
    </section>
  </main>
</template>
