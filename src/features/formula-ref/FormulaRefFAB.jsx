import { useState } from 'react'

const FORMULAS = {
  probability: [
    { name: '贝叶斯公式', formula: 'P(A|B) = P(B|A)P(A)/P(B)' },
    { name: '全概率公式', formula: 'P(B) = ΣP(B|Ai)P(Ai)' },
    { name: '期望', formula: 'E(X) = Σxi·P(X=xi)' },
    { name: '方差', formula: 'D(X) = E(X²) - [E(X)]²' },
    { name: '正态分布', formula: 'f(x) = (1/σ√2π)e^{-(x-μ)²/2σ²}' },
    { name: '二项分布', formula: 'P(X=k) = C(n,k)p^k(1-p)^{n-k}' },
    { name: '泊松分布', formula: 'P(X=k) = λ^k·e^{-λ}/k!' },
    { name: '协方差', formula: 'Cov(X,Y) = E(XY) - E(X)E(Y)' },
  ],
  dsp: [
    { name: 'DTFT', formula: 'X(e^{jω}) = Σ x(n)e^{-jωn}' },
    { name: 'IDTFT', formula: 'x(n) = (1/2π)∫X(e^{jω})e^{jωn}dω' },
    { name: 'DFT', formula: 'X(k) = Σ x(n)W_N^{kn}' },
    { name: 'Z变换', formula: 'X(z) = Σ x(n)z^{-n}' },
    { name: '双线性变换', formula: 's = (2/T)·(1-z^{-1})/(1+z^{-1})' },
    { name: '频率映射', formula: 'Ω = (2/T)tan(ω/2)' },
  ],
  calculus: [
    { name: '全微分', formula: 'dz = (∂z/∂x)dx + (∂z/∂y)dy' },
    { name: '格林公式', formula: '∮(Pdx+Qdy) = ∬(∂Q/∂x-∂P/∂y)dxdy' },
    { name: '高斯公式', formula: '∯F·dS = ∬∫∇·FdV' },
    { name: '柯西积分', formula: '∮f(z)/(z-z₀)dz = 2πi·f(z₀)' },
  ],
}

export default function FormulaRefFAB() {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('probability')
  const [search, setSearch] = useState('')

  const formulas = FORMULAS[subject] || []
  const filtered = search
    ? formulas.filter(f => f.name.includes(search) || f.formula.includes(search))
    : formulas

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
            background: 'var(--card,#1a1d27)', borderRadius: 16, padding: 28,
            maxWidth: 600, width: '92vw', maxHeight: '80vh', overflowY: 'auto',
            border: '1px solid var(--border,#2d3436)', position: 'relative',
          }}>
            <button onClick={() => setOpen(false)} style={{
              position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text3,#8892b0)',
            }}>&times;</button>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: 'var(--accent2,#a29bfe)' }}>∑ 公式速查</h3>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {Object.keys(FORMULAS).map(k => (
                <button key={k} onClick={() => setSubject(k)} style={{
                  padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: subject === k ? 'var(--accent,#6c5ce7)' : 'transparent',
                  color: subject === k ? '#fff' : 'var(--text-dim)', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
                }}>{k === 'probability' ? '概率论' : k === 'dsp' ? 'DSP' : '高数'}</button>
              ))}
            </div>

            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索公式名称…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,.05)', color: 'var(--text)', fontSize: '.85rem', marginBottom: 12, outline: 'none', boxSizing: 'border-box' }}
            />

            {filtered.map((f, i) => (
              <div key={i} style={{
                padding: '10px 14px', margin: '6px 0', borderRadius: 8,
                background: 'var(--card2,#22263a)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 600, fontSize: '.88rem', marginBottom: 4, color: 'var(--accent2,#a78bfa)' }}>{f.name}</div>
                <div style={{ fontSize: '.92rem', fontFamily: 'monospace' }}>{f.formula}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
