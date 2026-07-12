<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BookOpen,
  Box,
  Focus,
  Maximize2,
  Network,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { useAuth } from '../../composables/useAuth'

type Difficulty = 'basic' | 'intermediate' | 'advanced'
type GraphNode = {
  id: string
  key: string
  label: string
  chapter: string
  description: string
  sources: Array<{ chunkId?: string; fileName: string; excerpt: string }>
  difficulty: Difficulty
  importance: number
  mastery: number
  degree: number
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const stage = ref<HTMLElement | null>(null)
const graph = ref<any>(null)
const nodes = ref<GraphNode[]>([])
const edges = ref<any[]>([])
const selected = ref<GraphNode | null>(null)
const query = ref('')
const difficulty = ref<'all' | Difficulty>('all')
const relation = ref('all')
const run = ref<any>(null)
const error = ref('')
const rotating = ref(true)
const loading = ref(false)
const renderFailure = ref('')
const subject = computed(() => String(route.params.subject || 'math'))

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
const subjectName = computed(() => subjects.find(([key]) => key === subject.value)?.[1] || '学科')
const difficultyMeta: Record<Difficulty, { name: string; color: number; css: string; z: number }> =
  {
    basic: { name: '基础', color: 0x35c98f, css: '#35c98f', z: -150 },
    intermediate: { name: '中等', color: 0xf0b84b, css: '#f0b84b', z: 0 },
    advanced: { name: '提高', color: 0xf06f68, css: '#f06f68', z: 150 },
  }
const relationNames: Record<string, string> = {
  prerequisite: '先修',
  part_of: '组成',
  related: '相关',
  derived_from: '推导',
  contrasts_with: '对比',
  applies_to: '应用',
}

let forceGraph: any = null
let resizeObserver: ResizeObserver | null = null
let layerNodes: GraphNode[] = []

const visibleNodes = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return nodes.value.filter(
    (node) =>
      (difficulty.value === 'all' || node.difficulty === difficulty.value) &&
      (!needle ||
        `${node.label} ${node.chapter} ${node.description}`.toLowerCase().includes(needle)),
  )
})
const visibleKeys = computed(() => new Set(visibleNodes.value.map((node) => node.key)))
const visibleEdges = computed(() =>
  edges.value.filter((edge) => {
    const source = typeof edge.source === 'object' ? edge.source.key : edge.source
    const target = typeof edge.target === 'object' ? edge.target.key : edge.target
    return (
      visibleKeys.value.has(source) &&
      visibleKeys.value.has(target) &&
      (relation.value === 'all' || edge.relation === relation.value)
    )
  }),
)
const neighbors = computed(() => {
  if (!selected.value) return []
  return edges.value
    .filter((edge) => {
      const source = typeof edge.source === 'object' ? edge.source.key : edge.source
      const target = typeof edge.target === 'object' ? edge.target.key : edge.target
      return source === selected.value?.key || target === selected.value?.key
    })
    .map((edge) => {
      const source = typeof edge.source === 'object' ? edge.source.key : edge.source
      const target = typeof edge.target === 'object' ? edge.target.key : edge.target
      const key = source === selected.value?.key ? target : source
      return { edge, node: nodes.value.find((node) => node.key === key) }
    })
    .filter((item) => item.node)
})

function classifyDifficulty(
  index: number,
  total: number,
  label: string,
  description: string,
): Difficulty {
  const basicTerms =
    /集合与元素|命题与量词|函数概念|指数函数|对数函数|幂函数|三角函数$|平面向量|等差数列|等比数列|空间几何体/
  const advancedTerms =
    /导数研究|圆锥曲线|数列递推|空间线面|解三角形|排列组合|二项式定理|综合|证明|推导|探究|压轴|建模|迁移|拓展/
  if (basicTerms.test(label)) return 'basic'
  if (advancedTerms.test(`${label} ${description}`)) return 'advanced'
  const ratio = total <= 1 ? 0 : index / (total - 1)
  if (ratio > 0.78) return 'advanced'
  if (ratio > 0.34) return 'intermediate'
  return 'basic'
}

function enrichNodes(rawNodes: any[], rawEdges: any[]): GraphNode[] {
  const degrees = new Map<string, number>()
  rawEdges.forEach((edge) => {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1)
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1)
  })
  const maxDegree = Math.max(1, ...degrees.values())
  return rawNodes.map((node, index) => {
    const degree = degrees.get(node.key) || 0
    const difficulty = classifyDifficulty(
      index,
      rawNodes.length,
      node.label || '',
      node.description || '',
    )
    const angle = index * 2.399963
    const radius = 55 + Math.sqrt(index + 1) * 24
    return {
      ...node,
      difficulty,
      degree,
      importance: 0.28 + (degree / maxDegree) * 0.72,
      mastery: Number(node.mastery || 0),
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.72,
      z: difficultyMeta[difficulty].z + ((index % 5) - 2) * 8,
    }
  })
}

