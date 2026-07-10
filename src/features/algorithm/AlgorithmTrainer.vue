<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Layers3, RotateCcw, X } from 'lucide-vue-next'
import quizDataRaw from '../../courses/algorithm/quizData.js'

interface Quiz {
  q: string
  opts: string[]
  ans: number
  explain?: string
}
const quizData = quizDataRaw as Record<string, Quiz[]>
const chapters: Record<string, string> = {
  ch1: '算法概述',
  ch2: '分治法',
  ch3: '动态规划',
  ch4: '贪心算法',
  ch5: '回溯法',
  ch6: '分支限界',
  ch7: '随机算法',
  final: '综合测验',
}
const flashcards = [
  {
    front: '算法的四个基本性质',
    back: '有限性、确定性、可行性，以及零个或多个输入与一个或多个输出。',
  },
  {
    front: '分治法的三个步骤',
    back: '分解问题 → 递归求解 → 合并结果。子问题应当相互独立且规模均衡。',
  },
  { front: '动态规划的两个核心条件', back: '最优子结构与重叠子问题。通常采用自底向上的状态转移。' },
  { front: '贪心算法何时有效', back: '问题同时具备贪心选择性质和最优子结构性质。' },
  {
    front: '回溯法与分支限界的区别',
    back: '回溯常用深度优先搜索所有可行解；分支限界常用广度优先或最佳优先寻找最优解。',
  },
  {
    front: '约束函数与限界函数',
    back: '约束函数剪去不可行解；限界函数剪去不可能优于当前最优解的分支。',
  },
]

const mode = ref<'quiz' | 'cards'>('quiz')
const chapter = ref('ch1')
const questionIndex = ref(0)
const selected = ref<number | null>(null)
const cardIndex = ref(0)
const cardFlipped = ref(false)
const scores = ref<Record<string, boolean>>(loadScores())
const questions = computed(() => quizData[chapter.value] ?? [])
const currentQuestion = computed(() => questions.value[questionIndex.value])
const answered = computed(() => selected.value !== null)
const chapterResults = computed(() =>
  Object.entries(scores.value).filter(([key]) => key.startsWith(`${chapter.value}-`)),
)
const correctCount = computed(() => chapterResults.value.filter(([, correct]) => correct).length)

function choose(index: number) {
  if (answered.value || !currentQuestion.value) return
  selected.value = index
  const next = {
    ...scores.value,
    [`${chapter.value}-${questionIndex.value}`]: index === currentQuestion.value.ans,
  }
  scores.value = next
  localStorage.setItem('algo_quiz', JSON.stringify(next))
}
function moveQuestion(direction: number) {
  const length = questions.value.length
  if (!length) return
  questionIndex.value = (questionIndex.value + direction + length) % length
  selected.value = null
}
function selectChapter(key: string) {
  chapter.value = key
  questionIndex.value = 0
  selected.value = null
}
function loadScores() {
  try {
    return JSON.parse(localStorage.getItem('algo_quiz') || '{}')
  } catch {
    return {}
  }
}
</script>

<template>
  <Teleport defer to="#flashcardGrid">
    <section class="algorithm-trainer" aria-labelledby="algorithm-trainer-title">
      <div class="trainer-heading">
        <div>
          <p>互动巩固</p>
          <h3 id="algorithm-trainer-title">把知识点练成直觉</h3>
        </div>
        <BookOpenCheck :size="24" />
      </div>
      <div class="trainer-tabs" role="tablist" aria-label="练习模式">
        <button type="button" :class="{ active: mode === 'quiz' }" @click="mode = 'quiz'">
          <Check :size="16" />章节测验
        </button>
        <button type="button" :class="{ active: mode === 'cards' }" @click="mode = 'cards'">
          <Layers3 :size="16" />知识闪卡
        </button>
      </div>
      <template v-if="mode === 'quiz'">
        <div class="trainer-chapters">
          <button
            v-for="(name, key) in chapters"
            :key="key"
            type="button"
            :class="{ active: chapter === key }"
            @click="selectChapter(key)"
          >
            {{ name }}
          </button>
        </div>
        <div v-if="currentQuestion" class="trainer-quiz">
          <div class="trainer-progress">
            <span>第 {{ questionIndex + 1 }} / {{ questions.length }} 题</span
            ><span>已答对 {{ correctCount }} / {{ chapterResults.length }}</span>
          </div>
          <h4>{{ currentQuestion.q }}</h4>
          <button
            v-for="(option, index) in currentQuestion.opts"
            :key="option"
            type="button"
            class="trainer-option"
            :class="{
              correct: answered && index === currentQuestion.ans,
              wrong: answered && index === selected && index !== currentQuestion.ans,
            }"
            @click="choose(index)"
          >
            <span>{{ String.fromCharCode(65 + index) }}</span
            >{{ option }}<Check v-if="answered && index === currentQuestion.ans" :size="17" /><X
              v-else-if="answered && index === selected"
              :size="17"
            />
          </button>
          <div v-if="answered" class="trainer-explanation">
            <strong>{{ selected === currentQuestion.ans ? '回答正确' : '再想一想' }}</strong>
            <p>{{ currentQuestion.explain }}</p>
          </div>
          <div class="trainer-navigation">
            <button type="button" @click="moveQuestion(-1)"><ArrowLeft :size="17" />上一题</button
            ><button type="button" @click="moveQuestion(1)">下一题<ArrowRight :size="17" /></button>
          </div>
        </div>
      </template>
      <div v-else class="flashcard-stage">
        <button
          type="button"
          class="flashcard"
          :class="{ flipped: cardFlipped }"
          @click="cardFlipped = !cardFlipped"
        >
          <RotateCcw :size="18" /><small>{{ cardFlipped ? '答案' : '问题' }}</small
          ><strong>{{
            cardFlipped ? flashcards[cardIndex].back : flashcards[cardIndex].front
          }}</strong
          ><span>点击翻面</span>
        </button>
        <div class="trainer-navigation">
          <button
            type="button"
            @click="
              cardIndex = (cardIndex - 1 + flashcards.length) % flashcards.length
              cardFlipped = false
            "
          >
            <ArrowLeft :size="17" />上一张</button
          ><span>{{ cardIndex + 1 }} / {{ flashcards.length }}</span
          ><button
            type="button"
            @click="
              cardIndex = (cardIndex + 1) % flashcards.length
              cardFlipped = false
            "
          >
            下一张<ArrowRight :size="17" />
          </button>
        </div>
      </div>
    </section>
  </Teleport>
</template>
