<script setup lang="ts">
/**
 * ExamQuery — 替代 React 的 features/exam/ExamQuery.jsx
 * 根据班级 ID 查询考试安排，带实时倒计时。
 */
import { ref, onMounted, onUnmounted } from 'vue'

const LS_KEY = 'exam_class_id'
const LS_DELETED = 'exam_deleted'

interface ExamEntry {
  course: string
  date: string
  start: string
  end: string
  room: string
  teacher: string
  type: 'school' | 'college'
  iso: string
}

function getDeletedExams(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LS_DELETED) || '{}')
  } catch {
    return {}
  }
}
function isDeleted(classId: string, key: string) {
  const d = getDeletedExams()
  return !!(d[classId] && d[classId].includes(key))
}
function markDeleted(classId: string, key: string) {
  const d = getDeletedExams()
  if (!d[classId]) d[classId] = []
  if (!d[classId].includes(key)) d[classId].push(key)
  try {
    localStorage.setItem(LS_DELETED, JSON.stringify(d))
  } catch {
    /* noop */
  }
}
function getCourseKey(e: ExamEntry) {
  return e.course + '|' + e.date + '|' + e.start
}
function cleanOldDeleted(classId: string) {
  const d = getDeletedExams()
  if (!d[classId]) return
  const now = Date.now()
  d[classId] = d[classId].filter((k) => {
    const p = k.split('|')
    return p.length >= 2 && now - new Date(p[1]).getTime() < 30 * 86400000
  })
  if (!d[classId].length) delete d[classId]
  try {
    localStorage.setItem(LS_DELETED, JSON.stringify(d))
  } catch {
    /* noop */
  }
}
function formatDate(ds: string) {
  const p = ds.split('-'),
    m = parseInt(p[1]),
    d = parseInt(p[2])
  return m + '月' + d + '日 周' + ['日', '一', '二', '三', '四', '五', '六'][new Date(ds).getDay()]
}
function countdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return '已开始！'
  const d = Math.floor(diff / 86400000),
    h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000),
    s = Math.floor((diff % 60000) / 1000)
  return d > 0
    ? `${d} 天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const classId = ref('')
const queryId = ref('')
const exams = ref<ExamEntry[]>([])
const deletedCount = ref(0)
const showResult = ref(false)
const msg = ref<{ text: string; type: string } | null>(null)
const loading = ref(false)
const countdowns = ref<Record<number, string>>({})

let cachedData: Record<string, ExamEntry[]> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let cdTimer: ReturnType<typeof setInterval> | null = null

async function loadData() {
  if (cachedData) return cachedData
  const w = window as unknown as Record<string, unknown>
  if (w['EXAM_SCHEDULE_DATA'])
    return (cachedData = w['EXAM_SCHEDULE_DATA'] as Record<string, ExamEntry[]>)
  try {
    const res = await fetch('/files/exam-schedule.json')
    return (cachedData = (await res.json()) as Record<string, ExamEntry[]>)
  } catch {
    return new Promise<Record<string, ExamEntry[]>>((resolve) => {
      const s = document.createElement('script')
      s.src = '/files/exam-schedule-data.js'
      s.onload = () => {
        cachedData = w['EXAM_SCHEDULE_DATA'] as Record<string, ExamEntry[]>
        resolve(cachedData)
      }
      document.head.appendChild(s)
    })
  }
}

async function doQuery(id: string) {
  if (!id.trim()) return
  loading.value = true
  try {
    const d = await loadData()
    if (!d) {
      msg.value = { text: '加载考试数据失败，请稍后再试。', type: 'error' }
      return
    }
    id = id.trim().toUpperCase()
    let targetId = id,
      examsArr = d[id]
    if (!examsArr) {
      const matches = Object.keys(d).filter((k) => k.includes(id))
      if (matches.length === 1) {
        targetId = matches[0]
        examsArr = d[targetId]
      } else if (matches.length > 1) {
        msg.value = {
          text: '多个匹配：' + matches.slice(0, 8).join('、') + '，请输入完整 ID。',
          type: 'warn',
        }
        return
      } else {
        msg.value = { text: '未找到班级「' + id + '」的考试安排。', type: 'warn' }
        return
      }
    }
    queryId.value = targetId
    try {
      localStorage.setItem(LS_KEY, targetId)
    } catch {
      /* noop */
    }
    cleanOldDeleted(targetId)
    const now = new Date()
    let delCnt = 0
    const visible = examsArr.filter((e) => {
      if (new Date(e.iso) < now) return false
      if (isDeleted(targetId, getCourseKey(e))) {
        delCnt++
        return false
      }
      return true
    })
    exams.value = visible
    deletedCount.value = delCnt
    showResult.value = true
    msg.value = null
    // 倒计时
    cdTimer && clearInterval(cdTimer)
    const tick = () => {
      const m: Record<number, string> = {}
      visible.forEach((e, i) => {
        m[i] = countdown(e.iso)
      })
      countdowns.value = m
    }
    tick()
    cdTimer = setInterval(tick, 1000)
  } finally {
    loading.value = false
    if (refreshTimer) clearInterval(refreshTimer)
    refreshTimer = setInterval(() => doQuery(queryId.value), 3600000)
  }
}

function removeExam(idx: number) {
  const e = exams.value[idx]
  markDeleted(queryId.value, getCourseKey(e))
  exams.value.splice(idx, 1)
  if (!exams.value.length) {
    showResult.value = false
    msg.value = { text: '所有考试已结束或已清除，切换班级可重新查询。', type: 'warn' }
  }
}

function clearQuery() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* noop */
  }
  if (refreshTimer) clearInterval(refreshTimer)
  queryId.value = ''
  exams.value = []
  showResult.value = false
  msg.value = null
  classId.value = ''
}

function resetDeleted() {
  const d = getDeletedExams()
  delete d[queryId.value]
  try {
    localStorage.setItem(LS_DELETED, JSON.stringify(d))
  } catch {
    /* noop */
  }
  doQuery(queryId.value)
}

onMounted(() => {
  const saved = localStorage.getItem(LS_KEY)
  if (saved) {
    classId.value = saved
    doQuery(saved)
  } else loadData()
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (cdTimer) clearInterval(cdTimer)
})
</script>

<template>
  <div class="exam-section">
    <!-- 查询框 -->
    <div v-show="!showResult" id="examInput" class="exam-input-wrap">
      <div class="exam-input-title">📅 查询考试安排</div>
      <div class="exam-input-row">
        <input
          id="examClassInput"
          v-model="classId"
          placeholder="输入班级 ID（如 B220207）"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="doQuery(classId)"
        />
        <button :disabled="loading" @click="doQuery(classId)">
          {{ loading ? '加载中…' : '查询' }}
        </button>
      </div>
      <div class="exam-input-hint">输入班级 ID 即可查看该班所有考试时间、教室和教师信息</div>
      <div v-if="msg" :class="'exam-msg exam-msg-' + msg.type" style="margin-top: 12px">
        {{ msg.text }}
      </div>
    </div>

    <!-- 结果列表 -->
    <div v-if="showResult" class="exam-result">
      <div class="exam-header">
        <div class="exam-title">
          <span class="exam-class-badge">{{ queryId }}</span> 考试安排
          <span class="exam-count">{{ exams.length }} 门</span>
        </div>
        <div class="exam-header-btns">
          <button v-if="deletedCount > 0" class="exam-reset" @click="resetDeleted">
            恢复 {{ deletedCount }} 门
          </button>
          <button class="exam-switch" @click="clearQuery">切换班级</button>
        </div>
      </div>
      <div v-if="exams.length === 0" class="exam-msg exam-msg-warn">
        所有考试已结束或已清除，切换班级可重新查询。
      </div>
      <div v-else class="exam-scroll-window">
        <div class="exam-list">
          <div v-for="(ev, j) in exams" :key="j" class="exam-card">
            <button class="exam-del" title="移除" @click="removeExam(j)">&times;</button>
            <div class="exam-card-top">
              <div class="exam-course">{{ ev.course }}</div>
              <span :class="'exam-type-tag exam-type-' + ev.type">{{
                ev.type === 'school' ? '校考' : '院考'
              }}</span>
            </div>
            <div class="exam-card-grid">
              <div class="exam-info">
                <span class="exam-label">日期</span
                ><span class="exam-value">{{ formatDate(ev.date) }}</span>
              </div>
              <div class="exam-info">
                <span class="exam-label">时间</span
                ><span class="exam-value">{{ ev.start }} - {{ ev.end }}</span>
              </div>
              <div class="exam-info">
                <span class="exam-label">教室</span><span class="exam-value">{{ ev.room }}</span>
              </div>
              <div class="exam-info">
                <span class="exam-label">教师</span><span class="exam-value">{{ ev.teacher }}</span>
              </div>
            </div>
            <div v-if="ev.iso && new Date(ev.iso) > new Date()" class="exam-countdown">
              距考试还有 <span class="live-countdown">{{ countdowns[j] }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
