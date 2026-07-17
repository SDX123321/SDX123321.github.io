<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Activity,
  Bot,
  CircleAlert,
  Database,
  FileUp,
  Globe2,
  RefreshCw,
  ShieldAlert,
  Users,
  WandSparkles,
} from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

const auth = useAuth()
const overview = ref<any>(null)
const accounts = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const uploadBusy = ref(false)
const uploadMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const subject = ref('other')
const grade = ref('other')
const indexRun = ref<any>(null)
const indexBusy = ref(false)
const indexMessage = ref('')
const indexDomain = ref('high-school')
const domains = ref<any[]>([])
const knowledgeSubject = ref('math')
const knowledgeBusy = ref(false)
const knowledgeMessage = ref('')
const researchRun = ref<any>(null)
let indexPoll: ReturnType<typeof setTimeout> | undefined

const indexRunning = computed(() =>
  ['queued', 'running', 'paused'].includes(indexRun.value?.status),
)
const indexProgress = computed(() => Number(indexRun.value?.progress || 0))

async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const response = await fetch(path, { ...init, credentials: 'include' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ limit: '50' })
    if (search.value.trim()) params.set('q', search.value.trim())
    const [summary, accountBody] = await Promise.all([
      api('/api/admin/overview'),
      api(`/api/admin/accounts?${params}`),
    ])
    overview.value = summary
    accounts.value = accountBody.accounts || []
    if (!domains.value.length) {
      const domainBody = await api('/api/domains')
      domains.value = domainBody.domains || []
    }
    const latest = summary.lastIndexRun
    if (latest?.id && (!indexRun.value || indexRun.value.id !== latest.id)) {
      indexRun.value = latest
      void pollIndexRun(latest.id)
    }
  } catch (reason) {
    error.value =
      reason instanceof Error && reason.message === 'forbidden'
        ? '当前账号没有管理员权限'
        : reason instanceof Error
          ? reason.message
          : '管理数据加载失败'
  } finally {
    loading.value = false
  }
}

async function generateSuggestions() {
  if (knowledgeBusy.value) return
  knowledgeBusy.value = true
  knowledgeMessage.value = ''
  try {
    await api('/api/admin/knowledge/suggested-question-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: knowledgeSubject.value }),
    })
    knowledgeMessage.value = '推荐问题生成任务已启动。'
  } catch (reason) {
    knowledgeMessage.value = reason instanceof Error ? reason.message : '任务启动失败'
  } finally {
    knowledgeBusy.value = false
  }
}

async function startResearch() {
  if (knowledgeBusy.value) return
  const domain = domains.value.find((item) => item.key === indexDomain.value)
  if (!domain) return
  knowledgeBusy.value = true
  knowledgeMessage.value = ''
  try {
    researchRun.value = await api('/api/admin/knowledge/web-research-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domainId: domain.id, subject: knowledgeSubject.value }),
    })
    pollResearch(researchRun.value.runId)
  } catch (reason) {
    knowledgeMessage.value = reason instanceof Error ? reason.message : '研究任务启动失败'
    knowledgeBusy.value = false
  }
}

async function pollResearch(id: string) {
  researchRun.value = await api(`/api/admin/knowledge/web-research-runs/${id}`)
  if (['queued', 'running'].includes(researchRun.value.status))
    setTimeout(() => void pollResearch(id), 1200)
  else {
    knowledgeBusy.value = false
    knowledgeMessage.value =
      researchRun.value.status === 'completed'
        ? `研究完成，收集 ${researchRun.value.evidenceCount} 条证据。`
        : researchRun.value.error || '研究失败'
  }
}

async function upload() {
  const file = fileInput.value?.files?.[0]
  if (!file || uploadBusy.value) return
  uploadBusy.value = true
  uploadMessage.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('subject', subject.value)
    form.append('grade', grade.value)
    const body = await api('/api/admin/materials/upload', { method: 'POST', body: form })
    uploadMessage.value = `${body.upload.fileName} 已进入自动索引队列`
    if (fileInput.value) fileInput.value.value = ''
    await load()
  } catch (reason) {
    uploadMessage.value = reason instanceof Error ? reason.message : '上传失败'
  } finally {
    uploadBusy.value = false
  }
}

