<script setup lang="ts">
/**
 * FormulaRefFAB — 替代 React 的 features/formula-ref/FormulaRefFAB.jsx
 * 浮动公式速查弹窗，支持按学科和关键词搜索。
 */
import { ref, computed } from 'vue'

interface Formula {
  s: string
  n: string
  f: string
}

const FORMULAS: Record<string, Formula[]> = {
  probability: [
    { s: '基本概率', n: '条件概率', f: 'P(A|B) = P(AB) / P(B)' },
    { s: '基本概率', n: '乘法公式', f: 'P(AB) = P(A)·P(B|A) = P(B)·P(A|B)' },
    { s: '基本概率', n: '加法公式', f: 'P(A∪B) = P(A) + P(B) − P(AB)' },
    { s: '基本概率', n: '全概率公式', f: 'P(B) = Σ P(Aᵢ)·P(B|Aᵢ)' },
    { s: '基本概率', n: '贝叶斯公式', f: 'P(Aᵢ|B) = P(Aᵢ)P(B|Aᵢ) / ΣP(Aⱼ)P(B|Aⱼ)' },
    { s: '基本概率', n: '独立性', f: 'P(AB) = P(A)·P(B)；三事件独立需 4 个等式' },
    { s: '数字特征', n: '期望(离散)', f: 'E(X) = Σ xₖ·pₖ' },
    { s: '数字特征', n: '期望(连续)', f: 'E(X) = ∫ x·f(x) dx' },
    { s: '数字特征', n: '方差', f: 'D(X) = E(X²) − [E(X)]²' },
    { s: '数字特征', n: '协方差', f: 'Cov(X,Y) = E(XY) − E(X)E(Y)' },
    { s: '数字特征', n: '相关系数', f: 'ρ = Cov(X,Y) / √[D(X)·D(Y)]；|ρ| ≤ 1' },
    { s: '离散分布', n: '二项分布 B(n,p)', f: 'P(X=k)=C(n,k)pᵏ(1−p)ⁿ⁻ᵏ；E=np, D=np(1−p)' },
    { s: '离散分布', n: '泊松分布 π(λ)', f: 'P(X=k)=λᵏe⁻ᵏ/k!；E=λ, D=λ' },
    { s: '连续分布', n: '均匀分布 U(a,b)', f: 'E=(a+b)/2, D=(b−a)²/12' },
    { s: '连续分布', n: '指数分布 Exp(λ)', f: 'E=1/λ, D=1/λ²' },
    { s: '连续分布', n: '正态 N(μ,σ²)', f: 'Z=(X−μ)/σ ~ N(0,1)' },
    { s: '连续分布', n: 'χ² 分布', f: 'Xᵢ~N(0,1) ⟹ ΣXᵢ² ~ χ²(n)；E=n' },
    { s: '连续分布', n: 't 分布', f: 'Z/√(V/n) ~ t(n)，Z~N(0,1), V~χ²(n)' },
    { s: '极限定理', n: '切比雪夫不等式', f: 'P(|X−μ|≥ε) ≤ D(X)/ε²' },
    { s: '极限定理', n: '中心极限定理', f: 'n大时 ΣXᵢ ~ 近似N(nμ, nσ²)' },
    { s: '参数估计', n: '矩估计', f: '令 E(Xᵏ) = (1/n)ΣXᵢᵏ，解出 θ' },
    { s: '参数估计', n: '极大似然 MLE', f: 'L(θ)=Πf(xᵢ;θ)，取对数后对 θ 求导=0' },
    { s: '参数估计', n: '样本方差', f: 'S² = (1/(n−1))Σ(Xᵢ−X̄)²' },
    { s: '置信区间', n: 'μ（σ已知）', f: 'X̄ ± z_{α/2}·σ/√n' },
    { s: '置信区间', n: 'μ（σ未知）', f: 'X̄ ± t_{α/2}(n−1)·S/√n' },
    { s: '假设检验', n: 'Z 检验', f: 'Z = (X̄−μ₀)/(σ/√n)；拒绝域 |Z|>z_{α/2}' },
    { s: '假设检验', n: 'T 检验', f: 'T = (X̄−μ₀)/(S/√n)；拒绝域 |T|>t_{α/2}(n−1)' },
  ],
  dsp: [
    { s: '变换', n: 'DTFT', f: 'X(eʲω) = Σ x(n)e⁻ʲωⁿ' },
    { s: '变换', n: 'DFT', f: 'X(k) = Σ x(n)W_N^(kn)' },
    { s: '变换', n: 'Z 变换', f: 'X(z) = Σ x(n)z⁻ⁿ' },
    { s: '变换', n: '双线性变换', f: 's = (2/T)·(1−z⁻¹)/(1+z⁻¹)' },
  ],
  calculus: [
    { s: '积分', n: '全微分', f: 'dz = (∂z/∂x)dx + (∂z/∂y)dy' },
    { s: '积分', n: '格林公式', f: '∮(Pdx+Qdy) = ∬(∂Q/∂x−∂P/∂y)dxdy' },
    { s: '积分', n: '高斯公式', f: '∯F·dS = ∬∫∇·F dV' },
    { s: '积分', n: '柯西积分', f: '∮f(z)/(z−z₀)dz = 2πi·f(z₀)' },
  ],
}
const LABELS: Record<string, string> = { probability: '概率论', dsp: 'DSP', calculus: '高数' }