function makeLabel(node: GraphNode, size: number) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = 300 * ratio
  canvas.height = 62 * ratio
  context.scale(ratio, ratio)
  context.font = '600 15px system-ui, sans-serif'
  const textWidth = Math.min(246, context.measureText(node.label).width + 30)
  context.fillStyle = 'rgba(12, 20, 32, 0.88)'
  context.beginPath()
  context.roundRect((300 - textWidth) / 2, 8, textWidth, 36, 7)
  context.fill()
  context.strokeStyle = difficultyMeta[node.difficulty].css
  context.lineWidth = 1
  context.stroke()
  context.fillStyle = '#f7fafc'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(node.label.slice(0, 18), 150, 26, 230)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  sprite.scale.set(58, 12, 1)
  sprite.position.y = size + 12
  return sprite
}

function nodeObject(node: GraphNode) {
  const group = new THREE.Group()
  const meta = difficultyMeta[node.difficulty]
  const size = 4.8 + node.importance * 6.5
  const geometry =
    node.difficulty === 'basic'
      ? new THREE.SphereGeometry(size, 24, 18)
      : node.difficulty === 'intermediate'
        ? new THREE.IcosahedronGeometry(size, 1)
        : new THREE.OctahedronGeometry(size, 1)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: meta.color,
      emissive: meta.color,
      emissiveIntensity: selected.value?.key === node.key ? 0.4 : 0.12,
      roughness: 0.28,
      metalness: 0.22,
    }),
  )
  group.add(mesh)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.34, 0.45 + (node.mastery / 100) * 0.55, 10, 44),
    new THREE.MeshBasicMaterial({
      color: node.mastery >= 70 ? 0x7de8c3 : node.mastery >= 35 ? 0x7bb8ff : 0x57677d,
      transparent: true,
      opacity: node.mastery ? 0.9 : 0.42,
    }),
  )
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  group.add(makeLabel(node, size))
  return group
}

function layerForce(alpha: number) {
  for (const node of layerNodes) {
    const target = difficultyMeta[node.difficulty].z
    node.vz = (node.vz || 0) + (target - (node.z || 0)) * 0.018 * alpha
  }
}
;(layerForce as any).initialize = (simulationNodes: GraphNode[]) => {
  layerNodes = simulationNodes
}

function renderGraph() {
  if (!stage.value || !nodes.value.length) return
  try {
    renderFailure.value = ''
    if (!forceGraph) {
      forceGraph = new ForceGraph3D(stage.value)
        .numDimensions(3)
        .backgroundColor('#07101b')
        .showNavInfo(false)
        .nodeId('key')
        .nodeLabel(() => '')
        .nodeThreeObject((node: any) => nodeObject(node as GraphNode))
        .nodeThreeObjectExtend(false)
        .linkColor((edge: any) =>
          edge.relation === 'prerequisite'
            ? '#f0b84b'
            : edge.relation === 'contrasts_with'
              ? '#f06f68'
              : '#6f8daa',
        )
        .linkWidth((edge: any) => (edge.source?.key === selected.value?.key ? 1.8 : 0.8))
        .linkOpacity(0.48)
        .linkDirectionalArrowLength(4.5)
        .linkDirectionalArrowRelPos(0.92)
        .linkDirectionalParticles((edge: any) => (edge.relation === 'prerequisite' ? 2 : 0))
        .linkDirectionalParticleWidth(1.5)
        .linkDirectionalParticleSpeed(0.003)
        .onNodeClick((node: any) => focusNode(node as GraphNode))
        .onNodeHover((node: any) => {
          if (stage.value) stage.value.style.cursor = node ? 'pointer' : 'grab'
        })
        .onEngineStop(() => forceGraph?.zoomToFit(700, 80))
      forceGraph.d3Force('charge')?.strength(-230).distanceMax(420)
      forceGraph.d3Force('link')?.distance(75)
      forceGraph.d3Force('layer', layerForce)
      forceGraph.controls().autoRotate = true
      forceGraph.controls().autoRotateSpeed = 0.42
      forceGraph.controls().enableDamping = true
      forceGraph.controls().dampingFactor = 0.08
      forceGraph.cameraPosition({ x: 310, y: 180, z: 360 }, { x: 0, y: 0, z: 0 })
      const ambient = new THREE.AmbientLight(0xb8d8ff, 1.25)
      const key = new THREE.DirectionalLight(0xffffff, 1.8)
      key.position.set(180, 220, 260)
      forceGraph.scene().add(ambient, key)
    }
    forceGraph.graphData({
      nodes: visibleNodes.value.map((node) => ({ ...node })),
      links: visibleEdges.value.map((edge) => ({
        ...edge,
        source: typeof edge.source === 'object' ? edge.source.key : edge.source,
        target: typeof edge.target === 'object' ? edge.target.key : edge.target,
      })),
    })
    resize()
  } catch (cause) {
    renderFailure.value = cause instanceof Error ? cause.message : 'WebGL 初始化失败'
  }
}

