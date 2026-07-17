<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowUp,
  Bot,
  BookOpen,
  CircleAlert,
  FileText,
  Eye,
  LockKeyhole,
  Settings,
  Sparkles,
  Trash2,
  X,
  MessageSquarePlus,
  PanelLeftClose,
  BrainCircuit,
  Square,
  Gauge,
} from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'
import { renderMarkdown } from '../../lib/renderMarkdown'
import MaterialPreviewDialog from '../../components/high-school/MaterialPreviewDialog.vue'

const emit = defineEmits<{ (event: 'require-auth'): void }>()
const auth = useAuth()
const question = ref('')
const subject = ref('all')
const grades = ref<string[]>([])
const gradeOptions = [
  ['grade-1', '高一'],
  ['grade-2', '高二'],
  ['grade-3', '高三'],
]
const answer = ref('')
const sources = ref<any[]>([])
const answerMode = ref<'grounded' | 'hybrid' | 'general' | 'blocked'>('grounded')
const answerWarning = ref('')
const reasoningLevel = ref<'standard' | 'advanced'>('advanced')
const reasoningProcessed = ref(0)
const reasoningText = ref('')
const reasoningOpen = ref(false)
const interrupted = ref(false)
const requestController = ref<AbortController | null>(null)
const metrics = ref({ inputTokens: 0, outputTokens: 0, totalTokens: 0, ttftMs: 0, durationMs: 0 })
const renderedAnswer = computed(() => renderMarkdown(answer.value, sources.value.length))
const busy = ref(false)
const error = ref('')
const providers = ref<any[]>([])
const providerConfigId = ref('')
const configOpen = ref(false)
const preview = ref<any>(null)
const previewBusy = ref(false)
const providerError = ref('')
const conversations = ref<any[]>([])
const conversationId = ref('')
const historyOpen = ref(true)
const providerForm = ref({
  name: 'DeepSeek',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
})
const examples = ref([
  '比较 2024—2026 江苏高考数学函数题的常见设问',
  '高二物理期中考试中动量部分有哪些高频错误？',
  '用资料解释英语读后续写怎样安排情节线索',
])

async function loadSuggestions() {
  const params = new URLSearchParams({ subject: subject.value, limit: '3' })
  if (grades.value.length === 1) params.set('grade', grades.value[0])
  const response = await fetch(`/api/knowledge/suggested-questions?${params}`, {
    credentials: 'include',
  })
  if (response.ok) examples.value = (await response.json()).questions || examples.value
}

