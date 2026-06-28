import { useState } from 'react'

const FORMULAS = {
  probability: [
    // ── 基本概率 ──
    { s: '基本概率', n: '条件概率', f: 'P(A|B) = P(AB) / P(B)' },
    { s: '基本概率', n: '乘法公式', f: 'P(AB) = P(A)·P(B|A) = P(B)·P(A|B)' },
    { s: '基本概率', n: '加法公式', f: 'P(A∪B) = P(A) + P(B) − P(AB)' },
    { s: '基本概率', n: '全概率公式', f: 'P(B) = Σ P(Aᵢ)·P(B|Aᵢ)' },
    { s: '基本概率', n: '贝叶斯公式', f: 'P(Aᵢ|B) = P(Aᵢ)P(B|Aᵢ) / ΣP(Aⱼ)P(B|Aⱼ)' },
    { s: '基本概率', n: '独立性', f: 'P(AB) = P(A)·P(B)；三事件独立需 4 个等式' },
    { s: '基本概率', n: '对立事件', f: 'P(Ā) = 1 − P(A)；P(A−B) = P(A) − P(AB)' },

    // ── 数字特征 ──
    { s: '数字特征', n: '期望(离散)', f: 'E(X) = Σ xₖ·pₖ' },
    { s: '数字特征', n: '期望(连续)', f: 'E(X) = ∫ x·f(x) dx' },
    { s: '数字特征', n: '方差', f: 'D(X) = E(X²) − [E(X)]²' },
    { s: '数字特征', n: '期望线性', f: 'E(aX+bY+c) = aE(X) + bE(Y) + c' },
    { s: '数字特征', n: '方差公式', f: 'D(aX+b) = a²D(X)；独立时 D(X±Y) = D(X)+D(Y)' },
    { s: '数字特征', n: '协方差', f: 'Cov(X,Y) = E(XY) − E(X)E(Y)' },
    { s: '数字特征', n: '相关系数', f: 'ρ = Cov(X,Y) / √[D(X)·D(Y)]；|ρ| ≤ 1' },
    { s: '数字特征', n: '独立→不相关', f: '独立 ⟹ ρ=0；二维正态下 ρ=0 ⟺ 独立' },

    // ── 常用离散分布 ──
    { s: '离散分布', n: '0-1 分布 B(1,p)', f: 'P(X=1)=p, P(X=0)=1−p；E=p, D=p(1−p)' },
    { s: '离散分布', n: '二项分布 B(n,p)', f: 'P(X=k)=C(n,k)pᵏ(1−p)ⁿ⁻ᵏ；E=np, D=np(1−p)' },
    { s: '离散分布', n: '泊松分布 π(λ)', f: 'P(X=k)=λᵏe⁻ᵏ/k!；E=λ, D=λ' },
    { s: '离散分布', n: '泊松定理', f: 'n大p小np适中时 B(n,p) ≈ π(np)' },
    { s: '离散分布', n: '可加性', f: 'X~B(n₁,p), Y~B(n₂,p) ⟹ X+Y~B(n₁+n₂,p)' },
    { s: '离散分布', n: '泊松可加性', f: 'X~π(λ₁), Y~π(λ₂) ⟹ X+Y~π(λ₁+λ₂)' },

    // ── 常用连续分布 ──
    { s: '连续分布', n: '均匀分布 U(a,b)', f: 'f(x)=1/(b−a)；E=(a+b)/2, D=(b−a)²/12' },
    { s: '连续分布', n: '指数分布 Exp(λ)', f: 'f(x)=λe⁻λˣ(x≥0)；E=1/λ, D=1/λ²' },
    { s: '连续分布', n: '正态分布 N(μ,σ²)', f: 'f(x)=(1/σ√2π)exp[−(x−μ)²/2σ²]' },
    { s: '连续分布', n: '标准正态 N(0,1)', f: 'φ(x)=(1/√2π)e⁻ˣ²/²；Φ(−x)=1−Φ(x)' },
    { s: '连续分布', n: '正态标准化', f: 'X~N(μ,σ²) ⟹ Z=(X−μ)/σ ~ N(0,1)' },
    { s: '连续分布', n: '正态线性变换', f: 'X~N(μ,σ²) ⟹ aX+b ~ N(aμ+b, a²σ²)' },
    { s: '连续分布', n: 'χ² 分布', f: 'Xᵢ~N(0,1) ⟹ ΣXᵢ² ~ χ²(n)；E=n, D=2n' },
    { s: '连续分布', n: 't 分布', f: 'Z~N(0,1), V~χ²(n) ⟹ Z/√(V/n) ~ t(n)' },
    { s: '连续分布', n: '二维正态', f: '(X,Y)~N(μ₁,μ₂,σ₁²,σ₂²,ρ)；边缘仍正态' },

    // ── 分布函数与变换 ──
    { s: '分布函数', n: '分布函数', f: 'F(x) = P(X≤x) = ∫₋∞ˣ f(t)dt' },
    { s: '分布函数', n: '密度关系', f: 'f(x) = F′(x)（连续型几乎处处成立）' },
    { s: '分布函数', n: '分布函数法', f: 'Y=g(X)：F_Y(y)=P(g(X)≤y)，再求导得 f_Y' },
    { s: '分布函数', n: '公式法(单调)', f: 'y=g(x)严格单调时 f_Y(y)=f_X[h(y)]·|h′(y)|' },
    { s: '分布函数', n: '二维边缘密度', f: 'f_X(x) = ∫ f(x,y)dy；f_Y(y) = ∫ f(x,y)dx' },
    { s: '分布函数', n: '独立性判定', f: 'f(x,y)=f_X(x)·f_Y(y) ⟺ X⊥Y（支撑域非矩形必不独立）' },

    // ── 大数定律与极限定理 ──
    { s: '极限定理', n: '切比雪夫不等式', f: 'P(|X−μ|≥ε) ≤ D(X)/ε²' },
    { s: '极限定理', n: '大数定律', f: 'X̄ₙ →ᵖ μ（样本均值依概率收敛于总体均值）' },
    { s: '极限定理', n: '中心极限定理', f: 'n大时 ΣXᵢ ~ 近似N(nμ, nσ²)；标准化后→N(0,1)' },
    { s: '极限定理', n: 'CLT 应用', f: 'P(ΣXᵢ > a) ≈ 1 − Φ[(a−nμ)/(σ√n)]' },

    // ── 参数估计 ──
    { s: '参数估计', n: '矩估计', f: '令 E(Xᵏ) = (1/n)ΣXᵢᵏ，解出参数 θ' },
    { s: '参数估计', n: '极大似然 MLE', f: 'L(θ)=Πf(xᵢ;θ)，取对数后对 θ 求导=0' },
    { s: '参数估计', n: 'MLE 不变性', f: 'θ̂ 是 MLE ⟹ g(θ̂) 是 g(θ) 的 MLE' },
    { s: '参数估计', n: '均匀分布 MLE', f: 'U(0,θ) 的 MLE：θ̂=max(X₁,...,Xₙ)' },
    { s: '参数估计', n: '无偏性', f: 'E(θ̂)=θ 称无偏估计；E(S²)=σ²（S² 是 σ² 的无偏估计）' },
    { s: '参数估计', n: '样本方差', f: 'S² = (1/(n−1))Σ(Xᵢ−X̄)²；自由度 n−1' },

    // ── 置信区间与假设检验 ──
    { s: '置信区间', n: '置信区间含义', f: '重复抽样100次，约95个区间包含真值（95%置信水平）' },
    { s: '置信区间', n: 'μ 的区间(σ已知)', f: 'X̄ ± z_{α/2}·σ/√n' },
    { s: '置信区间', n: 'μ 的区间(σ未知)', f: 'X̄ ± t_{α/2}(n−1)·S/√n' },
    { s: '置信区间', n: 'σ² 的区间', f: '[(n−1)S²/χ²_{α/2}, (n−1)S²/χ²_{1−α/2}]' },

    { s: '假设检验', n: '两类错误', f: 'Ⅰ类(α)：弃真；Ⅱ类(β)：取伪' },
    { s: '假设检验', n: 'Z 检验(σ已知)', f: 'Z = (X̄−μ₀)/(σ/√n)；拒绝域 |Z|>z_{α/2}' },
    { s: '假设检验', n: 'T 检验(σ未知)', f: 'T = (X̄−μ₀)/(S/√n)；拒绝域 |T|>t_{α/2}(n−1)' },
    { s: '假设检验', n: 'χ² 检验(方差)', f: 'χ² = (n−1)S²/σ₀²；拒绝域查 χ² 分布表' },
  ],
  dsp: [
    { s: '变换', n: 'DTFT', f: 'X(eʲω) = Σ x(n)e⁻ʲωⁿ' },
    { s: '变换', n: 'IDTFT', f: 'x(n) = (1/2π)∫X(eʲω)eʲωⁿdω' },
    { s: '变换', n: 'DFT', f: 'X(k) = Σ x(n)W_N^(kn)' },
    { s: '变换', n: 'Z 变换', f: 'X(z) = Σ x(n)z⁻ⁿ' },
    { s: '变换', n: '双线性变换', f: 's = (2/T)·(1−z⁻¹)/(1+z⁻¹)' },
    { s: '变换', n: '频率映射', f: 'Ω = (2/T)tan(ω/2)' },
  ],
  calculus: [
    { s: '积分', n: '全微分', f: 'dz = (∂z/∂x)dx + (∂z/∂y)dy' },
    { s: '积分', n: '格林公式', f: '∮(Pdx+Qdy) = ∬(∂Q/∂x−∂P/∂y)dxdy' },
    { s: '积分', n: '高斯公式', f: '∯F·dS = ∬∫∇·F dV' },
    { s: '积分', n: '柯西积分', f: '∮f(z)/(z−z₀)dz = 2πi·f(z₀)' },
  ],
}

