<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  Check,
  Database,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  Settings,
  Star,
  Trash2,
} from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

const auth = useAuth()
const grades = [
  { value: 'grade-1', label: '高一' },
  { value: 'grade-2', label: '高二' },
  { value: 'grade-3', label: '高三' },
]
const subjectOptions = [
  { value: 'chinese', label: '语文' },
  { value: 'math', label: '数学' },
  { value: 'english', label: '英语' },
  { value: 'physics', label: '物理' },
  { value: 'chemistry', label: '化学' },
  { value: 'biology', label: '生物' },
  { value: 'politics', label: '政治' },
  { value: 'history', label: '历史' },
  { value: 'geography', label: '地理' },
]
const grade = ref('')
const subjects = ref<string[]>([])
const providers = ref<any[]>([])
const notice = ref('')
const error = ref('')
const ollama = ref({ baseUrl: '', embeddingModel: '', chatModel: '' })
const ollamaStatus = ref<any>(null)
const ollamaBusy = ref<'test' | 'save' | ''>('')
const ollamaMessage = ref('')
const ollamaError = ref('')
const missingIndexDomain = ref('high-school')
const missingIndexRun = ref<any>(null)
const missingIndexBusy = ref(false)
const missingIndexMessage = ref('')
let missingIndexTimer: ReturnType<typeof setTimeout> | undefined
const form = ref({
  name: 'DeepSeek',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
})
const password = ref({ currentPassword: '', newPassword: '' })
async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const r = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b.error || '操作失败')
  return b
}
async function load() {
  if (!auth.user) return
  const [p, a] = await Promise.all([api('/api/me/preferences'), api('/api/me/ai-providers')])
  grade.value = p.grade || ''
  subjects.value = p.subjects || []
  providers.value = a.providers || []
  if (auth.user?.role === 'admin') await Promise.all([loadOllama(), loadLatestIndexRun()])
}

async function loadLatestIndexRun() {
  try {
    const overview = await api('/api/admin/overview')
    if (overview.lastIndexRun?.id) await pollMissingIndex(overview.lastIndexRun.id)
  } catch {
    /* Ollama settings remain usable when no index history exists. */
  }
}

async function pollMissingIndex(id: string) {
  if (missingIndexTimer) clearTimeout(missingIndexTimer)
  const run = await api(`/api/admin/knowledge/index-runs/${id}`)
  missingIndexRun.value = run
  if (['queued', 'running', 'paused'].includes(run.status)) {
    missingIndexTimer = setTimeout(() => void pollMissingIndex(id), 1200)
  } else {
    missingIndexBusy.value = false
  }
}

