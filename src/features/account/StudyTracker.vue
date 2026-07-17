<script setup lang="ts">
/**
 * StudyTracker — 替代 React 的 StudyTracker.jsx
 * 追踪页面停留时长并同步到服务端。渲染为空节点。
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const route = useRoute()
const { syncStudyEvent } = useAuth()

let startedAt = Date.now()
let currentPath = route.path
let dwellInterval: ReturnType<typeof setInterval> | null = null

function dwellKey(pathname: string) {
  return 'dwell_' + pathname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 48)
}
function courseFromPath(pathname: string) {
  return pathname.match(/\/courses\/([^/]+)/)?.[1] || null
}
function subjectFromPath(pathname: string) {
  return pathname.match(/\/courses\/gaokao\/([^/]+)/)?.[1] || null
}

function flush() {
  const now = Date.now()
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
  const path = currentPath
  if (seconds < 5) {
    startedAt = now
    return
  }

  try {
    const key = dwellKey(path)
    const raw = localStorage.getItem(key)
    const current = raw ? Number(JSON.parse(raw)) || 0 : 0
    localStorage.setItem(key, JSON.stringify(current + seconds))
  } catch {
    /* noop */
  }

  void syncStudyEvent({
    eventType: 'page_dwell',
    course: courseFromPath(path),
    subject: subjectFromPath(path),
    pagePath: path,
    payload: { seconds },
  })
  startedAt = now
}

// 路由切换时结算上一页停留时间
watch(
  () => route.path,
  (newPath) => {
    const now = Date.now()
    const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
    if (currentPath !== newPath && seconds >= 5) {
      try {
        const key = dwellKey(currentPath)
        const raw = localStorage.getItem(key)
        const current = raw ? Number(JSON.parse(raw)) || 0 : 0
        localStorage.setItem(key, JSON.stringify(current + seconds))
      } catch {
        /* noop */
      }
      void syncStudyEvent({
        eventType: 'page_dwell',
        course: courseFromPath(currentPath),
        subject: subjectFromPath(currentPath),
        pagePath: currentPath,
        payload: { seconds },
      })
    }
    currentPath = newPath
    startedAt = now
  },
)

onMounted(() => {
  dwellInterval = setInterval(flush, 30_000)
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  flush()
  if (dwellInterval) clearInterval(dwellInterval)
  window.removeEventListener('beforeunload', flush)
})
</script>
