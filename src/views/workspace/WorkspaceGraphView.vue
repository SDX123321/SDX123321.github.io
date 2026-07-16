<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bookmark, Focus, Maximize2, Network, Search } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { useAuth } from '../../composables/useAuth'

const props = defineProps<{ domain?: any }>()
const route = useRoute(),
  auth = useAuth()
const stage = ref<HTMLElement | null>(null)
const graph = ref<any>(null),
  nodes = ref<any[]>([]),
  edges = ref<any[]>([]),
  selected = ref<any>(null)
const query = ref(''),
  relation = ref('all'),
  difficulty = ref('all'),
  localOnly = ref(false),
  error = ref('')
const subjectId = computed(() => String(route.params.subjectId || ''))
const relationNames: Record<string, string> = {
  prerequisite: '前置',
  part_of: '组成',
  related: '相关',
  derived_from: '推导',
  contrasts_with: '对比',
  applies_to: '应用',
}
const difficultyNames: Record<string, string> = {
  basic: '基础',
  intermediate: '中等',
  advanced: '提高',
}
let scene: any = null,
  resizeObserver: ResizeObserver | null = null

const visibleNodes = computed(() => {
  let list = nodes.value.filter(
    (n) =>
      (difficulty.value === 'all' || n.difficultyLevel === difficulty.value) &&
      (n.label + n.summary).toLowerCase().includes(query.value.toLowerCase()),
  )
  if (localOnly.value && selected.value) {
    const keys = new Set([selected.value.key])
    edges.value.forEach((e) => {
      const s = typeof e.source === 'object' ? e.source.key : e.source,
        t = typeof e.target === 'object' ? e.target.key : e.target
      if (s === selected.value.key) keys.add(t)
      if (t === selected.value.key) keys.add(s)
    })
    list = list.filter((n) => keys.has(n.key))
  }
  return list
})
const visibleKeys = computed(() => new Set(visibleNodes.value.map((n) => n.key)))
const visibleEdges = computed(() =>
  edges.value.filter((e) => {
    const s = typeof e.source === 'object' ? e.source.key : e.source,
      t = typeof e.target === 'object' ? e.target.key : e.target
    return (
      visibleKeys.value.has(s) &&
      visibleKeys.value.has(t) &&
      (relation.value === 'all' || e.relation === relation.value)
    )
  }),
)
const backlinks = computed(() =>
  selected.value
    ? edges.value.filter((e) => {
        const s = typeof e.source === 'object' ? e.source.key : e.source,
          t = typeof e.target === 'object' ? e.target.key : e.target
        return s === selected.value.key || t === selected.value.key
      })
    : [],
)

