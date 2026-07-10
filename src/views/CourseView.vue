<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  BookX,
  Check,
  ChevronRight,
  Menu,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next'
import CourseIcon from '../components/CourseIcon.vue'
import AlgorithmTrainer from '../features/algorithm/AlgorithmTrainer.vue'
import { courseContentMap } from '../data/course-content'
import type { NavLink } from '../types/course'

const route = useRoute()
const router = useRouter()
const contentElement = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)
const searchOpen = ref(false)
const searchQuery = ref('')
const progress = ref(0)
const activeSection = ref('')
interface WrongAnswer {
  page: string
  question: string
  userAnswer: string
  correctAnswer: string
  time: number
}
const wrongAnswers = ref<WrongAnswer[]>(loadWrongAnswers())
const wrongBookOpen = ref(false)
const course = computed(() => courseContentMap.get(String(route.params.courseId)))
const cleanLabel = (label: string) => label.replace(/<[^>]+>/g, '').trim()

watch(
  course,
  async (next) => {
    if (!next) return
    document.title = `${next.name}｜期末复习笔记`
    localStorage.setItem('review_recent_course', next.id)
    await nextTick()
    enhanceContent()
  },
  { immediate: true },
)

function scrollToSection(link: NavLink) {
  const target = document.getElementById(link.id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${link.id}`)
  sidebarOpen.value = false
}

function updateProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  progress.value = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0
  const headings = contentElement.value?.querySelectorAll<HTMLElement>('[id]') ?? []
  let current = ''
  headings.forEach((heading) => {
    if (heading.getBoundingClientRect().top <= 130) current = heading.id
  })
  activeSection.value = current
}

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const fillButton = target.closest<HTMLElement>('[onclick*="checkFill"]')
  if (fillButton) {
    event.preventDefault()
    checkFill(fillButton)
    return
  }
  const answerButton = target.closest<HTMLElement>('[onclick*="toggleAnswer"]')
  if (answerButton) {
    event.preventDefault()
    toggleEssayAnswer(answerButton)
    return
  }
  const quizButton = target.closest<HTMLElement>('[onclick*="checkQuiz"]')
  if (quizButton) {
    event.preventDefault()
    checkQuiz(quizButton)
    return
  }
  const header = target.closest<HTMLElement>(
    '.section-header, h3.collapsible, h4.collapsible, .chapter-header, .card-header',
  )
  if (!header) return
  const container = header.closest<HTMLElement>('.section, .chapter, .card')
  if (container) container.classList.toggle('open')
  header.classList.toggle('open')
  header.nextElementSibling?.classList.toggle('show')
}

function checkFill(button: HTMLElement) {
  const container = button.closest<HTMLElement>('.quiz-container')
  const input = container?.querySelector<HTMLInputElement>('.fill-input')
  const result = container?.querySelector<HTMLElement>('.quiz-result')
  const answer = container?.querySelector<HTMLElement>('.fill-answer')
  if (!input || !result || !answer) return
  if (!input.value.trim()) {
    result.textContent = '请先填写答案'
    result.className = 'quiz-result quiz-wrong'
    return
  }
  answer.style.display = 'block'
  result.textContent = '已显示参考答案，请自行对照'
  result.className = 'quiz-result quiz-correct'
}

function toggleEssayAnswer(button: HTMLElement) {
  const answer = button
    .closest<HTMLElement>('.quiz-container')
    ?.querySelector<HTMLElement>('.essay-answer')
  if (!answer) return
  const willShow = answer.style.display === 'none' || getComputedStyle(answer).display === 'none'
  answer.style.display = willShow ? 'block' : 'none'
  button.textContent = willShow ? '隐藏参考答案' : '查看参考答案'
}

function checkQuiz(button: HTMLElement) {
  const container = button.closest<HTMLElement>('.quiz-container') ?? button.parentElement
  if (!container) return
  const result = container.querySelector<HTMLElement>('.quiz-result')
  const selected = container.querySelector<HTMLInputElement>('input:checked')
  if (!result) return
  if (!selected) {
    result.textContent = '请先选择一个答案'
    result.className = 'quiz-result quiz-wrong'
    result.style.display = 'block'
    return
  }
  const correct = Number(container.dataset.correct)
  const chosen = Number(selected.value)
  const labels = container.querySelectorAll('label')
  const isCorrect = chosen === correct
  result.textContent = isCorrect
    ? '回答正确'
    : `再想一想，正确答案是 ${labels[correct]?.textContent?.trim() ?? ''}`
  result.className = `quiz-result ${isCorrect ? 'quiz-correct' : 'quiz-wrong'}`
  result.style.display = 'block'
  if (!isCorrect) {
    const question =
      container.querySelector<HTMLElement>('.quiz-q')?.textContent?.trim() ?? '课程自测题'
    const entry: WrongAnswer = {
      page: course.value?.name ?? document.title,
      question,
      userAnswer: labels[chosen]?.textContent?.trim() ?? '',
      correctAnswer: labels[correct]?.textContent?.trim() ?? '',
      time: Date.now(),
    }
    wrongAnswers.value = [...wrongAnswers.value, entry]
    localStorage.setItem('wrong_answers', JSON.stringify(wrongAnswers.value))
  }
}

function loadWrongAnswers(): WrongAnswer[] {
  try {
    const value = JSON.parse(localStorage.getItem('wrong_answers') || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
function clearWrongAnswers() {
  wrongAnswers.value = []
  localStorage.setItem('wrong_answers', '[]')
}

function enhanceContent() {
  if (!contentElement.value) return
  contentElement.value.removeEventListener('click', handleContentClick)
  contentElement.value.addEventListener('click', handleContentClick)
  loadCourseInteractions()
  renderMath()
  if (route.hash) document.querySelector(route.hash)?.scrollIntoView({ block: 'start' })
}

function loadCourseInteractions() {
  document.getElementById('course-interactions')?.remove()
  if (!course.value?.interactionScript) return
  for (const id of ['subGuide', 'progressFill', 'sidebarOverlay']) {
    if (!document.getElementById(id)) {
      const helper = document.createElement('div')
      helper.id = id
      helper.hidden = true
      document.body.appendChild(helper)
    }
  }
  const script = document.createElement('script')
  script.id = 'course-interactions'
  script.textContent = `${course.value.interactionScript}\n;try { if (typeof renderDiagrams === 'function') renderDiagrams() } catch (_) {}`
  document.body.appendChild(script)
}

async function renderMath() {
  if (!course.value?.renderer || !contentElement.value) return
  if (course.value.renderer === 'katex') {
    await loadStylesheet('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css')
    await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js')
    await loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js')
    window.renderMathInElement?.(contentElement.value, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    })
  } else {
    window.MathJax ??= {
      tex: {
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
      },
    }
    await loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js')
    await window.MathJax?.typesetPromise?.([contentElement.value])
  }
}

function loadScript(src: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
  if (existing) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`无法加载 ${src}`))
    document.head.appendChild(script)
  })
}

function loadStylesheet(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    document.head.appendChild(link)
  })
}

function findInPage() {
  const keyword = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  if (!keyword || !contentElement.value) return
  const candidates = contentElement.value.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p, li, td')
  const match = [...candidates].find((element) =>
    element.textContent?.toLocaleLowerCase('zh-CN').includes(keyword),
  )
  match?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  match?.classList.add('search-pulse')
  window.setTimeout(() => match?.classList.remove('search-pulse'), 1600)
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', updateProgress, { passive: true })
  window.addEventListener('keydown', handleKeydown)
  updateProgress()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateProgress)
  window.removeEventListener('keydown', handleKeydown)
  contentElement.value?.removeEventListener('click', handleContentClick)
  document.getElementById('course-interactions')?.remove()
  for (const id of ['subGuide', 'progressFill', 'sidebarOverlay'])
    document.getElementById(id)?.remove()
})

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchOpen.value = true
  }
  if (event.key === 'Escape') {
    searchOpen.value = false
    sidebarOpen.value = false
  }
}
</script>

<template>
  <div
    v-if="course"
    class="course-shell"
    :style="{ '--course-accent': course.accent, '--course-soft': course.softAccent }"
  >
    <div class="reading-progress" :style="{ transform: `scaleX(${progress / 100})` }" />
    <button
      class="mobile-menu"
      type="button"
      :aria-expanded="sidebarOpen"
      aria-controls="course-sidebar"
      @click="sidebarOpen = !sidebarOpen"
    >
      <X v-if="sidebarOpen" :size="20" /><Menu v-else :size="20" /><span>目录</span>
    </button>

    <aside id="course-sidebar" class="course-sidebar" :class="{ open: sidebarOpen }">
      <RouterLink class="course-back" to="/"><ArrowLeft :size="17" />全部课程</RouterLink>
      <div class="course-identity">
        <span><CourseIcon :name="course.icon" :size="24" /></span>
        <div>
          <small>{{ course.shortName }}</small
          ><strong>{{ course.name }}</strong>
        </div>
      </div>
      <div class="sidebar-tools">
        <button type="button" @click="searchOpen = true">
          <Search :size="17" />页内搜索<kbd>Ctrl F</kbd>
        </button>
      </div>
      <nav class="chapter-nav" aria-label="章节目录">
        <p>课程目录</p>
        <button
          v-for="link in course.nav"
          :key="link.id"
          type="button"
          :class="{ active: activeSection === link.id }"
          @click="scrollToSection(link)"
        >
          <span>{{ cleanLabel(link.label) }}</span
          ><ChevronRight :size="15" />
        </button>
      </nav>
      <div class="sidebar-foot">
        <BookOpen :size="16" /><span>阅读进度</span><strong>{{ Math.round(progress) }}%</strong>
      </div>
    </aside>
    <button
      v-if="sidebarOpen"
      class="sidebar-scrim"
      type="button"
      aria-label="关闭目录"
      @click="sidebarOpen = false"
    />

    <main id="main-content" class="course-main">
      <template v-if="course.html">
        <div ref="contentElement" class="course-content" v-html="course.html" />
        <AlgorithmTrainer v-if="course.id === 'algorithm'" />
      </template>
      <section v-else class="special-course">
        <span class="special-icon"><CourseIcon :name="course.icon" :size="34" /></span>
        <p class="eyebrow">专项学习空间</p>
        <h1>{{ course.name }}</h1>
        <p>{{ course.description }}</p>
        <div class="migration-note">
          <Check :size="19" /><span>题库数据已保留，专项交互界面正在迁移到 Vue 3。</span>
        </div>
        <button class="secondary-button" type="button" @click="router.push('/')">
          <ArrowLeft :size="17" />返回课程库
        </button>
      </section>
    </main>

    <button
      v-show="progress > 12"
      id="backTop"
      class="back-to-top"
      type="button"
      aria-label="返回顶部"
      @click="scrollToTop"
    >
      <ArrowUp :size="19" />
    </button>
    <button
      class="wrong-book-button"
      type="button"
      :aria-expanded="wrongBookOpen"
      aria-controls="wrong-book-panel"
      @click="wrongBookOpen = !wrongBookOpen"
    >
      <BookX :size="19" /><span v-if="wrongAnswers.length">{{ wrongAnswers.length }}</span>
    </button>
    <aside v-if="wrongBookOpen" id="wrong-book-panel" class="wrong-book-panel" aria-label="错题本">
      <div class="wrong-book-heading">
        <div>
          <small>复习工具</small>
          <h2>错题本</h2>
        </div>
        <button type="button" aria-label="关闭错题本" @click="wrongBookOpen = false">
          <X :size="18" />
        </button>
      </div>
      <div v-if="wrongAnswers.length" class="wrong-book-list">
        <article
          v-for="(item, index) in [...wrongAnswers].reverse()"
          :key="`${item.time}-${index}`"
        >
          <small>{{ item.page }}</small
          ><strong>{{ item.question }}</strong>
          <p><span>你的答案</span>{{ item.userAnswer || '未记录' }}</p>
          <p class="correct-answer"><span>正确答案</span>{{ item.correctAnswer }}</p>
        </article>
      </div>
      <div v-else class="wrong-book-empty">
        <BookX :size="28" />
        <p>还没有错题记录</p>
        <span>课程自测中的错误答案会自动收录在这里。</span>
      </div>
      <button
        v-if="wrongAnswers.length"
        class="clear-wrong-book"
        type="button"
        @click="clearWrongAnswers"
      >
        <Trash2 :size="16" />清空错题本
      </button>
    </aside>
    <div v-if="searchOpen" class="search-dialog-backdrop" @click.self="searchOpen = false">
      <form class="search-dialog" role="search" @submit.prevent="findInPage">
        <Search :size="20" /><label class="sr-only" for="page-search">在当前课程内搜索</label>
        <input
          id="page-search"
          v-model="searchQuery"
          autofocus
          type="search"
          placeholder="搜索当前课程…"
        />
        <button type="button" aria-label="关闭搜索" @click="searchOpen = false">
          <X :size="19" />
        </button>
      </form>
    </div>
  </div>
  <main v-else id="main-content" class="empty-state">
    <BookOpen :size="34" />
    <p class="eyebrow">课程未找到</p>
    <h1>这门课还没有迁移</h1>
    <RouterLink class="primary-button" to="/"><ArrowLeft :size="18" />返回课程库</RouterLink>
  </main>
</template>
