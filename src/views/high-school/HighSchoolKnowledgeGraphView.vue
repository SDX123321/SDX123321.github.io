<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BookOpen, Network, RefreshCw, Search, Sparkles } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
const route = useRoute(),
  router = useRouter(),
  auth = useAuth()
const subjects = [
  ['chinese', '语文'],
  ['math', '数学'],
  ['english', '英语'],
  ['physics', '物理'],
  ['chemistry', '化学'],
  ['biology', '生物'],
  ['politics', '政治'],
  ['history', '历史'],
  ['geography', '地理'],
]
const subject = computed(() => String(route.params.subject || 'math'))
const graphs = ref<any[]>([]),
  graph = ref<any>(null),
  nodes = ref<any[]>([]),
  edges = ref<any[]>([]),
  selected = ref<any>(null),
  query = ref(''),
  run = ref<any>(null),
  error = ref('')
const filtered = computed(() =>
  nodes.value.filter((n) =>
    (n.label + n.chapter + n.description).toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const chapters = computed(() => [...new Set(filtered.value.map((n) => n.chapter))])
async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const r = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b.error || '加载失败')
  return b
}
async function load() {
  graph.value = null
  nodes.value = []
  selected.value = null
  if (!auth.user) return
  const b = await api(`/api/me/knowledge-graphs?subject=${subject.value}`)
  graphs.value = b.graphs || []
  const current = graphs.value.find((g) => g.isCurrent) || graphs.value[0]
  if (current) {
    const d = await api(`/api/me/knowledge-graphs/${current.id}`)
    graph.value = d.graph
    nodes.value = d.nodes || []
    edges.value = d.edges || []
    selected.value = nodes.value[0] || null
  }
}
async function generate() {
  error.value = ''
  try {
    run.value = await api('/api/me/knowledge-graphs', {
      method: 'POST',
      body: JSON.stringify({ subject: subject.value }),
    })
    poll()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败'
  }
}
async function poll() {
  if (!run.value?.runId) return
  const r = await api(`/api/me/knowledge-graph-runs/${run.value.runId}`)
  run.value = { ...r, runId: r.id }
  if (['queued', 'running'].includes(r.status)) setTimeout(poll, 1200)
  else if (r.status === 'completed') load()
  else
    error.value =
      r.error === 'insufficient_sources'
        ? '该学科已索引资料不足，暂时不能生成图谱。'
        : '图谱生成失败，请稍后重试。'
}
watch(subject, load)
onMounted(load)
</script>
<template>
  <main id="main-content" class="hs-main hs-page-main">
    <section class="hs-container hs-page-heading hs-graph-heading">
      <div>
        <p class="hs-kicker"><Network :size="15" />RAG 学科图谱</p>
        <h1>从资料出发，串起一门学科</h1>
        <p>每个知识节点都保留原始资料依据；没有证据的内容不会进入图谱。</p>
      </div>
      <button
        v-if="auth.user"
        class="hs-primary-button"
        :disabled="run && ['queued', 'running'].includes(run.status)"
        @click="generate"
      >
        <RefreshCw :size="17" />{{
          run && ['queued', 'running'].includes(run.status)
            ? `生成中 ${run.progress || 0}%`
            : graph
              ? '生成新版本'
              : '生成图谱'
        }}
      </button>
    </section>
    <section class="hs-container hs-graph-toolbar">
      <label
        >学科<select
          :value="subject"
          @change="
            router.push(
              `/high-school/knowledge-graph/${($event.target as HTMLSelectElement).value}`,
            )
          "
        >
          <option v-for="s in subjects" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
        </select></label
      ><label
        ><Search :size="16" /><span class="sr-only">搜索知识点</span
        ><input v-model="query" placeholder="搜索知识点、章节或内容" /></label
      ><span v-if="graph"
        >第 {{ graph.version }} 版 · {{ nodes.length }} 个节点 · {{ edges.length }} 条关系</span
      >
    </section>
    <p v-if="error" class="hs-container hs-form-error">{{ error }}</p>
    <div v-if="!auth.user" class="hs-container hs-empty-state">
      登录后可生成并保存你的学科知识图谱。
    </div>
    <div v-else-if="!graph" class="hs-container hs-empty-state">
      <Sparkles :size="28" />
      <h2>还没有这门学科的图谱</h2>
      <p>生成前请确认资料库中已有该学科的已索引资料。</p>
    </div>
    <section v-else class="hs-container hs-graph-layout">
      <div class="hs-graph-canvas" role="tree" aria-label="学科知识图谱">
        <section v-for="chapter in chapters" :key="chapter">
          <h2>{{ chapter }}</h2>
          <div>
            <button
              v-for="node in filtered.filter((n) => n.chapter === chapter)"
              :key="node.id"
              role="treeitem"
              :aria-selected="selected?.id === node.id"
              @click="selected = node"
            >
              <span></span><strong>{{ node.label }}</strong
              ><small>{{ node.description }}</small>
            </button>
          </div>
        </section>
      </div>
      <aside v-if="selected" class="hs-graph-detail">
        <p class="hs-kicker"><BookOpen :size="14" />知识点详情</p>
        <h2>{{ selected.label }}</h2>
        <p>{{ selected.description }}</p>
        <h3>资料依据</h3>
        <ol>
          <li v-for="s in selected.sources" :key="s.chunkId">
            <strong>{{ s.fileName }}</strong>
            <p>{{ s.excerpt }}</p>
          </li>
        </ol>
      </aside>
    </section>
  </main>
</template>
