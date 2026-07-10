<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronDown,
  Filter,
  Image as ImageIcon,
  Search,
  Sparkles,
} from 'lucide-vue-next'
import gaokaoIndexRaw from '../data/jiangsu-gaokao-index.json'
import legacyRaw from '../data/jiangsu-gaokao-extracted.json'
import docx2026Raw from '../data/gaokao-2026-docx-extracted.json'
import assetRaw from '../data/gaokao-question-assets.json'

interface Subject {
  key: string
  name: string
}
interface Question {
  id?: string
  number: number | string
  prompt: string
  answer?: string
  solution?: string[]
  quality?: string
  flags?: string[]
}
interface Paper {
  year: number
  subject: string
  subjectName: string
  source: string
  questions: Question[]
  role?: string
}
interface QuestionImage {
  url: string
  caption?: string
  needsReview?: boolean
}
interface AssetQuestion {
  source: string
  number: number | string
  images: QuestionImage[]
}
interface QuestionRow extends Question {
  key: string
  year: number
  subject: string
  subjectName: string
  source: string
  images: QuestionImage[]
}

const gaokaoIndex = gaokaoIndexRaw as unknown as {
  years: number[]
  subjects: Subject[]
  totals: { files: number; coveredCells: number }
}
const papers = [
  ...(legacyRaw as unknown as { files: Paper[] }).files,
  ...(docx2026Raw as unknown as { files: Paper[] }).files,
]
const assets = (assetRaw as unknown as { questions: AssetQuestion[] }).questions
const assetMap = new Map(assets.map((item) => [`${item.source}::${item.number}`, item.images]))
const route = useRoute()
const router = useRouter()
const selectedSubject = ref(String(route.params.subject || 'math'))
const selectedYear = ref<number | 'all'>('all')
const keyword = ref('')
const answerOpen = ref(new Set<string>())
const solved = ref(loadSolved())
const visibleCount = ref(18)

const subjects = computed(() => gaokaoIndex.subjects)
const years = computed(() => [...new Set(papers.map((paper) => paper.year))].sort((a, b) => b - a))
const currentSubject = computed(
  () =>
    subjects.value.find((subject) => subject.key === selectedSubject.value) ?? subjects.value[0],
)

const allQuestions = computed<QuestionRow[]>(() =>
  papers.flatMap((paper) =>
    paper.questions.map((question, index) => ({
      ...question,
      key:
        question.id || `${paper.year}-${paper.subject}-${paper.source}-${question.number}-${index}`,
      year: paper.year,
      subject: paper.subject,
      subjectName: paper.subjectName,
      source: paper.source,
      images: assetMap.get(`${paper.source}::${question.number}`) ?? [],
    })),
  ),
)

const filteredQuestions = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
  return allQuestions.value.filter(
    (question) =>
      question.subject === selectedSubject.value &&
      (selectedYear.value === 'all' || question.year === selectedYear.value) &&
      (!query ||
        `${question.prompt} ${question.answer ?? ''} ${question.source}`
          .toLocaleLowerCase('zh-CN')
          .includes(query)),
  )
})
const shownQuestions = computed(() => filteredQuestions.value.slice(0, visibleCount.value))
const solvedInFilter = computed(
  () => filteredQuestions.value.filter((question) => solved.value.has(question.key)).length,
)

watch(
  selectedSubject,
  (subject) => {
    selectedYear.value = 'all'
    visibleCount.value = 18
    keyword.value = ''
    router.replace({ name: 'gaokao', params: { subject } })
    const name = subjects.value.find((item) => item.key === subject)?.name ?? '高考'
    document.title = `${name}真题｜江苏高考真题基因库`
  },
  { immediate: true },
)
watch([selectedYear, keyword], () => {
  visibleCount.value = 18
})

function toggleAnswer(key: string) {
  const next = new Set(answerOpen.value)
  next.has(key) ? next.delete(key) : next.add(key)
  answerOpen.value = next
}

function toggleSolved(key: string) {
  const next = new Set(solved.value)
  next.has(key) ? next.delete(key) : next.add(key)
  solved.value = next
  localStorage.setItem('gaokao_solved_questions', JSON.stringify([...next]))
}

function loadSolved() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('gaokao_solved_questions') || '[]'))
  } catch {
    return new Set<string>()
  }
}

function solutionText(question: Question) {
  if (question.answer?.trim()) return question.answer
  if (question.solution?.length) return question.solution.join('\n')
  return '这道题的标准解析仍在校对中，建议先独立完成并记录思路。'
}
</script>

