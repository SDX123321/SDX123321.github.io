<script setup lang="ts">
/**
 * RandomQuizFAB — 替代 React 的 features/random-quiz/RandomQuizFAB.jsx
 * 从当前课程页面收集题目，随机组卷并计时测验。
 */
import { ref, computed, onUnmounted } from 'vue'

interface Question {
  text: string
  options: string[]
  correct: number
  chapter: string
}

function collectPageQuizzes(): Question[] {
  const questions: Question[] = []
  document.querySelectorAll<HTMLElement>('.quiz-container[data-correct]').forEach((c) => {
    const qEl = c.querySelector('.quiz-q')
    if (!qEl) return
    const correct = parseInt(c.dataset['correct'] || '')
    if (isNaN(correct)) return
    const opts: string[] = []
    c.querySelectorAll('.quiz-options label').forEach((label) => {
      const clone = label.cloneNode(true) as HTMLElement
      clone.querySelector('input')?.remove()
      opts.push(clone.textContent?.trim() || '')
    })
    if (!opts.length) return
    let chapter = '综合'
    let prev = c.previousElementSibling
    while (prev) {
      if (prev.tagName === 'H2' || prev.tagName === 'H3') {
        chapter = prev.textContent?.trim() || '综合'
        break
      }
      prev = prev.previousElementSibling
    }
    questions.push({ text: qEl.innerHTML.trim(), options: opts, correct, chapter })
  })
  return questions
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60),
    s = sec % 60
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
}

// ── 状态 ──
const open = ref(false)
const phase = ref<'config' | 'quiz' | 'result'>('config')
const questions = ref<Question[]>([])
const answers = ref<number[]>([])
const currentIdx = ref(0)
const timeLeft = ref(0)
const submitted = ref(false)
const score = ref(0)
const configCount = ref(10)
const configTime = ref(15)

let timerHandle: ReturnType<typeof setInterval> | null = null

const allQ = computed(() => collectPageQuizzes())

function clearTimer() {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

function startQuiz() {
  if (allQ.value.length === 0) {
    alert('当前页面没有找到自测题目。')
    return
  }
  const shuffled = [...allQ.value].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(configCount.value, allQ.value.length))
  questions.value = selected
  answers.value = new Array(selected.length).fill(-1)
  currentIdx.value = 0
  submitted.value = false
  score.value = 0
  timeLeft.value = configTime.value * 60
  phase.value = 'quiz'
  clearTimer()
  timerHandle = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) {
      clearTimer()
      submitQuiz()
    }
  }, 1000)
}

function selectOpt(qi: number, oi: number) {
  if (submitted.value) return
  const next = [...answers.value]
  next[qi] = oi
  answers.value = next
}

function submitQuiz() {
  if (submitted.value) return
  submitted.value = true
  clearTimer()
  let correct = 0
  questions.value.forEach((q, i) => {
    if (answers.value[i] === q.correct) correct++
  })
  score.value = correct
  phase.value = 'result'
}

function close() {
  open.value = false
  phase.value = 'config'
  clearTimer()
}

const pct = computed(() =>
  questions.value.length ? Math.round((score.value / questions.value.length) * 100) : 0,
)
const resultColor = computed(() =>
  pct.value >= 80
    ? 'var(--success,#34d399)'
    : pct.value >= 60
      ? 'var(--warning,#fbbf24)'
      : 'var(--danger,#f87171)',
)

onUnmounted(clearTimer)
</script>

