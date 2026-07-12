<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpenCheck, Check, ChevronDown, CircleAlert, Search, Target } from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const subjects = ref<any[]>([])
const questions = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const total = ref(0)
const nextCursor = ref<string | null>(null)
const subject = ref(String(route.params.subject || 'math'))
const year = ref('')
const difficulty = ref('all')
const openAnswers = ref(new Set<string>())
const solved = ref(new Set<string>(JSON.parse(localStorage.getItem('hs_solved_questions') || '[]')))
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
}
const progress = computed(() =>
  questions.value.length
    ? Math.round(
        (questions.value.filter((q) => solved.value.has(q.questionKey)).length /
          questions.value.length) *
          100,
      )
    : 0,
)

async function load(reset = true) {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ subject: subject.value, limit: '30' })
  if (year.value) params.set('year', year.value)
  if (difficulty.value !== 'all') params.set('difficulty', difficulty.value)
  if (!reset && nextCursor.value) params.set('cursor', nextCursor.value)
  try {
    const response = await fetch(`/api/gaokao/questions?${params}`, { credentials: 'include' })
    if (!response.ok) throw new Error('题库加载失败')
    const body = await response.json()
    questions.value = reset ? body.questions : [...questions.value, ...body.questions]
    total.value = body.pageInfo.totalCount
    nextCursor.value = body.pageInfo.nextCursor
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '加载失败'
  } finally {
    loading.value = false
  }
}
function switchSubject(key: string) {
  subject.value = key
  router.replace(`/high-school/practice/${key}`)
}
function toggleAnswer(key: string) {
  const next = new Set(openAnswers.value)
  next.has(key) ? next.delete(key) : next.add(key)
  openAnswers.value = next
}
async function mark(question: any, result: 'correct' | 'wrong') {
  const next = new Set(solved.value)
  next.add(question.questionKey)
  solved.value = next
  localStorage.setItem('hs_solved_questions', JSON.stringify([...next]))
  if (auth.user)
    await fetch('/api/gaokao/attempts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        questionKey: question.questionKey,
        subjectKey: question.subjectKey,
        result,
        promptSnapshot: question.prompt,
        answerSnapshot: question.answer,
        sourceType: question.sourceType,
      }),
    }).catch(() => undefined)
}
function solution(question: any) {
  if (question.answer) return question.answer
  if (Array.isArray(question.solution) && question.solution.length)
    return question.solution.join('\n')
  return '这道题的解析仍在校对中，请先记录自己的思路。'
}
watch([year, difficulty], () => load(true))
onMounted(async () => {
  try {
    const response = await fetch('/api/gaokao/subjects')
    subjects.value = (await response.json()).subjects || []
  } catch {
    subjects.value = Object.entries(subjectNames).map(([subjectKey, subjectName]) => ({
      subjectKey,
      subjectName,
    }))
  }
  await load(true)
})
</script>

<template>
  <main id="main-content" class="hs-main hs-page-main">
    <section class="hs-container hs-page-heading hs-practice-heading">
      <div>
        <p class="hs-kicker"><Target :size="15" />真题反馈比“看懂了”更可靠</p>
        <h1>按学科练习，把薄弱点留在系统里。</h1>
        <p>题目通过 API 分页加载；登录后，正确与错误记录会同步到个人学习统计。</p>
      </div>
      <div class="hs-practice-progress">
        <strong>{{ progress }}%</strong><span>当前页完成度</span>
        <div><i :style="{ width: `${progress}%` }" /></div>
      </div>
    </section>
    <section class="hs-container hs-practice-subjects" aria-label="选择学科">
      <button
        v-for="item in subjects"
        :key="item.subjectKey"
        type="button"
        :class="{ active: subject === item.subjectKey }"
        @click="switchSubject(item.subjectKey)"
      >
        {{ item.subjectName || subjectNames[item.subjectKey] }}
      </button>
    </section>
    <section class="hs-container hs-practice-layout">
      <aside class="hs-filter-panel">
        <div class="hs-filter-title"><Search :size="18" /><strong>练习范围</strong></div>
        <label
          >年份<input
            v-model="year"
            type="number"
            min="1990"
            max="2030"
            placeholder="全部年份" /></label
        ><label
          >难度<select v-model="difficulty">
            <option value="all">全部难度</option>
            <option value="easy">基础</option>
            <option value="medium">中等</option>
            <option value="hard">综合</option>
          </select></label
        >
        <div class="hs-filter-summary">
          <strong>{{ total }}</strong
          ><span>道符合条件的题目</span>
        </div>
      </aside>
      <div class="hs-question-feed">
        <div v-if="loading && !questions.length" class="hs-question-card hs-skeleton" />
        <div v-else-if="error" class="hs-empty">
          <CircleAlert :size="28" />
          <h3>{{ error }}</h3>
          <button type="button" @click="load(true)">重新加载</button>
        </div>
        <article
          v-for="question in questions"
          :key="question.questionKey"
          class="hs-question-card"
          :class="{ solved: solved.has(question.questionKey) }"
        >
          <div class="hs-question-meta">
            <span>{{ question.year || '年份未标注' }}</span
            ><span>{{ question.questionTypeLabel }}</span
            ><span>{{ question.difficulty || '难度未标注' }}</span>
          </div>
          <p>{{ question.stem || question.prompt }}</p>
          <figure v-if="question.images?.length" class="hs-question-images">
            <a
              v-for="(image, imageIndex) in question.images"
              :key="image.hash || image.url"
              :href="image.url"
              target="_blank"
              rel="noopener noreferrer"
              ><img
                :src="image.url"
                :alt="image.caption || `题目配图 ${imageIndex + 1}`"
                loading="lazy"
                decoding="async"
            /></a>
            <figcaption>题目配图，可点击图片在新标签页查看原图</figcaption>
          </figure>
          <div class="hs-question-actions">
            <button
              type="button"
              :aria-expanded="openAnswers.has(question.questionKey)"
              @click="toggleAnswer(question.questionKey)"
            >
              <BookOpenCheck :size="17" />{{
                openAnswers.has(question.questionKey) ? '收起解析' : '查看解析'
              }}<ChevronDown :size="16" /></button
            ><button type="button" @click="mark(question, 'wrong')">还需巩固</button
            ><button type="button" class="is-correct" @click="mark(question, 'correct')">
              <Check :size="16" />已经掌握
            </button>
          </div>
          <div v-if="openAnswers.has(question.questionKey)" class="hs-solution">
            <strong>参考答案与解析</strong>
            <p>{{ solution(question) }}</p>
          </div>
        </article>
        <button
          v-if="nextCursor"
          class="hs-load-more"
          type="button"
          :disabled="loading"
          @click="load(false)"
        >
          {{ loading ? '正在加载…' : '继续加载题目' }}
        </button>
      </div>
    </section>
  </main>
</template>