const open = ref(false)
const subject = ref('probability')
const search = ref('')
const expanded = ref<Record<string, boolean>>({})

const formulas = computed(() => FORMULAS[subject.value] || [])
const filtered = computed(() =>
  search.value
    ? formulas.value.filter(
        (f) =>
          f.n.includes(search.value) || f.f.includes(search.value) || f.s.includes(search.value),
      )
    : formulas.value,
)
const sections = computed(() => {
  const map: Record<string, Formula[]> = {}
  filtered.value.forEach((f) => {
    const k = f.s || '其他'
    if (!map[k]) map[k] = []
    map[k].push(f)
  })
  return map
})

function setSubject(s: string) {
  subject.value = s
  search.value = ''
  expanded.value = {}
}
function toggle(s: string) {
  expanded.value = { ...expanded.value, [s]: !expanded.value[s] }
}
function isSectionOpen(s: string) {
  return expanded.value[s] !== false
}
function expandAll() {
  const r: Record<string, boolean> = {}
  Object.keys(sections.value).forEach((s) => {
    r[s] = true
  })
  expanded.value = r
}
function collapseAll() {
  expanded.value = {}
}
</script>

<template>
  <!-- FAB -->
  <button class="fr-fab" title="公式速查" @click="open = !open">∑</button>

  <Teleport to="body">
    <div v-if="open" class="fr-overlay" @click.self="open = false">
      <div class="fr-panel">
        <button class="fr-close" @click="open = false">&times;</button>
        <h3 class="fr-title">
          ∑ 公式速查
          <span class="fr-count">{{ filtered.length }} 条</span>
        </h3>

        <!-- 学科切换 -->
        <div class="fr-tabs">
          <button
            v-for="k in Object.keys(FORMULAS)"
            :key="k"
            :class="['fr-tab', { active: subject === k }]"
            @click="setSubject(k)"
          >
            {{ LABELS[k] }}
          </button>
          <span v-if="subject === 'probability'" class="fr-expand-btns">
            <button class="fr-small-btn" @click="expandAll">全部展开</button>
            <button class="fr-small-btn" @click="collapseAll">全部折叠</button>
          </span>
        </div>

        <!-- 搜索框 -->
        <input v-model="search" class="fr-search" placeholder="搜索公式名称或内容…" />

        <!-- 公式列表 -->
        <div v-for="(items, section) in sections" :key="section" class="fr-section">
          <button class="fr-section-header" @click="toggle(section as string)">
            <span
              class="fr-arrow"
              :style="{ transform: isSectionOpen(section as string) ? 'rotate(90deg)' : 'none' }"
              >▸</span
            >
            {{ section }}
            <span class="fr-section-count">{{ items.length }} 条</span>
          </button>
          <div v-if="isSectionOpen(section as string)" class="fr-items">
            <div v-for="(f, i) in items" :key="i" :class="['fr-item', { alt: i % 2 !== 0 }]">
              <span class="fr-name">{{ f.n }}</span>
              <span class="fr-formula">{{ f.f }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fr-fab {
  position: fixed;
  bottom: 250px;
  right: 30px;
  z-index: 98;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card2, #22263a);
  color: var(--text);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 1.2em;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}
.fr-fab:hover {
  transform: scale(1.1);
}
.fr-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fr-panel {
  background: var(--card, #1a1d27);
  border-radius: 16px;
  padding: 20px 24px;
  max-width: 640px;
  width: 94vw;
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  position: relative;
}
.fr-close {
  position: absolute;
  top: 10px;
  right: 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.3rem;
  color: var(--text3);
}
.fr-title {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: var(--accent2, #a29bfe);
}
.fr-count {
  font-size: 0.72rem;
  color: var(--text3);
  font-weight: 400;
  margin-left: 8px;
}
.fr-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.fr-tab {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text2);
  background: transparent;
}
.fr-tab.active {
  background: var(--accent, #6c5ce7);
  color: #fff;
  border-color: var(--accent);
}
.fr-expand-btns {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.fr-small-btn {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text3);
  cursor: pointer;
  font-size: 0.72rem;
}
.fr-search {
  width: 100%;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 0.82rem;
  margin-bottom: 10px;
  outline: none;
  box-sizing: border-box;
}
.fr-section {
  margin-bottom: 6px;
}
.fr-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: rgba(108, 138, 255, 0.06);
  color: var(--accent2, #a78bfa);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
  text-align: left;
}
.fr-arrow {
  font-size: 0.7rem;
  transition: transform 0.2s;
}
.fr-section-count {
  font-size: 0.68rem;
  color: var(--text3);
  font-weight: 400;
  margin-left: auto;
}
.fr-items {
  margin-top: 3px;
}
.fr-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px 6px 22px;
  border-radius: 6px;
  font-size: 0.82rem;
}
.fr-item.alt {
  background: rgba(255, 255, 255, 0.015);
}
.fr-name {
  color: var(--text2);
  flex-shrink: 0;
  min-width: 100px;
  font-weight: 600;
  font-size: 0.78rem;
}
.fr-formula {
  color: var(--text);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  line-height: 1.5;
  word-break: break-all;
}
</style>