async function ask() {
  if (!question.value.trim() || busy.value) return
  if (!auth.user) {
    emit('require-auth')
    return
  }
  busy.value = true
  answer.value = ''
  sources.value = []
  answerMode.value = 'grounded'
  answerWarning.value = ''
  reasoningProcessed.value = 0
  reasoningText.value = ''
  reasoningOpen.value = true
  interrupted.value = false
  metrics.value = { inputTokens: 0, outputTokens: 0, totalTokens: 0, ttftMs: 0, durationMs: 0 }
  error.value = ''
  const controller = new AbortController()
  requestController.value = controller
  try {
    if (!conversationId.value) {
      const created = await fetch('/api/me/conversations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: question.value.trim().slice(0, 60),
          subject: subject.value === 'all' ? null : subject.value,
          grade: grades.value.length === 1 ? grades.value[0] : null,
          providerConfigId: providerConfigId.value || null,
        }),
      })
      if (!created.ok) throw new Error('创建对话失败')
      const createdData = await created.json()
      conversationId.value = createdData.id
      conversations.value.unshift({
        id: createdData.id,
        title: question.value.trim().slice(0, 60),
        updatedAt: new Date().toISOString(),
      })
    }
    const response = await fetch('/api/high-school/rag/answer', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        question: question.value.trim(),
        subject: subject.value === 'all' ? null : subject.value,
        grades: grades.value,
        providerConfigId: providerConfigId.value || null,
        conversationId: conversationId.value,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) {
        emit('require-auth')
        throw new Error('请先登录后使用 AI 助学')
      }
      throw new Error(
        body.error === 'model_unavailable'
          ? '本地模型尚未启动，请确认 Ollama 正在运行'
          : body.error || '回答生成失败',
      )
    }
    if (!response.body) throw new Error('浏览器不支持流式回答')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)
        if (event.type === 'sources') {
          sources.value = event.sources || []
          answerMode.value = event.answerMode || 'grounded'
          answerWarning.value = event.warning || ''
          reasoningLevel.value = event.reasoningLevel || 'advanced'
        }
        if (event.type === 'delta') answer.value += event.text || ''
        if (event.type === 'reasoning') {
          reasoningProcessed.value = Number(event.processedChars || 0)
          reasoningText.value += event.text || ''
          reasoningOpen.value = true
        }
        if (event.type === 'metrics') {
          metrics.value = {
            inputTokens: Number(event.inputTokens || 0),
            outputTokens: Number(event.outputTokens || 0),
            totalTokens: Number(event.totalTokens || 0),
            ttftMs: Number(event.ttftMs || 0),
            durationMs: Number(event.durationMs || 0),
          }
        }
        if (event.type === 'gate') answerMode.value = 'blocked'
        if (event.type === 'done') {
          if (event.answer) answer.value = event.answer
          answerMode.value = event.answerMode || answerMode.value
          answerWarning.value = event.warning || answerWarning.value
          reasoningLevel.value = event.reasoningLevel || reasoningLevel.value
          reasoningOpen.value = false
        }
        if (event.type === 'error') {
          throw new Error(
            event.error === 'model_unavailable'
              ? '远程模型暂时不可用，请检查 Provider 配置'
              : '模型输出中断，请重试',
          )
        }
      }
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      interrupted.value = true
      reasoningOpen.value = false
      answerWarning.value = '回答已由你硬中断，以下内容可能不完整。'
      if (!answer.value) error.value = '回答已中断'
    } else {
      error.value = reason instanceof Error ? reason.message : '回答失败'
    }
  } finally {
    busy.value = false
    if (requestController.value === controller) requestController.value = null
    void loadConversations()
  }
}

function stopAnswer() {
  requestController.value?.abort()
}