function scheduleIndexPoll(id: string) {
  if (indexPoll) clearTimeout(indexPoll)
  indexPoll = setTimeout(() => void pollIndexRun(id), 1000)
}

async function pollIndexRun(id: string) {
  try {
    indexRun.value = await api(`/api/admin/knowledge/index-runs/${id}`)
    if (indexRunning.value) scheduleIndexPoll(id)
    else {
      indexBusy.value = false
      indexMessage.value =
        indexRun.value.status === 'completed'
          ? 'RAG 索引重建完成。'
          : 'RAG 索引重建失败，请检查任务详情。'
      await load()
    }
  } catch (reason) {
    indexBusy.value = false
    indexMessage.value = reason instanceof Error ? reason.message : '无法读取索引进度'
  }
}

async function rebuildIndex() {
  if (indexBusy.value || indexRunning.value) return
  const domainName = indexDomain.value === 'university' ? '大学' : '高中'
  if (
    !window.confirm(
      `重新生成全部${domainName}资料的 Embedding 索引？任务运行期间仍可使用现有资料。`,
    )
  )
    return
  indexBusy.value = true
  indexMessage.value = ''
  try {
    const body = await api('/api/admin/knowledge/index-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: indexDomain.value, rebuild: true }),
    })
    indexRun.value = {
      ...body,
      progress: 0,
      discovered: 0,
      processed: 0,
      embedded: 0,
      failed: 0,
      remaining: 0,
    }
    scheduleIndexPoll(body.id)
  } catch (reason) {
    indexBusy.value = false
    indexMessage.value =
      reason instanceof Error && reason.message === 'index_already_running'
        ? '已有索引任务正在运行，请稍后刷新。'
        : reason instanceof Error
          ? reason.message
          : '无法启动索引任务'
  }
}

async function controlIndex(action: 'pause' | 'resume' | 'cancel' | 'rollback') {
  if (!indexRun.value?.id) return
  await api(`/api/admin/knowledge/index-runs/${indexRun.value.id}/${action}`, { method: 'POST' })
  await pollIndexRun(indexRun.value.id)
}