function resize() {
  if (!stage.value || !forceGraph) return
  forceGraph.width(stage.value.clientWidth).height(stage.value.clientHeight)
}

function focusNode(node: GraphNode) {
  selected.value = nodes.value.find((item) => item.key === node.key) || node
  const distance = 115
  const length = Math.hypot(node.x || 1, node.y || 1, node.z || 1)
  const ratio = 1 + distance / Math.max(length, 1)
  forceGraph?.cameraPosition(
    { x: (node.x || 1) * ratio, y: (node.y || 1) * ratio, z: (node.z || 1) * ratio },
    node,
    850,
  )
}

function resetView() {
  forceGraph?.zoomToFit(800, 90)
}

function toggleRotation() {
  rotating.value = !rotating.value
  if (forceGraph) forceGraph.controls().autoRotate = rotating.value
}

async function fullscreen() {
  await stage.value?.requestFullscreen()
}

async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || '加载失败')
  return body
}

async function load() {
  graph.value = null
  nodes.value = []
  selected.value = null
  error.value = ''
  if (!auth.user) return
  loading.value = true
  try {
    const body = await api(`/api/me/knowledge-graphs?subject=${subject.value}`)
    const current = (body.graphs || []).find((item: any) => item.isCurrent) || body.graphs?.[0]
    if (!current) return
    const detail = await api(`/api/me/knowledge-graphs/${current.id}`)
    const legacyMathGraph =
      subject.value === 'math' &&
      (detail.nodes || []).some((node: any) => /学年|试题|阶段测试|月考/.test(node.label || ''))
    const migrationKey = `knowledge-graph-migrated:${current.id}`
    if (legacyMathGraph && !sessionStorage.getItem(migrationKey)) {
      sessionStorage.setItem(migrationKey, '1')
      graph.value = detail.graph
      await generate()
      return
    }
    graph.value = detail.graph
    edges.value = detail.edges || []
    nodes.value = enrichNodes(detail.nodes || [], edges.value)
    selected.value = nodes.value[0] || null
    await nextTick()
    renderGraph()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '图谱加载失败'
  } finally {
    loading.value = false
  }
}

async function generate() {
  error.value = ''
  try {
    run.value = await api('/api/me/knowledge-graphs', {
      method: 'POST',
      body: JSON.stringify({ subject: subject.value }),
    })
    void poll()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '生成失败'
  }
}

async function poll() {
  if (!run.value?.runId) return
  const result = await api(`/api/me/knowledge-graph-runs/${run.value.runId}`)
  run.value = { ...result, runId: result.id }
  if (['queued', 'running'].includes(result.status)) window.setTimeout(poll, 1200)
  else if (result.status === 'completed') await load()
  else
    error.value =
      result.error === 'insufficient_sources'
        ? '该学科已索引资料不足，暂时不能生成图谱。'
        : '图谱生成失败，请稍后重试。'
}

watch(subject, load)
watch(stage, (element) => {
  if (element && nodes.value.length) void nextTick(renderGraph)
})
watch(
  () => auth.user,
  (user, previous) => {
    if (user && !previous) void load()
  },
)
watch([visibleNodes, visibleEdges], () => nextTick(renderGraph))
watch(selected, () => {
  if (forceGraph)
    forceGraph
      .nodeThreeObject((node: any) => nodeObject(node as GraphNode))
      .linkWidth((edge: any) => {
        const source = typeof edge.source === 'object' ? edge.source.key : edge.source
        const target = typeof edge.target === 'object' ? edge.target.key : edge.target
        return source === selected.value?.key || target === selected.value?.key ? 2 : 0.8
      })
})

onMounted(() => {
  void load()
  resizeObserver = new ResizeObserver(resize)
  if (stage.value) resizeObserver.observe(stage.value)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  forceGraph?._destructor?.()
  forceGraph = null
})
</script>