async function loadConversations() {
  if (!auth.user) {
    conversations.value = []
    return
  }
  const response = await fetch('/api/me/conversations', { credentials: 'include' })
  if (response.ok) conversations.value = (await response.json()).conversations || []
}
function newConversation() {
  conversationId.value = ''
  question.value = ''
  answer.value = ''
  sources.value = []
  answerMode.value = 'grounded'
  answerWarning.value = ''
  reasoningProcessed.value = 0
  reasoningText.value = ''
  reasoningOpen.value = false
  interrupted.value = false
  metrics.value = { inputTokens: 0, outputTokens: 0, totalTokens: 0, ttftMs: 0, durationMs: 0 }
  error.value = ''
}
async function openConversation(id: string) {
  const r = await fetch(`/api/me/conversations/${id}`, { credentials: 'include' })
  if (!r.ok) return
  const data = await r.json()
  const messages = data.messages || []
  conversationId.value = id
  const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')
  const lastAnswer = [...messages].reverse().find((m: any) => m.role === 'assistant')
  question.value = lastUser?.content || ''
  answer.value = lastAnswer?.content || ''
  sources.value = (lastAnswer?.sources || []).map((s: any) => ({
    id: s.chunkId,
    materialId: s.materialId,
    fileName: s.fileName,
    text: s.excerpt,
    chunkIndex: 0,
  }))
  error.value = lastAnswer?.status === 'failed' ? '上次回答未完整生成' : ''
}
async function renameConversation(item: any) {
  const title = prompt('新的对话标题', item.title)
  if (!title?.trim()) return
  await fetch(`/api/me/conversations/${item.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  await loadConversations()
}
async function deleteConversation(item: any) {
  if (!confirm(`删除“${item.title}”及全部消息？`)) return
  await fetch(`/api/me/conversations/${item.id}`, { method: 'DELETE', credentials: 'include' })
  if (conversationId.value === item.id) newConversation()
  await loadConversations()
}

async function loadProviders() {
  const response = await fetch('/api/me/ai-providers', { credentials: 'include' })
  if (response.ok) {
    providers.value = (await response.json()).providers || []
    if (!providerConfigId.value && providers.value.length) {
      providerConfigId.value = (
        providers.value.find((provider) => provider.isDefault) || providers.value[0]
      ).id
    }
  }
}

async function saveProvider() {
  providerError.value = ''
  const response = await fetch('/api/me/ai-providers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(providerForm.value),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    providerError.value = body.error || '配置保存失败'
    return
  }
  providerForm.value.apiKey = ''
  await loadProviders()
  providerConfigId.value = body.id
  configOpen.value = false
}

async function removeProvider(id: string) {
  await fetch(`/api/me/ai-providers/${id}`, { method: 'DELETE', credentials: 'include' })
  if (providerConfigId.value === id) providerConfigId.value = ''
  await loadProviders()
}

async function openSource(source: any) {
  previewBusy.value = true
  preview.value = { loading: true }
  const response = await fetch(`/api/high-school/rag/sources/${source.id}`, {
    credentials: 'include',
  })
  preview.value = response.ok ? (await response.json()).source : { error: '引用原文暂时不可用' }
  previewBusy.value = false
}

function handleAnswerClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return
  const citation = event.target.closest<HTMLElement>('[data-source-index]')
  if (!citation) return
  const source = sources.value[Number(citation.dataset.sourceIndex)]
  if (source) void openSource(source)
}

onMounted(() => {
  void loadProviders()
  void loadConversations()
  void loadSuggestions()
})
watch([subject, grades], loadSuggestions, { deep: true })
</script>

<template>
  <main id="main-content" class="hs-main hs-page-main hs-assistant-page">
    <section class="hs-container hs-page-heading hs-assistant-heading">
      <div>
        <p class="hs-kicker"><Sparkles :size="15" />回答必须有资料依据</p>
        <h1>不是“问 AI”，而是请 AI 帮你读资料。</h1>
        <p>
          4096 维检索先召回本机资料，再由默认远程模型进阶推理，并保留可核对的出处与实时性能指标。
        </p>
      </div>
    </section>
    <section class="hs-container hs-assistant-layout">
      <aside v-if="auth.user" class="hs-conversation-panel" :class="{ collapsed: !historyOpen }">
        <header>
          <button
            type="button"
            :aria-label="historyOpen ? '收起历史对话' : '展开历史对话'"
            @click="historyOpen = !historyOpen"
          >
            <PanelLeftClose :size="17" /></button
          ><strong v-if="historyOpen">历史对话</strong
          ><button v-if="historyOpen" type="button" aria-label="新对话" @click="newConversation">
            <MessageSquarePlus :size="17" />
          </button>
        </header>
        <ul v-if="historyOpen">
          <li
            v-for="item in conversations"
            :key="item.id"
            :class="{ active: item.id === conversationId }"
          >
            <button type="button" @click="openConversation(item.id)">
              <strong>{{ item.title }}</strong
              ><small>{{ new Date(item.updatedAt).toLocaleDateString() }}</small>
            </button>
            <div>
              <button type="button" @click="renameConversation(item)">重命名</button
              ><button type="button" @click="deleteConversation(item)">删除</button>
            </div>
          </li>
        </ul>
      </aside>
      <div class="hs-chat-panel">
        <div v-if="!answer && !busy && !error" class="hs-chat-welcome">
          <span><Bot :size="28" /></span>
          <h2>今天想弄清楚什么？</h2>
          <p>问题越具体，召回的资料越准确。你也可以先限定年级和学科。</p>
          <div>
            <button
              v-for="example in examples"
              :key="example"
              type="button"
              @click="question = example"
            >
              {{ example }}
            </button>
          </div>
        </div>
        <div v-if="busy || answer || error" class="hs-answer-area" aria-live="polite">
          <div class="hs-question-bubble">
            <strong>你的问题</strong>
            <p>{{ question }}</p>
          </div>
          <div class="hs-answer-bubble">
            <span><Bot :size="20" /></span>
            <div>
              <strong>资料助教</strong>
              <div v-if="answer || busy" class="hs-answer-evidence-state" :data-mode="answerMode">
                <span
                  >{{
                    answerMode === 'grounded'
                      ? '资料有据'
                      : answerMode === 'hybrid'
                        ? '资料 + 通识'
                        : answerMode === 'blocked'
                          ? '已门控中断'
                          : '通识补充'
                  }}
                  · {{ reasoningLevel === 'advanced' ? '进阶思考' : '标准思考' }}</span
                >
                <small v-if="answerWarning"><CircleAlert :size="14" />{{ answerWarning }}</small>
              </div>
              <details
                v-if="busy || reasoningText"
                class="hs-reasoning-progress"
                :open="reasoningOpen"
                @toggle="reasoningOpen = ($event.target as HTMLDetailsElement).open"
              >
                <summary>
                  <BrainCircuit :size="16" />
                  <span>{{ busy ? '正在思考' : '思考过程' }}</span>
                  <small>{{
                    reasoningProcessed ? `已接收 ${reasoningProcessed} 字` : '等待模型推理流'
                  }}</small>
                </summary>
                <pre v-if="reasoningText">{{ reasoningText }}</pre>
                <p v-else>模型正在检索资料并建立回答结构；当前模型供应商尚未返回推理过程文本。</p>
              </details>
              <div
                v-if="answer"
                class="hs-markdown-answer"
                @click="handleAnswerClick"
                v-html="renderedAnswer"
              ></div>
              <p v-else-if="busy" class="hs-thinking">
                正在结合历史结论与 RAG 资料进行进阶思考<span v-if="reasoningProcessed"
                  >，已分析约 {{ reasoningProcessed }} 字</span
                >…
              </p>
              <p v-else class="hs-answer-error"><CircleAlert :size="17" />{{ error }}</p>
              <div v-if="metrics.totalTokens || interrupted" class="hs-answer-metrics">
                <span v-if="metrics.totalTokens"
                  ><Gauge :size="14" />{{ metrics.totalTokens.toLocaleString() }} tokens</span
                >
                <span v-if="metrics.inputTokens"
                  >输入 {{ metrics.inputTokens.toLocaleString() }}</span
                >
                <span v-if="metrics.outputTokens"
                  >输出 {{ metrics.outputTokens.toLocaleString() }}</span
                >
                <span v-if="metrics.ttftMs">首字 {{ metrics.ttftMs }} ms</span>
                <span v-if="metrics.durationMs"
                  >总耗时 {{ (metrics.durationMs / 1000).toFixed(1) }} s</span
                >
                <span v-if="interrupted">用户中断</span>
              </div>
            </div>
          </div>
        </div>
        <form class="hs-composer" @submit.prevent="ask">
          <div class="hs-scope-selects">
            <fieldset class="hs-grade-multi">
              <legend>年级（可多选）</legend>
              <label v-for="option in gradeOptions" :key="option[0]">
                <input v-model="grades" type="checkbox" :value="option[0]" />
                <span>{{ option[1] }}</span>
              </label>
              <small v-if="!grades.length">全部</small>
            </fieldset>
            <label
              >学科<select v-model="subject">
                <option value="all">全部</option>
                <option value="chinese">语文</option>
                <option value="math">数学</option>
                <option value="english">英语</option>
                <option value="physics">物理</option>
                <option value="chemistry">化学</option>
                <option value="biology">生物</option>
                <option value="politics">政治</option>
                <option value="history">历史</option>
                <option value="geography">地理</option>
              </select></label
            >
            <label
              >回答模型<select v-model="providerConfigId">
                <option value="">本地 Qwen（无远程配置时回退）</option>
                <option v-for="provider in providers" :key="provider.id" :value="provider.id">
                  {{ provider.name }} · {{ provider.model }}
                </option>
              </select></label
            >
          </div>
          <label class="sr-only" for="assistant-question">输入学习问题</label
          ><textarea
            id="assistant-question"
            v-model="question"
            rows="3"
            placeholder="例如：江苏高考数学导数大题通常怎样分层设问？"
            @keydown.ctrl.enter="ask"
          />
          <div>
            <span>已输入 {{ question.length.toLocaleString() }} 字 · Ctrl + Enter 发送</span
            ><button
              v-if="busy"
              type="button"
              class="hs-stop-answer"
              aria-label="立即中断回答"
              title="立即中断回答"
              @click="stopAnswer"
            >
              <Square :size="16" fill="currentColor" /><span class="sr-only">立即中断回答</span>
            </button>
            <button v-else type="submit" :disabled="!question.trim()">
              <ArrowUp v-if="auth.user" :size="19" /><LockKeyhole v-else :size="18" /><span
                class="sr-only"
                >发送问题</span
              >
            </button>
          </div>
        </form>
        <RouterLink class="hs-provider-settings" to="/high-school/settings"
          ><Settings :size="16" />在设置中管理 AI Provider</RouterLink
        >
      </div>
      <aside class="hs-source-panel">
        <div>
          <BookOpen :size="18" /><strong>本次引用</strong><span>{{ sources.length }}</span>
        </div>
        <p v-if="!sources.length">生成回答后，相关资料片段会显示在这里，便于逐条核对。</p>
        <ol v-else>
          <li v-for="(source, index) in sources" :key="source.id">
            <button type="button" class="hs-source-preview-button" @click="openSource(source)">
              <span>S{{ index + 1 }}</span>
              <div>
                <strong>{{ source.fileName }}</strong>
                <p>{{ source.text }}</p>
                <small>{{ source.year || '年份未标注' }} · 第 {{ source.chunkIndex + 1 }} 段</small>
              </div>
              <Eye :size="16" />
            </button>
          </li>
        </ol>
        <div class="hs-source-note">
          <FileText :size="17" />
          <p>引用只表示回答依据，不代表资料中的所有内容都已经过人工校对。</p>
        </div>
      </aside>
    </section>

    <div v-if="configOpen" class="hs-modal-backdrop" @mousedown.self="configOpen = false">
      <section
        id="provider-config-dialog"
        class="hs-provider-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-title"
      >
        <button class="hs-modal-close" type="button" aria-label="关闭" @click="configOpen = false">
          <X :size="18" />
        </button>
        <p class="hs-kicker"><Settings :size="15" />OpenAI 兼容接口</p>
        <h2 id="provider-title">自定义回答模型</h2>
        <p>API Key 将加密保存；检索与引用仍由本站资料库控制。</p>
        <form @submit.prevent="saveProvider">
          <label>配置名称<input v-model.trim="providerForm.name" required maxlength="40" /></label>
          <label
            >提供商<select v-model="providerForm.provider">
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">其他兼容接口</option>
            </select></label
          >
          <label>API 地址<input v-model.trim="providerForm.baseUrl" required type="url" /></label>
          <label>模型<input v-model.trim="providerForm.model" required /></label>
          <label
            >API Key<input
              v-model="providerForm.apiKey"
              required
              type="password"
              autocomplete="off"
              minlength="8"
          /></label>
          <p v-if="providerError" class="hs-form-error" role="alert">{{ providerError }}</p>
          <button class="hs-primary-button" type="submit">保存配置</button>
        </form>
        <ul v-if="providers.length" class="hs-provider-list">
          <li v-for="provider in providers" :key="provider.id">
            <div>
              <strong>{{ provider.name }}</strong
              ><small>{{ provider.model }}</small>
            </div>
            <button type="button" aria-label="删除配置" @click="removeProvider(provider.id)">
              <Trash2 :size="16" />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <MaterialPreviewDialog
      :open="Boolean(preview)"
      :source="preview"
      :loading="previewBusy"
      @close="preview = null"
    />
  </main>
</template>