function nodeObject(node: any) {
  const group = new THREE.Group(),
    level = node.difficultyLevel || 'intermediate'
  const colors: Record<string, number> = {
    basic: 0x22a06b,
    intermediate: 0xe0a11b,
    advanced: 0xd64a4a,
  }
  const color = colors[level] || 0x4b78c2
  const size = 5 + Number(node.importance || 0) * 9
  const geometry =
    level === 'basic'
      ? new THREE.SphereGeometry(size, 20, 16)
      : level === 'advanced'
        ? new THREE.OctahedronGeometry(size)
        : new THREE.BoxGeometry(size * 1.55, size * 1.55, size * 1.55)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.18 }),
  )
  group.add(mesh)
  const mastery = Number(node.userState?.mastery || 0)
  if (mastery > 0) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(size * 1.25, 0.7, 8, 28),
      new THREE.MeshBasicMaterial({
        color: mastery >= 70 ? 0x36d399 : mastery >= 40 ? 0x60a5fa : 0x94a3b8,
        transparent: true,
        opacity: 0.9,
      }),
    )
    halo.rotation.x = Math.PI / 2
    group.add(halo)
  }
  return group
}
function renderGraph() {
  if (!stage.value) return
  if (!scene) {
    scene = new ForceGraph3D(stage.value)
      .backgroundColor('#10141d')
      .showNavInfo(false)
      .nodeId('key')
      .nodeLabel(
        (n: any) =>
          `${n.label} · ${difficultyNames[n.difficultyLevel] || '中等'} · 掌握 ${n.userState?.mastery || 0}%`,
      )
      .nodeThreeObject(nodeObject)
      .nodeVal((n: any) => 5 + n.importance * 12)
      .linkColor((e: any) => (e.relation === 'prerequisite' ? '#d97706' : '#94a3b8'))
      .linkOpacity(0.55)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .onEngineStop(() => scene?.zoomToFit(600, 90))
      .onNodeClick(focusNode)
    scene.d3Force('charge')?.strength(-180)
  }
  const graphNodes = visibleNodes.value.map((n) => ({
    ...n,
    fy: n.difficultyLevel === 'basic' ? -110 : n.difficultyLevel === 'advanced' ? 110 : 0,
  }))
  scene.graphData({
    nodes: graphNodes,
    links: visibleEdges.value.map((e) => ({
      ...e,
      source: typeof e.source === 'object' ? e.source.key : e.source,
      target: typeof e.target === 'object' ? e.target.key : e.target,
    })),
  })
  resize()
}
function resize() {
  if (stage.value && scene) scene.width(stage.value.clientWidth).height(stage.value.clientHeight)
}
function focusNode(node: any) {
  selected.value = nodes.value.find((n) => n.key === node.key) || node
  const distance = 100,
    ratio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1)
  scene.cameraPosition(
    { x: (node.x || 1) * ratio, y: (node.y || 1) * ratio, z: (node.z || 1) * ratio },
    node,
    900,
  )
}
function chooseNeighbor(edge: any) {
  const s = typeof edge.source === 'object' ? edge.source.key : edge.source,
    t = typeof edge.target === 'object' ? edge.target.key : edge.target
  const node = nodes.value.find((n) => n.key === (s === selected.value.key ? t : s))
  if (node) focusNode(node)
}
async function load() {
  if (!props.domain?.id) return
  error.value = ''
  const params = new URLSearchParams({ domainId: props.domain.id })
  if (subjectId.value) params.set('subjectId', subjectId.value)
  const response = await fetch(`/api/knowledge/graphs/current?${params}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    graph.value = null
    nodes.value = []
    error.value = response.status === 404 ? '该学科还没有已发布知识图谱。' : '图谱加载失败'
    return
  }
  const body = await response.json()
  graph.value = body.graph
  nodes.value = body.nodes || []
  edges.value = body.edges || []
  selected.value = nodes.value[0] || null
  await nextTick()
  renderGraph()
}
async function saveState() {
  if (!selected.value || !auth.user) return
  const state = selected.value.userState || {}
  await fetch(`/api/me/knowledge-nodes/${selected.value.id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mastery: state.mastery || 0,
      favorite: !!state.favorite,
      note: state.note || '',
    }),
  })
  renderGraph()
}
function toggleFavorite() {
  selected.value.userState = {
    ...(selected.value.userState || {}),
    favorite: !selected.value.userState?.favorite,
  }
  void saveState()
}
function fullscreen() {
  stage.value?.requestFullscreen()
}
watch(() => props.domain?.id, load)
watch(subjectId, load)
watch([visibleNodes, visibleEdges], () => nextTick(renderGraph))
onMounted(() => {
  load()
  resizeObserver = new ResizeObserver(resize)
  if (stage.value) resizeObserver.observe(stage.value)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  scene?._destructor?.()
  scene = null
})
</script>