<template>
  <main id="main-content" class="hs-kg-page">
    <header class="hs-kg-toolbar">
      <div class="hs-kg-title">
        <span class="hs-kg-mark"><Box :size="19" /></span>
        <div>
          <p>{{ subjectName }} · 三维知识网络</p>
          <h1>知识宇宙</h1>
        </div>
      </div>

      <label class="hs-kg-search">
        <Search :size="16" />
        <input v-model="query" type="search" placeholder="搜索知识点或章节" />
      </label>

      <select
        :value="subject"
        aria-label="选择学科"
        @change="
          router.push(`/high-school/knowledge-graph/${($event.target as HTMLSelectElement).value}`)
        "
      >
        <option v-for="item in subjects" :key="item[0]" :value="item[0]">{{ item[1] }}</option>
      </select>
      <select v-model="difficulty" aria-label="筛选难度">
        <option value="all">全部难度</option>
        <option value="basic">基础</option>
        <option value="intermediate">中等</option>
        <option value="advanced">提高</option>
      </select>
      <select v-model="relation" aria-label="筛选关系">
        <option value="all">全部关系</option>
        <option v-for="(name, key) in relationNames" :key="key" :value="key">{{ name }}</option>
      </select>

      <div class="hs-kg-tools">
        <button type="button" :title="rotating ? '暂停旋转' : '自动旋转'" @click="toggleRotation">
          <Pause v-if="rotating" :size="17" /><Play v-else :size="17" />
        </button>
        <button type="button" title="定位全部节点" @click="resetView"><Focus :size="17" /></button>
        <button type="button" title="全屏查看" @click="fullscreen"><Maximize2 :size="17" /></button>
      </div>

      <button
        v-if="auth.user"
        type="button"
        class="hs-kg-generate"
        :disabled="run && ['queued', 'running'].includes(run.status)"
        @click="generate"
      >
        <RefreshCw
          :size="16"
          :class="{ spinning: run && ['queued', 'running'].includes(run.status) }"
        />
        {{
          run && ['queued', 'running'].includes(run.status) ? `${run.progress || 0}%` : '重新生成'
        }}
      </button>
    </header>

    <div v-if="!auth.user" class="hs-kg-empty">
      <Network :size="34" />
      <h2>登录后探索你的学科知识网络</h2>
      <p>图谱会结合资料关系与个人学习状态生成。</p>
    </div>
    <div v-else-if="loading" class="hs-kg-empty">
      <Sparkles :size="30" />
      <h2>正在加载三维图谱</h2>
    </div>
    <div v-else-if="!graph" class="hs-kg-empty">
      <Network :size="36" />
      <h2>{{ error || `还没有${subjectName}知识图谱` }}</h2>
      <p>请先完成该学科资料索引，再生成知识网络。</p>
      <button type="button" @click="generate">生成图谱</button>
    </div>

    <section v-else class="hs-kg-stage">
      <div ref="stage" class="hs-kg-canvas" aria-label="可旋转、缩放和拖动的三维知识图谱">
        <div v-if="renderFailure" class="hs-kg-render-error">{{ renderFailure }}</div>
        <div class="hs-kg-depth" aria-hidden="true">
          <span><i data-level="basic"></i>基础层</span>
          <span><i data-level="intermediate"></i>中等层</span>
          <span><i data-level="advanced"></i>提高层</span>
        </div>
        <div class="hs-kg-hint" aria-hidden="true">拖动旋转 · 滚轮缩放 · 拖拽节点</div>
      </div>

      <aside v-if="selected" class="hs-kg-inspector">
        <div class="hs-kg-node-heading">
          <span :data-level="selected.difficulty">{{
            difficultyMeta[selected.difficulty].name
          }}</span>
          <small>重要性 {{ Math.round(selected.importance * 100) }}</small>
        </div>
        <h2>{{ selected.label }}</h2>
        <p class="hs-kg-chapter">{{ selected.chapter }}</p>
        <p class="hs-kg-summary">{{ selected.description }}</p>

        <div class="hs-kg-metrics">
          <div>
            <strong>{{ selected.degree }}</strong
            ><span>关联知识</span>
          </div>
          <div>
            <strong>{{ selected.sources?.length || 0 }}</strong
            ><span>资料证据</span>
          </div>
          <div>
            <strong>{{ selected.mastery }}%</strong><span>当前掌握</span>
          </div>
        </div>

        <section v-if="neighbors.length">
          <h3>双向链接</h3>
          <button
            v-for="item in neighbors"
            :key="item.node!.key"
            type="button"
            @click="focusNode(item.node!)"
          >
            <span>{{ relationNames[item.edge.relation] || '相关' }}</span>
            {{ item.node!.label }}
          </button>
        </section>

        <section v-if="selected.sources?.length">
          <h3><BookOpen :size="15" />资料证据</h3>
          <article
            v-for="source in selected.sources.slice(0, 4)"
            :key="source.chunkId || source.fileName"
          >
            <strong>{{ source.fileName }}</strong>
            <p>{{ source.excerpt }}</p>
          </article>
        </section>
      </aside>
    </section>
  </main>
</template>
