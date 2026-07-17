<script setup lang="ts">
/**
 * ChapterProgress — 替代 React 的 features/ux/ChapterProgress.jsx
 * 在课程页面的 h2 标题旁注入复选框，追踪章节完成进度。
 */
import { onMounted, onUnmounted } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { useRoute } from 'vue-router'

const route = useRoute()
const { syncStudyEvent } = useAuth()

let bar: HTMLElement | null = null
let label: HTMLElement | null = null

onMounted(() => {
  const p = route.path
  const pageId = p.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 30)
  const DONE_KEY = 'chapter_done_' + pageId
  const headings = document.querySelectorAll<HTMLElement>('.main h2, .section h2, main h2')
  if (headings.length < 2) return

  function getDone(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem(DONE_KEY) || '{}')
    } catch {
      return {}
    }
  }
  function saveDone(s: Record<string, boolean>) {
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(s))
    } catch {
      /* noop */
    }
  }

  function updateProgress() {
    const s = getDone()
    const total = headings.length
    const done = Object.values(s).filter(Boolean).length
    const pct = Math.round((done / total) * 100)
    if (bar) (bar.querySelector('#ux-progress-fill') as HTMLElement).style.width = pct + '%'
    if (label) label.textContent = '📖 ' + done + '/' + total + ' (' + pct + '%)'
  }

  headings.forEach((h2, i) => {
    const key = 'h' + i
    const chk = document.createElement('label')
    chk.className = 'ux-chapter-check'
    chk.innerHTML =
      '<input type="checkbox" style="width:14px;height:14px;accent-color:var(--success,#2ecc71);cursor:pointer">'
    h2.appendChild(chk)

    const state = getDone()
    const inp = chk.querySelector('input') as HTMLInputElement
    inp.checked = !!state[key]
    if (state[key]) h2.style.opacity = '.5'

    inp.addEventListener('change', () => {
      const s = getDone()
      s[key] = inp.checked
      saveDone(s)
      h2.style.opacity = s[key] ? '.5' : '1'
      if (s[key]) {
        void syncStudyEvent({
          eventType: 'chapter_done',
          course: pageId,
          pagePath: window.location.pathname,
          objectId: key,
          payload: { heading: h2.textContent?.replace(/\s+/g, ' ').trim() },
        })
      }
      updateProgress()
    })
  })

  bar = document.createElement('div')
  bar.className = 'ux-progress-bar'
  bar.innerHTML = '<div class="ux-progress-fill" id="ux-progress-fill" style="width:0%"></div>'
  label = document.createElement('div')
  label.className = 'ux-progress-label'
  label.id = 'ux-progress-label'
  label.textContent = '0%'
  document.body.appendChild(bar)
  document.body.appendChild(label)
  updateProgress()
})

onUnmounted(() => {
  bar?.remove()
  label?.remove()
})
</script>