<template>
  <main id="main-content" class="graph-workspace">
    <header class="graph-toolbar">
      <div>
        <p class="workspace-kicker"><Network :size="15" />三维共享规范图谱</p>
        <h1>{{ props.domain?.name || '学习' }}知识图谱</h1>
      </div>
      <label class="graph-search"
        ><Search :size="17" /><input
          v-model="query"
          type="search"
          placeholder="搜索知识点" /></label
      ><select v-model="difficulty" aria-label="难度">
        <option value="all">全部难度</option>
        <option value="basic">基础</option>
        <option value="intermediate">中等</option>
        <option value="advanced">提高</option></select
      ><select v-model="relation" aria-label="关系类型">
        <option value="all">全部关系</option>
        <option v-for="(name, key) in relationNames" :key="key" :value="key">
          {{ name }}
        </option></select
      ><button
        type="button"
        :class="{ active: localOnly }"
        title="仅看相邻节点"
        @click="localOnly = !localOnly"
      >
        <Focus :size="18" /></button
      ><button type="button" title="全屏" @click="fullscreen"><Maximize2 :size="18" /></button
      ><span v-if="graph">v{{ graph.version }} · {{ visibleNodes.length }}/{{ nodes.length }}</span>
    </header>
    <div v-if="error" class="graph-empty">
      <Network :size="34" />
      <h2>{{ error }}</h2>
      <p>管理员可生成并发布该学科的共享图谱。</p>
    </div>
    <div v-else class="graph-stage graph-stage-3d">
      <div
        ref="stage"
        class="graph-canvas graph-canvas-3d"
        aria-label="可旋转、缩放和拖动的三维知识网络"
      >
        <div class="graph-level-legend">
          <span data-level="basic">基础层</span><span data-level="intermediate">中等层</span
          ><span data-level="advanced">提高层</span>
        </div>
      </div>
      <aside v-if="selected" class="graph-inspector">
        <div class="graph-node-title">
          <div>
            <p class="workspace-kicker">
              {{ difficultyNames[selected.difficultyLevel] || '中等' }} · 难度
              {{ selected.difficultyScore || 50 }}
            </p>
            <h2>{{ selected.label }}</h2>
          </div>
          <button
            v-if="auth.user"
            type="button"
            :class="{ active: selected.userState?.favorite }"
            title="收藏"
            @click="toggleFavorite"
          >
            <Bookmark :size="18" />
          </button>
        </div>
        <p>{{ selected.summary }}</p>
        <p class="graph-difficulty-reason">{{ selected.difficultyReason }}</p>
        <div class="importance-score">
          <strong>{{ Math.round(selected.importance * 100) }}</strong
          ><span>综合重要性</span>
        </div>
        <dl>
          <div>
            <dt>资料覆盖</dt>
            <dd>{{ selected.metrics.documentFrequency }}</dd>
          </div>
          <div>
            <dt>出现次数</dt>
            <dd>{{ selected.metrics.occurrences }}</dd>
          </div>
          <div>
            <dt>题目频次</dt>
            <dd>{{ selected.metrics.questionFrequency }}</dd>
          </div>
          <div>
            <dt>图中心性</dt>
            <dd>{{ Math.round(selected.metrics.centrality * 100) }}%</dd>
          </div>
        </dl>
        <section>
          <h3>双向链接</h3>
          <button
            v-for="(edge, index) in backlinks"
            :key="index"
            type="button"
            @click="chooseNeighbor(edge)"
          >
            <span>{{ relationNames[edge.relation] || edge.relation }}</span
            >查看关联知识点
          </button>
        </section>
        <section>
          <h3>资料证据</h3>
          <article v-for="source in selected.sources" :key="source.chunkId || source.url">
            <a v-if="source.url" :href="source.url" target="_blank" rel="noreferrer">{{
              source.title || source.host
            }}</a>
            <p>{{ source.excerpt }}</p>
          </article>
        </section>
        <section v-if="auth.user" class="personal-layer">
          <h3>我的学习层</h3>
          <label
            >掌握度<input
              v-model.number="selected.userState.mastery"
              type="range"
              min="0"
              max="100"
              @change="saveState" /></label
          ><textarea
            v-model="selected.userState.note"
            rows="4"
            placeholder="写下只属于你的笔记"
            @blur="saveState"
          />
        </section>
      </aside>
    </div>
  </main>
</template>