async function risk(account: any, action: string) {
  if (!window.confirm(`确认对账号“${account.username}”执行此操作？`)) return
  await api(`/api/admin/accounts/${account.id}/risk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, reason: '管理员面板操作' }),
  })
  await load()
}

onMounted(load)
onBeforeUnmount(() => {
  if (indexPoll) clearTimeout(indexPoll)
})
watch(
  () => auth.user?.id,
  (id, previous) => {
    if (id && id !== previous) void load()
  },
)
</script>

<template>
  <main id="main-content" class="hs-main hs-page-main hs-admin-page">
    <section class="hs-container hs-page-heading hs-admin-heading">
      <div>
        <p class="hs-kicker"><ShieldAlert :size="15" />账户、资料与模型运行控制台</p>
        <h1>管理后台</h1>
        <p>查看账户使用情况、处理风险账号，并将新资料直接上传到 RAG 索引队列。</p>
      </div>
      <button type="button" class="hs-admin-refresh" :disabled="loading" @click="load">
        <RefreshCw :size="17" />刷新数据
      </button>
    </section>

    <section v-if="error" class="hs-container hs-admin-error" role="alert">
      <CircleAlert :size="20" />{{ error }}
    </section>

    <template v-else>
      <section class="hs-container hs-admin-kpis" aria-label="运行概览">
        <article>
          <Users :size="21" /><span>账户总数</span><strong>{{ overview?.accounts ?? '—' }}</strong>
        </article>
        <article>
          <Activity :size="21" /><span>今日活跃</span
          ><strong>{{ overview?.activeToday ?? '—' }}</strong>
        </article>
        <article>
          <Bot :size="21" /><span>今日 AI 调用</span
          ><strong>{{ overview?.aiToday?.calls ?? '—' }}</strong>
        </article>
        <article class="is-risk">
          <ShieldAlert :size="21" /><span>受限账号</span
          ><strong>{{ overview?.suspended ?? '—' }}</strong>
        </article>
      </section>

      <section class="hs-container hs-admin-grid">
        <article class="hs-admin-card hs-index-card">
          <header>
            <Globe2 :size="20" />
            <div>
              <h2>网页知识研究</h2>
              <p>使用受控浏览器从权威来源提炼学科知识与关系。</p>
            </div>
          </header>
          <div class="hs-index-control">
            <label class="hs-index-domain"
              >学科<select v-model="knowledgeSubject" :disabled="knowledgeBusy">
                <option value="math">数学</option>
                <option value="physics">物理</option>
                <option value="chemistry">化学</option>
                <option value="biology">生物</option>
                <option value="chinese">语文</option>
                <option value="english">英语</option>
                <option value="history">历史</option>
                <option value="geography">地理</option>
                <option value="politics">思想政治</option>
              </select></label
            >
            <div v-if="researchRun" class="hs-index-status">
              <span>浏览研究 {{ researchRun.status }}</span
              ><strong>{{ researchRun.progress || 0 }}%</strong>
            </div>
            <progress v-if="researchRun" :value="researchRun.progress || 0" max="100" />
            <button type="button" :disabled="knowledgeBusy" @click="startResearch">
              <Globe2 :size="16" />搜索并提炼知识点
            </button>
            <button type="button" :disabled="knowledgeBusy" @click="generateSuggestions">
              <WandSparkles :size="16" />生成推荐问题池
            </button>
            <p v-if="knowledgeMessage" class="hs-index-message" aria-live="polite">
              {{ knowledgeMessage }}
            </p>
          </div>
        </article>
        <article class="hs-admin-card hs-index-card">
          <header>
            <Database :size="20" />
            <div>
              <h2>重建 RAG 索引</h2>
              <p>使用当前 Ollama Embedding 模型重新生成指定资料域的全部向量。</p>
            </div>
          </header>
          <div class="hs-index-control">
            <label class="hs-index-domain"
              >资料域
              <select v-model="indexDomain" :disabled="indexBusy || indexRunning">
                <option value="high-school">高中</option>
                <option value="university">大学</option>
              </select>
            </label>
            <div class="hs-index-status">
              <span>{{
                indexRunning
                  ? '正在重建'
                  : indexRun?.status === 'completed'
                    ? '最近任务已完成'
                    : '准备就绪'
              }}</span>
              <strong>{{ indexProgress }}%</strong>
            </div>
            <progress
              :value="indexProgress"
              max="100"
              :aria-label="`RAG 索引重建进度 ${indexProgress}%`"
            />
            <dl v-if="indexRun">
              <div>
                <dt>已处理</dt>
                <dd>{{ indexRun.processed || 0 }} / {{ indexRun.discovered || 0 }}</dd>
              </div>
              <div>
                <dt>已嵌入</dt>
                <dd>{{ indexRun.embedded || 0 }}</dd>
              </div>
              <div>
                <dt>剩余</dt>
                <dd>{{ indexRun.remaining || 0 }}</dd>
              </div>
              <div>
                <dt>失败</dt>
                <dd>{{ indexRun.failed || 0 }}</dd>
              </div>
            </dl>
            <p v-if="indexRun?.summary?.currentFile" class="hs-index-file">
              正在处理：{{ indexRun.summary.currentFile }}
            </p>
            <button type="button" :disabled="indexBusy || indexRunning" @click="rebuildIndex">
              <RefreshCw :size="16" :class="{ 'is-spinning': indexRunning }" />
              {{ indexRunning ? '正在重建索引' : '重新生成索引' }}
            </button>
            <div v-if="indexRun?.id" class="hs-index-actions">
              <button
                v-if="indexRun.status === 'running'"
                type="button"
                @click="controlIndex('pause')"
              >
                暂停
              </button>
              <button
                v-if="indexRun.status === 'paused'"
                type="button"
                @click="controlIndex('resume')"
              >
                继续
              </button>
              <button
                v-if="['running', 'paused', 'queued'].includes(indexRun.status)"
                type="button"
                @click="controlIndex('cancel')"
              >
                取消
              </button>
              <button
                v-if="indexRun.status === 'completed'"
                type="button"
                @click="controlIndex('rollback')"
              >
                回滚上一版
              </button>
            </div>
            <p v-if="indexMessage" class="hs-index-message" aria-live="polite">
              {{ indexMessage }}
            </p>
          </div>
        </article>

        <article class="hs-admin-card hs-upload-card">
          <header>
            <FileUp :size="20" />
            <div>
              <h2>上传并自动索引</h2>
              <p>支持 DOC、DOCX、PDF、图片、音频与 ZIP，单文件最大 50 MB。</p>
            </div>
          </header>
          <form @submit.prevent="upload">
            <label>资料文件<input ref="fileInput" type="file" required /></label>
            <div>
              <label
                >学科<select v-model="subject">
                  <option value="other">自动识别</option>
                  <option value="math">数学</option>
                  <option value="chinese">语文</option>
                  <option value="english">英语</option>
                  <option value="physics">物理</option>
                  <option value="chemistry">化学</option>
                  <option value="biology">生物</option>
                  <option value="history">历史</option>
                  <option value="geography">地理</option>
                  <option value="politics">政治</option>
                </select></label
              ><label
                >年级<select v-model="grade">
                  <option value="other">自动识别</option>
                  <option value="grade-1">高一</option>
                  <option value="grade-2">高二</option>
                  <option value="grade-3">高三</option>
                </select></label
              >
            </div>
            <button type="submit" :disabled="uploadBusy">
              {{ uploadBusy ? '正在上传…' : '上传并索引' }}
            </button>
            <p v-if="uploadMessage" aria-live="polite">{{ uploadMessage }}</p>
          </form>
        </article>

        <article class="hs-admin-card">
          <header>
            <Activity :size="20" />
            <div>
              <h2>最近上传</h2>
              <p>索引状态会在后台任务结束后更新。</p>
            </div>
          </header>
          <ul class="hs-admin-uploads">
            <li v-for="item in overview?.uploads || []" :key="item.id">
              <div>
                <strong>{{ item.fileName }}</strong
                ><small>{{ (item.sizeBytes / 1024 / 1024).toFixed(1) }} MB</small>
              </div>
              <span :data-status="item.status">{{ item.status }}</span>
            </li>
            <li v-if="!overview?.uploads?.length" class="is-empty">暂无后台上传记录</li>
          </ul>
        </article>
      </section>

      <section class="hs-container hs-admin-card hs-account-card">
        <header>
          <Users :size="20" />
          <div>
            <h2>账户用量与风控</h2>
            <p>暂停账号会立即撤销其全部登录会话。</p>
          </div>
          <form class="hs-admin-search" @submit.prevent="load">
            <label class="sr-only" for="admin-account-search">搜索账号</label
            ><input
              id="admin-account-search"
              v-model.trim="search"
              placeholder="搜索用户名"
            /><button type="submit">查询</button>
          </form>
        </header>
        <div class="hs-admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>账号</th>
                <th>状态</th>
                <th>学习时长</th>
                <th>练习</th>
                <th>AI 调用</th>
                <th>会话</th>
                <th>最近登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in accounts" :key="account.id">
                <td>
                  <strong>{{ account.username }}</strong
                  ><small>{{ account.role }}</small>
                </td>
                <td>
                  <span class="hs-risk-badge" :data-risk="account.riskStatus">{{
                    account.riskStatus
                  }}</span>
                </td>
                <td>{{ Math.round(account.studySeconds / 60) }} 分钟</td>
                <td>{{ account.practiceCount }}</td>
                <td>{{ account.aiCalls }}</td>
                <td>{{ account.activeSessions }}</td>
                <td>
                  {{
                    account.lastLoginAt
                      ? new Date(account.lastLoginAt).toLocaleString()
                      : '从未登录'
                  }}
                </td>
                <td>
                  <div class="hs-admin-actions">
                    <button
                      v-if="account.riskStatus === 'active'"
                      type="button"
                      @click="risk(account, 'suspend')"
                    >
                      暂停</button
                    ><button v-else type="button" @click="risk(account, 'activate')">恢复</button
                    ><button type="button" @click="risk(account, 'revoke_sessions')">下线</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>