<template>
  <!-- FAB -->
  <button
    class="rq-fab"
    title="随机组卷"
    @click="
      open = true
      phase = 'config'
    "
  >
    🎲
  </button>

  <!-- 弹窗 -->
  <Teleport to="body">
    <div v-if="open" class="rq-overlay" @click.self="close">
      <div class="rq-panel">
        <button class="rq-close" @click="close">&times;</button>

        <!-- 配置页 -->
        <template v-if="phase === 'config'">
          <h3 class="rq-subtitle">🎲 随机组卷</h3>
          <p class="rq-desc">
            从当前页面 <strong>{{ allQ.length }}</strong> 道题中随机抽取
          </p>

          <label class="rq-lbl">题目数量</label>
          <div class="rq-radio-group">
            <label
              v-for="n in [10, 15, 20]"
              :key="n"
              class="rq-radio"
              :class="{ active: configCount === n }"
            >
              <input v-model="configCount" type="radio" name="rq-count" :value="n" /> {{ n }} 题
            </label>
          </div>

          <label class="rq-lbl">考试时长</label>
          <div class="rq-radio-group">
            <label
              v-for="t in [
                { v: 10, l: '10分钟' },
                { v: 15, l: '15分钟' },
                { v: 20, l: '20分钟' },
                { v: 30, l: '30分钟' },
              ]"
              :key="t.v"
              class="rq-radio"
              :class="{ active: configTime === t.v }"
            >
              <input v-model="configTime" type="radio" name="rq-time" :value="t.v" /> {{ t.l }}
            </label>
          </div>

          <div class="rq-actions">
            <button class="rq-start" @click="startQuiz">开始考试</button>
          </div>
        </template>

        <!-- 答题页 -->
        <template v-else-if="phase === 'quiz'">
          <!-- 计时器 -->
          <div
            class="rq-timer"
            :style="{ color: timeLeft <= 60 ? 'var(--danger,#f87171)' : 'var(--success,#34d399)' }"
          >
            {{ formatTime(timeLeft) }}
          </div>

          <!-- 进度点 -->
          <div class="rq-dots">
            <div
              v-for="(_, i) in questions"
              :key="i"
              class="rq-dot"
              :class="{
                'rq-dot--current': i === currentIdx,
                'rq-dot--done': answers[i] !== -1 && i !== currentIdx,
              }"
              @click="currentIdx = i"
            >
              {{ i + 1 }}
            </div>
          </div>

          <!-- 题目卡 -->
          <div class="rq-card">
            <div class="rq-qtext" v-html="currentIdx + 1 + '. ' + questions[currentIdx].text" />
            <div
              v-for="(opt, oi) in questions[currentIdx].options"
              :key="oi"
              class="rq-opt"
              :class="{ 'rq-opt--selected': answers[currentIdx] === oi }"
              @click="selectOpt(currentIdx, oi)"
            >
              {{ opt }}
            </div>
          </div>

          <!-- 导航 -->
          <div class="rq-nav">
            <button v-if="currentIdx > 0" class="rq-nav-btn" @click="currentIdx--">← 上一题</button>
            <div v-else />
            <button
              v-if="currentIdx < questions.length - 1"
              class="rq-nav-btn rq-nav-btn--primary"
              @click="currentIdx++"
            >
              下一题 →
            </button>
            <button v-else class="rq-nav-btn rq-nav-btn--primary" @click="submitQuiz">
              提交答卷
            </button>
          </div>
        </template>

        <!-- 结果页 -->
        <template v-else-if="phase === 'result'">
          <div class="rq-result-head">
            <div class="rq-score" :style="{ color: resultColor }">{{ pct }}</div>
            <div class="rq-score-sub">正确 {{ score }} / {{ questions.length }} 题</div>
          </div>

          <div v-for="(q, i) in questions" :key="i" class="rq-card">
            <div class="rq-qtext" v-html="i + 1 + '. ' + q.text" />
            <div
              v-for="(opt, oi) in q.options"
              :key="oi"
              class="rq-opt"
              :class="{
                'rq-opt--correct': oi === q.correct,
                'rq-opt--wrong': oi === answers[i] && answers[i] !== q.correct,
              }"
            >
              {{ opt }}
            </div>
          </div>

          <div class="rq-result-actions">
            <button class="rq-nav-btn rq-nav-btn--primary" @click="phase = 'config'">
              再考一次
            </button>
            <button class="rq-nav-btn" @click="close">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rq-fab {
  position: fixed;
  bottom: 195px;
  right: 30px;
  z-index: 98;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f59e0b;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}
.rq-fab:hover {
  transform: scale(1.1);
}
.rq-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rq-panel {
  background: var(--card, #1a1d27);
  border-radius: 16px;
  padding: 28px;
  max-width: 700px;
  width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  position: relative;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
.rq-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.3rem;
  color: var(--text3);
}
.rq-subtitle {
  margin: 0 0 8px;
  font-size: 1.15rem;
  color: var(--accent2, #a78bfa);
}
.rq-desc {
  font-size: 0.88rem;
  color: var(--text2);
  margin-bottom: 16px;
}
.rq-lbl {
  display: block;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text2);
  margin-bottom: 6px;
}
.rq-radio-group {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.rq-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
}
.rq-radio.active {
  border-color: var(--accent, #6c8aff);
  background: rgba(108, 138, 255, 0.1);
}
.rq-radio input {
  display: none;
}
.rq-actions {
  display: flex;
  justify-content: flex-end;
}
.rq-start {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--accent, #6c8aff);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
}
.rq-timer {
  text-align: center;
  padding: 12px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  font-size: 1.3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.rq-dots {
  display: flex;
  gap: 5px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.rq-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  border: 2px solid var(--border);
  color: var(--text3);
}
.rq-dot--current {
  border-color: var(--accent, #6c8aff);
  color: var(--accent, #6c8aff);
  transform: scale(1.1);
}
.rq-dot--done {
  border-color: var(--success, #34d399);
  background: rgba(52, 211, 153, 0.15);
  color: var(--success, #34d399);
}
.rq-card {
  background: var(--card2, #22263a);
  border-radius: 12px;
  padding: 20px;
  margin: 12px 0;
}
.rq-qtext {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 14px;
}
.rq-opt {
  display: block;
  padding: 10px 16px;
  margin: 6px 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  border: 1px solid var(--border);
  color: var(--text);
}
.rq-opt--selected {
  border-color: var(--accent, #6c8aff);
  background: rgba(108, 138, 255, 0.18);
}
.rq-opt--correct {
  border-color: var(--success, #34d399);
  background: rgba(52, 211, 153, 0.15);
  color: var(--success, #34d399);
}
.rq-opt--wrong {
  border-color: var(--danger, #f87171);
  background: rgba(248, 113, 113, 0.15);
  color: var(--danger, #f87171);
}
.rq-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
.rq-nav-btn {
  padding: 10px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  background: var(--card2, #22263a);
  color: var(--text);
  border: 1px solid var(--border);
}
.rq-nav-btn--primary {
  background: var(--accent, #6c8aff);
  color: #fff;
  border: none;
  font-weight: 600;
}
.rq-result-head {
  text-align: center;
  padding: 32px 20px;
}
.rq-score {
  font-size: 3.5rem;
  font-weight: 800;
}
.rq-score-sub {
  font-size: 0.95rem;
  color: var(--text2);
  margin-top: 4px;
}
.rq-result-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}
</style>
