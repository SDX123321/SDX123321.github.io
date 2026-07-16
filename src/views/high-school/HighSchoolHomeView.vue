<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Search,
  Sparkles,
  Target,
} from 'lucide-vue-next'

interface Overview {
  materials: number
  indexed: number
  chunks: number
  sizeBytes: number
  vectorEnabled: boolean
  subjects: Array<{ key: string; count: number }>
  lastRun: null | { status: string; discovered: number; failed: number; remaining: number }
}
const overview = ref<Overview | null>(null)
const loading = ref(true)
const error = ref('')
const subjectNames: Record<string, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  politics: '政治',
  history: '历史',
  geography: '地理',
  other: '综合',
}
const visibleSubjects = computed(() =>
  (overview.value?.subjects || []).filter((item) => item.key !== 'other').slice(0, 9),
)
const formatNumber = (value = 0) => new Intl.NumberFormat('zh-CN').format(value)
const formatSize = (value = 0) => (value ? `${(value / 1024 ** 3).toFixed(1)} GB` : '0 GB')

onMounted(async () => {
  try {
    const response = await fetch('/api/high-school/overview')
    if (!response.ok) throw new Error('资料服务暂时不可用')
    overview.value = await response.json()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main id="main-content" class="hs-main">
    <section class="hs-hero hs-container">
      <div class="hs-hero-copy">
        <p class="hs-kicker"><Sparkles :size="15" />从资料出发，形成自己的复习节奏</p>
        <h1>把每一次练习，<br /><span>变成有依据的进步。</span></h1>
        <p>
          覆盖高一到高三的试卷、答案与历年高考资料。按学科找资料、向 AI
          追问出处，再回到真题检验掌握程度。
        </p>
        <div class="hs-hero-actions">
          <RouterLink class="hs-primary-button" to="/high-school/resources"
            ><Search :size="18" />查找资料</RouterLink
          >
          <RouterLink class="hs-secondary-button" to="/high-school/assistant"
            ><Bot :size="18" />基于资料提问</RouterLink
          >
        </div>
      </div>
      <aside class="hs-focus-card" aria-label="资料库状态">
        <div class="hs-focus-heading">
          <span><Database :size="20" /></span>
          <div>
            <small>本地资料库</small
            ><strong>{{
              overview?.lastRun?.status === 'running' ? '正在更新索引' : '准备就绪'
            }}</strong>
          </div>
        </div>
        <div class="hs-focus-metric">
          <strong>{{ formatNumber(overview?.materials) }}</strong
          ><span>份去重资料</span>
        </div>
        <div class="hs-focus-progress">
          <span
            :style="{
              width: `${overview?.materials ? Math.round((overview.indexed / overview.materials) * 100) : 0}%`,
            }"
          />
        </div>
        <div class="hs-focus-foot">
          <span>{{ formatNumber(overview?.indexed) }} 份已进入 RAG</span
          ><span>{{ formatSize(overview?.sizeBytes) }}</span>
        </div>
      </aside>
    </section>

    <section class="hs-container hs-stat-grid" aria-label="资料概览">
      <article>
        <FileText :size="20" />
        <div>
          <strong>{{ loading ? '—' : formatNumber(overview?.materials) }}</strong
          ><span>资料目录</span>
        </div>
      </article>
      <article>
        <CheckCircle2 :size="20" />
        <div>
          <strong>{{ loading ? '—' : formatNumber(overview?.indexed) }}</strong
          ><span>可检索资料</span>
        </div>
      </article>
      <article>
        <BookOpen :size="20" />
        <div>
          <strong>{{ loading ? '—' : formatNumber(overview?.chunks) }}</strong
          ><span>知识片段</span>
        </div>
      </article>
      <article>
        <Target :size="20" />
        <div>
          <strong>{{ overview?.vectorEnabled ? '语义 + 关键词' : '关键词模式' }}</strong
          ><span>当前检索能力</span>
        </div>
      </article>
    </section>

    <section class="hs-section hs-container">
      <div class="hs-section-heading">
        <div>
          <p class="hs-kicker">按学科进入</p>
          <h2>今天准备攻克哪一科？</h2>
        </div>
        <RouterLink to="/high-school/resources">全部资料<ArrowRight :size="17" /></RouterLink>
      </div>
      <div v-if="loading" class="hs-subject-grid" aria-label="正在加载">
        <div v-for="n in 9" :key="n" class="hs-skeleton hs-subject-card" />
      </div>
      <div v-else-if="error" class="hs-empty">
        <Database :size="28" />
        <h3>{{ error }}</h3>
        <p>请确认 Rust API 和 PostgreSQL 已启动。</p>
      </div>
      <div v-else class="hs-subject-grid">
        <RouterLink
          v-for="item in visibleSubjects"
          :key="item.key"
          class="hs-subject-card"
          :to="{ path: '/high-school/resources', query: { subject: item.key } }"
        >
          <span>{{ subjectNames[item.key]?.slice(0, 1) || '学' }}</span>
          <div>
            <strong>{{ subjectNames[item.key] || item.key }}</strong
            ><small>{{ formatNumber(item.count) }} 份资料</small>
          </div>
          <ArrowRight :size="17" />
        </RouterLink>
      </div>
    </section>

    <section class="hs-section hs-container hs-path-section">
      <div class="hs-section-heading">
        <div>
          <p class="hs-kicker">三步学习路径</p>
          <h2>先找依据，再做判断</h2>
        </div>
      </div>
      <div class="hs-path-grid">
        <article>
          <span>01</span><Search :size="22" />
          <h3>筛选资料</h3>
          <p>按年级、学科、地区与年份缩小范围。</p>
        </article>
        <article>
          <span>02</span><Bot :size="22" />
          <h3>带出处问答</h3>
          <p>AI 只根据召回片段作答，并展示原始来源。</p>
        </article>
        <article>
          <span>03</span><Target :size="22" />
          <h3>回到真题</h3>
          <p>用练习与错题反馈确认是否真正掌握。</p>
        </article>
      </div>
    </section>
  </main>
</template>
