<script setup lang="ts">
/**
 * CourseContent — 替代 React 的 features/content/CourseContent.jsx
 * 渲染课程 HTML 正文，并处理数学公式、测验委托、折叠区域和滚动监听。
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  html: string
  courseKey: string
  onQuizAnswer?: (info: { correct: number; chosen: number; container: HTMLElement }) => void
}>()

const containerRef = ref<HTMLDivElement | null>(null)

// ── 数学公式渲染 ──
function renderMath() {
  const el = containerRef.value
  if (!el) return
  const w = window as unknown as Record<string, unknown>
  if (['probability', 'algorithm', 'calculus'].includes(props.courseKey)) {
    if (typeof w['renderMathInElement'] === 'function') {
      try {
        ;(w['renderMathInElement'] as (el: Element, opts: unknown) => void)(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        })
      } catch (e) {
        console.warn('KaTeX error:', e)
      }
    }
  }
  if (['dsp', 'signals'].includes(props.courseKey)) {
    const mj = w['MathJax'] as { typesetPromise?: (els: Element[]) => Promise<void> } | undefined
    if (mj?.typesetPromise) {
      mj.typesetPromise([el]).catch(() => {})
    }
  }
}

// ── 测验委托 (checkQuiz) ──
function setupQuiz() {
  const w = window as unknown as Record<string, unknown>
  w['checkQuiz'] = function (btn: HTMLElement) {
    if (!btn) return
    const c = btn.closest('.quiz-container') as HTMLElement | null
    const container = c || (btn.parentElement as HTMLElement)
    if (!container || container.dataset['correct'] === undefined) return
    const correct = parseInt(container.dataset['correct'] as string)
    const sel = container.querySelector<HTMLInputElement>('input:checked')
    const res = container.querySelector<HTMLElement>('.quiz-result')
    if (!sel) {
      if (res) {
        res.textContent = '请先选择答案'
        res.className = 'quiz-result quiz-wrong'
        res.style.display = 'block'
      }
      return
    }
    const chosen = parseInt(sel.value)
    if (chosen === correct) {
      if (res) {
        res.textContent = '✓ 正确！'
        res.className = 'quiz-result quiz-correct'
        res.style.display = 'block'
      }
    } else {
      const labels = container.querySelectorAll('.quiz-options label, label')
      if (res) {
        res.textContent = '✗ 错误，正确答案是 ' + (labels[correct]?.textContent?.trim() || '')
        res.className = 'quiz-result quiz-wrong'
        res.style.display = 'block'
      }
    }
    props.onQuizAnswer?.({ correct, chosen, container })
  }
  return () => {
    delete (window as unknown as Record<string, unknown>)['checkQuiz']
  }
}

// ── 折叠区域 ──
function setupCollapsibles() {
  const el = containerRef.value
  if (!el) return
  function handleClick(e: Event) {
    const header = (e.target as HTMLElement).closest(
      '.section-header, h3.collapsible, h4.collapsible, .chapter-header, .card-header',
    ) as HTMLElement | null
    if (!header) return
    e.preventDefault()
    const section = header.closest('.section')
    if (section) {
      section.classList.toggle('collapsed')
      return
    }
    if (header.classList.contains('chapter-header')) {
      header.closest('.chapter')?.classList.toggle('open')
      return
    }
    if (header.classList.contains('card-header')) {
      header.closest('.card')?.classList.toggle('open')
      return
    }
    header.classList.toggle('open')
    const content = header.nextElementSibling
    if (content?.classList.contains('collapsible-content')) content.classList.toggle('show')
  }
  el.addEventListener('click', handleClick)
  return () => el.removeEventListener('click', handleClick)
}

// ── 侧边栏滚动监听 ──
let scrollRAF = 0
function updateNavHighlight() {
  cancelAnimationFrame(scrollRAF)
  scrollRAF = requestAnimationFrame(() => {
    const el = containerRef.value
    if (!el) return
    const ids = el.querySelectorAll('[id]')
    let currentId = ''
    ids.forEach((node) => {
      if (node.getBoundingClientRect().top <= 110) currentId = node.id
    })
    document.querySelectorAll('.sidebar a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + currentId)
    })
  })
}

// ── 返回顶部按钮 ──
function handleBackTopScroll() {
  const btn = document.getElementById('backTop') as HTMLElement | null
  if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none'
}

let cleanupQuiz: (() => void) | undefined
let cleanupCollapsibles: (() => void) | undefined

watch(
  () => props.html,
  () => {
    cleanupCollapsibles?.()
    cleanupQuiz?.()
    renderMath()
    cleanupQuiz = setupQuiz()
    // 等 DOM 更新后再绑定折叠
    setTimeout(() => {
      cleanupCollapsibles = setupCollapsibles()
    }, 0)
  },
)

onMounted(() => {
  renderMath()
  cleanupQuiz = setupQuiz()
  cleanupCollapsibles = setupCollapsibles()
  window.addEventListener('scroll', updateNavHighlight, { passive: true })
  window.addEventListener('scroll', handleBackTopScroll, { passive: true })
  updateNavHighlight()
  handleBackTopScroll()
})

onUnmounted(() => {
  cleanupQuiz?.()
  cleanupCollapsibles?.()
  window.removeEventListener('scroll', updateNavHighlight)
  window.removeEventListener('scroll', handleBackTopScroll)
})
</script>

<template>
  <div ref="containerRef" class="course-content" v-html="html" />
</template>