const SUBJECT_LABELS = { probability: '概率论', dsp: 'DSP', calculus: '高数' }

export default function FormulaRefFAB() {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('probability')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})

  const formulas = FORMULAS[subject] || []

  const filtered = search
    ? formulas.filter(f => f.n.includes(search) || f.f.includes(search) || (f.s && f.s.includes(search)))
    : formulas

  // Group by section
  const sections = []
  const sectionMap = {}
  filtered.forEach(f => {
    const key = f.s || '其他'
    if (!sectionMap[key]) { sectionMap[key] = []; sections.push(key) }
    sectionMap[key].push(f)
  })

  const toggleSection = (s) => {
    setExpanded(prev => ({ ...prev, [s]: !prev[s] }))
  }

  const expandAll = () => {
    const all = {}
    sections.forEach(s => { all[s] = true })
    setExpanded(all)
  }
  const collapseAll = () => setExpanded({})

  return (
    <>
      <button onClick={() => setOpen(!open)} title="公式速查" style={{
        position: 'fixed', bottom: 250, right: 30, zIndex: 98,
        width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--card2,#22263a)', color: 'var(--text)', border: '1px solid var(--border)',
        cursor: 'pointer', fontSize: '1.2em', boxShadow: '0 4px 15px rgba(0,0,0,.3)', transition: 'transform .2s',
      }}>∑</button>

      {open && (
        <div onClick={e => { if (e.target === e.currentTarget) setOpen(false) }} style={{
          display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000, background: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--card,#1a1d27)', borderRadius: 16, padding: '20px 24px',
            maxWidth: 640, width: '94vw', maxHeight: '85vh', overflowY: 'auto',
            border: '1px solid var(--border,#2d3436)', position: 'relative',
          }}>
            <button onClick={() => setOpen(false)} style={{
              position: 'absolute', top: 10, right: 14, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text3,#8892b0)',
            }}>&times;</button>

            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem', color: 'var(--accent2,#a29bfe)' }}>
              ∑ 公式速查
              <span style={{ fontSize: '.72rem', color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                {filtered.length} 条
              </span>
            </h3>

            {/* 科目切换 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {Object.keys(FORMULAS).map(k => (
                <button key={k} onClick={() => { setSubject(k); setSearch(''); setExpanded({}) }} style={{
                  padding: '5px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: subject === k ? 'var(--accent,#6c5ce7)' : 'transparent',
                  color: subject === k ? '#fff' : 'var(--text-dim)', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600,
                }}>{SUBJECT_LABELS[k]}</button>
              ))}
              {subject === 'probability' && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button onClick={expandAll} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '.72rem' }}>全部展开</button>
                  <button onClick={collapseAll} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '.72rem' }}>全部折叠</button>
                </span>
              )}
            </div>

            {/* 搜索 */}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索公式名称或内容…"
              style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: 'var(--text)', fontSize: '.82rem', marginBottom: 10, outline: 'none', boxSizing: 'border-box' }}
            />

            {/* 公式列表（按分组折叠） */}
            {sections.map(section => {
              const isOpen = expanded[section] !== false // 默认展开
              return (
                <div key={section} style={{ marginBottom: 6 }}>
                  <button onClick={() => toggleSection(section)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '7px 10px', borderRadius: 8, border: 'none',
                    background: 'rgba(108,138,255,.06)', color: 'var(--accent2,#a78bfa)',
                    cursor: 'pointer', fontSize: '.82rem', fontWeight: 700, textAlign: 'left',
                    transition: 'background .15s',
                  }}>
                    <span style={{ fontSize: '.7rem', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                    {section}
                    <span style={{ fontSize: '.68rem', color: 'var(--text3)', fontWeight: 400, marginLeft: 'auto' }}>
                      {sectionMap[section].length} 条
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ marginTop: 3 }}>
                      {sectionMap[section].map((f, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'baseline', gap: 8,
                          padding: '6px 10px 6px 22px', margin: '1px 0',
                          borderRadius: 6, fontSize: '.82rem',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)',
                        }}>
                          <span style={{ color: 'var(--text2,#9ba1b8)', flexShrink: 0, minWidth: 100, fontWeight: 600, fontSize: '.78rem' }}>{f.n}</span>
                          <span style={{ color: 'var(--text,#e8eaf0)', fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace", fontSize: '.82rem', lineHeight: 1.5, wordBreak: 'break-all' }}>{f.f}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