<template>
  <div class="gaokao-shell">
    <header class="gaokao-topbar">
      <RouterLink to="/"><ArrowLeft :size="18" /><span>课程库</span></RouterLink>
      <div>
        <span class="gaokao-logo"><Sparkles :size="19" /></span><strong>江苏高考真题基因库</strong>
      </div>
      <span class="gaokao-data-badge">{{ gaokaoIndex.totals.files }} 份资料</span>
    </header>

    <main id="main-content" class="gaokao-main">
      <section class="gaokao-hero">
        <div>
          <p class="eyebrow">十年真题 · 按学科探索</p>
          <h1>从一道真题，<br />看见背后的<span>命题结构。</span></h1>
          <p>筛选年份和学科，先独立思考，再展开答案。你的完成状态会自动保存在本机。</p>
        </div>
        <div class="gaokao-overview">
          <div>
            <strong>{{ filteredQuestions.length }}</strong
            ><span>当前题目</span>
          </div>
          <div>
            <strong>{{ solvedInFilter }}</strong
            ><span>已经完成</span>
          </div>
          <div>
            <strong>{{ years.length }}</strong
            ><span>覆盖年份</span>
          </div>
        </div>
      </section>

      <section class="subject-tabs" aria-label="选择学科">
        <button
          v-for="subject in subjects"
          :key="subject.key"
          type="button"
          :class="{ active: selectedSubject === subject.key }"
          @click="selectedSubject = subject.key"
        >
          {{ subject.name }}
        </button>
      </section>

      <section class="question-workspace">
        <aside class="question-filter">
          <div class="filter-title"><Filter :size="17" /><strong>筛选题目</strong></div>
          <label for="year-filter">年份</label>
          <div class="select-wrap">
            <select id="year-filter" v-model="selectedYear">
              <option value="all">全部年份</option>
              <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option></select
            ><ChevronDown :size="16" />
          </div>
          <label for="question-search">关键词</label>
          <div class="filter-search">
            <Search :size="16" /><input
              id="question-search"
              v-model="keyword"
              type="search"
              placeholder="题干、答案或试卷…"
            />
          </div>
          <div class="filter-progress">
            <div>
              <span>完成进度</span
              ><strong
                >{{
                  filteredQuestions.length
                    ? Math.round((solvedInFilter / filteredQuestions.length) * 100)
                    : 0
                }}%</strong
              >
            </div>
            <div class="progress-track">
              <span
                :style="{
                  width: `${filteredQuestions.length ? (solvedInFilter / filteredQuestions.length) * 100 : 0}%`,
                }"
              />
            </div>
          </div>
        </aside>

        <div class="question-list">
          <div class="question-list-heading">
            <div>
              <p>
                {{ currentSubject?.name }} ·
                {{ selectedYear === 'all' ? '全部年份' : `${selectedYear} 年` }}
              </p>
              <h2>{{ filteredQuestions.length }} 道可练习真题</h2>
            </div>
            <BookOpenCheck :size="24" />
          </div>

          <article
            v-for="question in shownQuestions"
            :key="question.key"
            class="question-card"
            :class="{ solved: solved.has(question.key) }"
          >
            <div class="question-meta">
              <span>{{ question.year }}</span
              ><span>第 {{ question.number }} 题</span
              ><span>{{ question.source.replace(/\.(docx?|pdf)$/i, '') }}</span>
            </div>
            <p class="question-prompt">{{ question.prompt }}</p>
            <div v-if="question.images.length" class="question-images">
              <figure v-for="image in question.images" :key="image.url">
                <img
                  :src="image.url"
                  :alt="image.caption || `第 ${question.number} 题配图`"
                  loading="lazy"
                />
                <figcaption><ImageIcon :size="14" />{{ image.caption || '题目配图' }}</figcaption>
              </figure>
            </div>
            <div class="question-actions">
              <button
                type="button"
                class="answer-button"
                :aria-expanded="answerOpen.has(question.key)"
                @click="toggleAnswer(question.key)"
              >
                {{ answerOpen.has(question.key) ? '收起答案' : '查看答案'
                }}<ChevronDown :size="16" />
              </button>
              <button
                type="button"
                class="solved-button"
                :class="{ active: solved.has(question.key) }"
                @click="toggleSolved(question.key)"
              >
                <Check :size="16" />{{ solved.has(question.key) ? '已完成' : '标记完成' }}
              </button>
            </div>
            <div v-if="answerOpen.has(question.key)" class="answer-panel">
              <span>参考答案</span>
              <p>{{ solutionText(question) }}</p>
            </div>
          </article>

          <div v-if="!shownQuestions.length" class="question-empty">
            <Search :size="28" />
            <h3>没有符合条件的题目</h3>
            <p>换一个年份或清除关键词再试试。</p>
          </div>
          <button
            v-if="visibleCount < filteredQuestions.length"
            class="load-more"
            type="button"
            @click="visibleCount += 18"
          >
            继续加载（还剩 {{ filteredQuestions.length - visibleCount }} 题）
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