async function indexMissingMaterials() {
  if (missingIndexBusy.value) return
  missingIndexBusy.value = true
  missingIndexMessage.value = ''
  try {
    const run = await api('/api/admin/knowledge/index-runs', {
      method: 'POST',
      body: JSON.stringify({ domain: missingIndexDomain.value, missingOnly: true }),
    })
    missingIndexRun.value = { ...run, progress: 0 }
    missingIndexMessage.value = '已开始扫描，仅处理没有可用 RAG 切片的资料。'
    await pollMissingIndex(run.id)
  } catch (reason) {
    missingIndexBusy.value = false
    missingIndexMessage.value =
      reason instanceof Error && reason.message === 'index_already_running'
        ? '已有索引任务正在运行，请等待当前任务结束。'
        : reason instanceof Error
          ? reason.message
          : '无法启动补充索引'
  }
}
const ollamaErrors: Record<string, string> = {
  password_change_required: '请先使用页面下方的“修改密码”完成管理员临时密码更换，再保存全站配置。',
  invalid_ollama_url: '地址必须是无账号、查询参数或路径的 HTTP/HTTPS Ollama 根地址。',
  ollama_unreachable: '无法连接到 Ollama，请检查主机、端口和服务状态。',
  invalid_ollama_response: '目标地址没有返回有效的 Ollama 响应。',
  chat_model_missing: '聊天模型尚未安装在该 Ollama 服务中。',
  embedding_model_missing: 'Embedding 模型尚未安装在该 Ollama 服务中。',
  embedding_test_failed: 'Embedding 模型调用失败。',
  embedding_dimension_mismatch: 'Embedding 模型没有返回有效的向量维度。',
  env_not_writable: '服务器无法安全写入 .env，请检查文件权限。',
}
async function loadOllama() {
  try {
    const body = await api('/api/admin/runtime-config/ollama')
    ollama.value = body.config
    ollamaStatus.value = body.status
  } catch (reason) {
    ollamaError.value = reason instanceof Error ? reason.message : '配置加载失败'
  }
}
async function submitOllama(mode: 'test' | 'save') {
  ollamaBusy.value = mode
  ollamaError.value = ''
  ollamaMessage.value = ''
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 180_000)
  try {
    const path =
      mode === 'test' ? '/api/admin/runtime-config/ollama/test' : '/api/admin/runtime-config/ollama'
    const body = await api(path, {
      method: mode === 'test' ? 'POST' : 'PUT',
      body: JSON.stringify(ollama.value),
      signal: controller.signal,
    })
    ollamaStatus.value = {
      connected: true,
      models: body.check?.models || [],
      checkedAt: body.check?.checkedAt,
    }
    if (body.config) ollama.value = body.config
    ollamaMessage.value =
      mode === 'test'
        ? `连接正常，Embedding 为 ${body.check.embeddingDimensions} 维。`
        : '配置已写入 .env，新请求已立即切换。'
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : 'unknown'
    const aborted = reason instanceof DOMException && reason.name === 'AbortError'
    if (mode === 'save') {
      try {
        const current = await api('/api/admin/runtime-config/ollama')
        const saved =
          current.config?.baseUrl === ollama.value.baseUrl.replace(/\/$/, '') &&
          current.config?.embeddingModel === ollama.value.embeddingModel &&
          current.config?.chatModel === ollama.value.chatModel
        if (saved) {
          ollama.value = current.config
          ollamaStatus.value = current.status
          ollamaMessage.value = `服务器已保存配置，向量维度为 ${current.config.embeddingDimensions}。`
          return
        }
      } catch {
        // Keep the original actionable error when reconciliation is unavailable.
      }
    }
    ollamaError.value = aborted
      ? '保存超时，服务器可能仍在切换向量维度，请稍后刷新查看。'
      : ollamaErrors[code] || 'Ollama 配置操作失败。'
  } finally {
    window.clearTimeout(timeout)
    ollamaBusy.value = ''
  }
}
async function saveProfile() {
  await api('/api/me/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      grade: grade.value || null,
      subjects: subjects.value,
      defaultProviderId: providers.value.find((p) => p.isDefault)?.id || null,
      completeOnboarding: true,
    }),
  })
  notice.value = '学习档案已保存'
}
async function addProvider() {
  error.value = ''
  try {
    await api('/api/me/ai-providers', { method: 'POST', body: JSON.stringify(form.value) })
    form.value.apiKey = ''
    await load()
    notice.value = 'AI Provider 已安全保存'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}
async function makeDefault(id: string) {
  await api(`/api/me/ai-providers/${id}/default`, { method: 'POST', body: '{}' })
  await load()
}
async function remove(id: string) {
  if (!confirm('删除这个 AI Provider？历史对话仍会保留模型名称。')) return
  await api(`/api/me/ai-providers/${id}`, { method: 'DELETE' })
  await load()
}
async function changePassword() {
  await api('/api/me/password', { method: 'POST', body: JSON.stringify(password.value) })
  password.value = { currentPassword: '', newPassword: '' }
  notice.value = '密码已更新，其他设备已退出登录'
  await auth.refresh()
}
onMounted(load)
onBeforeUnmount(() => {
  if (missingIndexTimer) clearTimeout(missingIndexTimer)
})
</script>
<template>
  <main id="main-content" class="hs-main hs-page-main">
    <section class="hs-container hs-page-heading">
      <div>
        <p class="hs-kicker"><Settings :size="15" />个人设置</p>
        <h1>把学习站调整成适合你的样子</h1>
        <p>学习范围和模型配置只属于当前账号，API Key 加密保存且不会再次显示。</p>
      </div>
    </section>
    <div v-if="!auth.user" class="hs-container hs-empty-state">请先登录后管理设置。</div>
    <section v-else class="hs-container hs-settings-grid">
      <article class="hs-settings-card">
        <h2>学习档案</h2>
        <label
          >当前年级<select v-model="grade">
            <option value="">暂不设置</option>
            <option v-for="g in grades" :key="g.value" :value="g.value">{{ g.label }}</option>
          </select></label
        >
        <fieldset>
          <legend>重点学科</legend>
          <label v-for="s in subjectOptions" :key="s.value" class="hs-check"
            ><input v-model="subjects" type="checkbox" :value="s.value" />{{ s.label }}</label
          >
        </fieldset>
        <button class="hs-primary-button" @click="saveProfile">
          <Check :size="17" />保存学习档案
        </button>
      </article>
      <article class="hs-settings-card">
        <h2>AI Provider</h2>
        <ul class="hs-provider-list">
          <li v-for="p in providers" :key="p.id">
            <div>
              <strong>{{ p.name }} <span v-if="p.isDefault">默认</span></strong
              ><small>{{ p.model }} · {{ p.baseUrl }}</small>
            </div>
            <button v-if="!p.isDefault" aria-label="设为默认" @click="makeDefault(p.id)">
              <Star :size="16" /></button
            ><button aria-label="删除" @click="remove(p.id)"><Trash2 :size="16" /></button>
          </li>
        </ul>
        <form class="hs-provider-form" @submit.prevent="addProvider">
          <label>名称<input v-model.trim="form.name" required maxlength="40" /></label
          ><label
            >类型<select v-model="form.provider">
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">OpenAI 兼容接口</option>
            </select></label
          ><label>API 地址<input v-model.trim="form.baseUrl" type="url" required /></label
          ><label>模型<input v-model.trim="form.model" required /></label
          ><label
            >API Key<input
              v-model="form.apiKey"
              type="password"
              autocomplete="off"
              minlength="8"
              required
          /></label>
          <p v-if="error" class="hs-form-error">{{ error }}</p>
          <button class="hs-primary-button"><Plus :size="17" />添加 Provider</button>
        </form>
      </article>
      <article v-if="auth.user?.role === 'admin'" class="hs-settings-card hs-ollama-settings">
        <header class="hs-settings-card-head">
          <div>
            <h2><ServerCog :size="19" />全站 Ollama</h2>
            <p>修改全站默认的向量与聊天模型。保存前会验证模型和向量维度。</p>
          </div>
          <span :class="ollamaStatus?.connected ? 'is-online' : 'is-offline'"
            ><Activity :size="14" />{{ ollamaStatus?.connected ? '已连接' : '未连接' }}</span
          >
        </header>
        <form @submit.prevent="submitOllama('save')">
          <label
            >服务地址<input
              v-model.trim="ollama.baseUrl"
              type="url"
              required
              placeholder="http://127.0.0.1:11434"
          /></label>
          <div class="hs-ollama-models">
            <label
              >Embedding 模型<input
                v-model.trim="ollama.embeddingModel"
                required
                placeholder="bge-m3"
            /></label>
            <label
              >聊天模型<input v-model.trim="ollama.chatModel" required placeholder="qwen3:4b"
            /></label>
          </div>
          <p class="hs-settings-help">
            地址中包含主机和端口；系统会实测 Embedding
            并自动切换知识库维度。维度变化后旧资料需要重新生成向量。
          </p>
          <p v-if="ollamaError" class="hs-form-error" role="alert">{{ ollamaError }}</p>
          <p v-if="ollamaMessage" class="hs-settings-success" role="status">{{ ollamaMessage }}</p>
          <div class="hs-settings-actions">
            <button type="button" :disabled="!!ollamaBusy" @click="submitOllama('test')">
              <Activity :size="17" />{{ ollamaBusy === 'test' ? '检测中…' : '测试连接' }}
            </button>
            <button class="hs-primary-button" :disabled="!!ollamaBusy">
              <Save :size="17" />{{ ollamaBusy === 'save' ? '正在切换维度…' : '保存并生效' }}
            </button>
          </div>
        </form>
      </article>
      <article v-if="auth.user?.role === 'admin'" class="hs-settings-card hs-ollama-settings">
        <header class="hs-settings-card-head">
          <div>
            <h2><Database :size="19" />补充 RAG 索引</h2>
            <p>扫描资料目录，仅处理尚未生成有效文本切片的文件；已有 RAG 资料会直接跳过。</p>
          </div>
          <span><Activity :size="14" />{{ missingIndexRun?.status || '就绪' }}</span>
        </header>
        <div class="hs-missing-index">
          <label
            >资料域<select v-model="missingIndexDomain" :disabled="missingIndexBusy">
              <option value="high-school">高中</option>
              <option value="university">大学</option>
            </select></label
          >
          <div v-if="missingIndexRun" class="hs-missing-progress">
            <span
              >已扫描 {{ missingIndexRun.processed || 0 }} /
              {{ missingIndexRun.discovered || 0 }}</span
            ><strong>{{ missingIndexRun.progress || 0 }}%</strong>
          </div>
          <progress v-if="missingIndexRun" :value="missingIndexRun.progress || 0" max="100" />
          <p v-if="missingIndexRun?.summary?.currentFile" class="hs-settings-help">
            正在检查：{{ missingIndexRun.summary.currentFile }}
          </p>
          <button
            class="hs-primary-button"
            type="button"
            :disabled="
              missingIndexBusy || ['queued', 'running', 'paused'].includes(missingIndexRun?.status)
            "
            @click="indexMissingMaterials"
          >
            <RefreshCw :size="17" :class="{ 'is-spinning': missingIndexBusy }" />仅索引未纳入 RAG
            的文件
          </button>
          <p v-if="missingIndexMessage" class="hs-settings-success" role="status">
            {{ missingIndexMessage }}
          </p>
        </div>
      </article>
      <article class="hs-settings-card">
        <h2><KeyRound :size="19" />修改密码</h2>
        <form @submit.prevent="changePassword">
          <label
            >当前密码<input v-model="password.currentPassword" type="password" required /></label
          ><label
            >新密码<input
              v-model="password.newPassword"
              type="password"
              minlength="10"
              required /></label
          ><button class="hs-primary-button">更新密码</button>
        </form>
      </article>
      <p v-if="notice" class="hs-settings-notice" role="status">{{ notice }}</p>
    </section>
  </main>
</template>
