<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
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
} from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

const emit = defineEmits<{ (event: 'require-auth'): void }>()
const auth = useAuth()
const question = ref('')
const subject = ref('all')
const grade = ref('all')
const answer = ref('')
const sources = ref<any[]>([])
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
  if (grade.value !== 'all') params.set('grade', grade.value)
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
  error.value = ''
  try {
    if (!conversationId.value) {
      const created = await fetch('/api/me/conversations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: question.value.trim().slice(0, 60),
          subject: subject.value === 'all' ? null : subject.value,
          grade: grade.value === 'all' ? null : grade.value,
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
      body: JSON.stringify({
        question: question.value.trim(),
        subject: subject.value === 'all' ? null : subject.value,
        grade: grade.value === 'all' ? null : grade.value,
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
        if (event.type === 'sources') sources.value = event.sources || []
        if (event.type === 'delta') answer.value += event.text || ''
        if (event.type === 'done' && event.answer) answer.value = event.answer
        if (event.type === 'error') throw new Error('模型输出中断，请重试')
      }
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '回答失败'
  } finally {
    busy.value = false
    void loadConversations()
  }
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
  if (response.ok) providers.value = (await response.json()).providers || []
}

function openProviderConfig() {
  configOpen.value = true
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

onMounted(() => {
  void loadProviders()
  void loadConversations()
  void loadSuggestions()
})
watch([subject, grade], loadSuggestions)
</script>

<template>
  <main id="main-content" class="hs-main hs-page-main hs-assistant-page">
    <section class="hs-container hs-page-heading hs-assistant-heading">
      <div>
        <p class="hs-kicker"><Sparkles :size="15" />回答必须有资料依据</p>
        <h1>不是“问 AI”，而是请 AI 帮你读资料。</h1>
        <p>BGE-M3 从本机资料库召回片段，Qwen 只根据这些片段回答，并保留可核对的出处。</p>
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
              <p v-if="answer">{{ answer }}</p>
              <p v-else-if="busy" class="hs-thinking">正在阅读相关资料并组织答案…</p>
              <p v-else class="hs-answer-error"><CircleAlert :size="17" />{{ error }}</p>
            </div>
          </div>
        </div>
        <form class="hs-composer" @submit.prevent="ask">
          <div class="hs-scope-selects">
            <label
              >年级<select v-model="grade">
                <option value="all">全部</option>
                <option value="grade-1">高一</option>
                <option value="grade-2">高二</option>
                <option value="grade-3">高三</option>
              </select></label
            ><label
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
                <option value="">本地 Qwen</option>
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
            maxlength="500"
            placeholder="例如：江苏高考数学导数大题通常怎样分层设问？"
            @keydown.ctrl.enter="ask"
          />
          <div>
            <span>{{ question.length }}/500 · Ctrl + Enter 发送</span
            ><button type="submit" :disabled="!question.trim() || busy">
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

    <div v-if="preview" class="hs-modal-backdrop" @mousedown.self="preview = null">
      <section
        class="hs-source-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-preview-title"
      >
        <button class="hs-modal-close" type="button" aria-label="关闭" @click="preview = null">
          <X :size="18" />
        </button>
        <p class="hs-kicker"><FileText :size="15" />引用原文</p>
        <h2 id="source-preview-title">{{ preview.material?.fileName || '正在读取引用' }}</h2>
        <p v-if="previewBusy">正在加载原文片段…</p>
        <p v-else-if="preview.error" class="hs-form-error">{{ preview.error }}</p>
        <blockquote v-else>{{ preview.text }}</blockquote>
        <div v-if="preview.material" class="hs-source-modal-meta">
          <span>第 {{ preview.chunkIndex + 1 }} 段</span><span>{{ preview.material.subject }}</span
          ><span>{{ preview.material.year || '年份未标注' }}</span>
        </div>
        <a
          v-if="preview.material"
          :href="`/api/high-school/materials/${preview.material.id}/download`"
          >下载完整资料</a
        >
      </section>
    </div>
  </main>
</template>
