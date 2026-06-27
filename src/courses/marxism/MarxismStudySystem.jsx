import { useState, useCallback } from 'react'
import DATA from './marxismData'
import QUIZ from './quizData'

const LS_KEY = 'mk'

function loadKnown() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch (e) { return {} }
}
function saveKnown(k) { try { localStorage.setItem(LS_KEY, JSON.stringify(k)) } catch (e) {} }

// Flatten all knowledge points
function getAllKP() {
  const result = []
  DATA.forEach(ch => {
    ch.sections.forEach(sec => {
      sec.kp.forEach(kp => {
        result.push({ ...kp, chapter: ch.title, chapterId: ch.id, section: sec.title })
      })
    })
  })
  return result
}

const ALL_KP = getAllKP()

// ── Browse Mode ──
function BrowseMode({ known, onToggle }) {
  const [openCh, setOpenCh] = useState(new Set([DATA[0]?.id]))
  const [openSec, setOpenSec] = useState(new Set())
  const toggleCh = id => setOpenCh(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSec = id => setOpenSec(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div>
      {DATA.map(ch => (
        <div key={ch.id} style={{ marginBottom: 12 }}>
          <div onClick={() => toggleCh(ch.id)} style={{ cursor: 'pointer', padding: '10px 14px', background: 'var(--card2,#22263a)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '.95rem' }}>
            <span>{openCh.has(ch.id) ? '▾' : '▸'}</span> {ch.icon} {ch.title}
          </div>
          {openCh.has(ch.id) && ch.sections.map((sec, si) => {
            const secKey = `${ch.id}-${si}`
            return (
              <div key={secKey} style={{ marginLeft: 16, marginTop: 8 }}>
                <div onClick={() => toggleSec(secKey)} style={{ cursor: 'pointer', padding: '6px 10px', color: 'var(--accent2,#a78bfa)', fontSize: '.88rem', fontWeight: 600 }}>
                  {openSec.has(secKey) ? '▾' : '▸'} {sec.title}
                </div>
                {openSec.has(secKey) && sec.kp.map((kp, ki) => {
                  const kpKey = `${ch.id}-${si}-${ki}`
                  const status = known[kpKey]
                  return (
                    <div key={kpKey} style={{ marginLeft: 16, marginTop: 8, padding: 14, background: 'var(--card,#1e293b)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${status === true ? 'var(--green,#10b981)' : status === false ? 'var(--red,#ef4444)' : 'var(--border)'}` }}>
                      <p style={{ fontWeight: 600, marginBottom: 8, fontSize: '.92rem' }}>❓ {kp.q}</p>
                      <div style={{ fontSize: '.88rem', color: 'var(--text2)', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: kp.a }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button onClick={() => onToggle(kpKey, true)} style={{ padding: '4px 14px', borderRadius: 6, border: '1px solid var(--green,#10b981)', background: status === true ? 'rgba(16,185,129,.15)' : 'transparent', color: 'var(--green,#10b981)', cursor: 'pointer', fontSize: '.82rem' }}>✅ 已掌握</button>
                        <button onClick={() => onToggle(kpKey, false)} style={{ padding: '4px 14px', borderRadius: 6, border: '1px solid var(--red,#ef4444)', background: status === false ? 'rgba(239,68,68,.1)' : 'transparent', color: 'var(--red,#ef4444)', cursor: 'pointer', fontSize: '.82rem' }}>❌ 待复习</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Flashcard Mode ──
function FlashcardMode({ known }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const pool = ALL_KP
  const kp = pool[idx]
  const kpKey = kp ? `${kp.chapterId}-0-${idx}` : ''

  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <p style={{ fontSize: '.82rem', color: 'var(--text3)', marginBottom: 12 }}>{kp?.chapter} · {kp?.section} · {idx + 1} / {pool.length}</p>
      <div onClick={() => setFlipped(!flipped)} style={{
        maxWidth: 460, margin: '0 auto', padding: 28, borderRadius: 14,
        background: 'var(--card2,#22263a)', border: '1px solid var(--border)',
        cursor: 'pointer', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
          dangerouslySetInnerHTML={{ __html: flipped ? kp?.a : `❓ ${kp?.q}` }} />
      </div>
      <p style={{ margin: '10px 0', color: 'var(--text3)', fontSize: '.78rem' }}>点击翻转 · 空格键翻转 · 左右箭头切换</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => { setIdx(i => (i - 1 + pool.length) % pool.length); setFlipped(false) }} style={{ padding: '6px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}>← 上一个</button>
        <button onClick={() => { setIdx(i => (i + 1) % pool.length); setFlipped(false) }} style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>下一个 →</button>
      </div>
    </div>
  )
}

// ── Quiz Mode ──
function QuizMode() {
  const [pool] = useState(() => [...QUIZ].sort(() => Math.random() - 0.5).slice(0, 15))
  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [done, setDone] = useState(false)

  const q = pool[qi]
  const selectAnswer = (oi) => {
    if (answered) return
    setSelected(oi); setAnswered(true)
    if (oi === q.ans) setScore(s => s + 1)
  }
  const next = () => {
    if (qi < pool.length - 1) { setQi(qi + 1); setSelected(null); setAnswered(false) }
    else setDone(true)
  }

  if (done) {
    const pct = Math.round(score / pool.length * 100)
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ fontSize: '3rem', marginBottom: 8 }}>{pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪'}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>测验完成！</p>
        <p style={{ color: 'var(--text2)' }}>得分：{score} / {pool.length}（{pct}%）</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '.85rem', color: 'var(--text2)' }}>第 {qi + 1} / {pool.length} 题 · 得分 {score}</span>
      </div>
      <div style={{ background: 'var(--card2,#22263a)', borderRadius: 10, padding: 18 }}>
        <p style={{ fontWeight: 600, marginBottom: 14 }}>{qi + 1}. {q.q}</p>
        {q.opts.map((opt, oi) => {
          let style = { display: 'block', padding: '10px 14px', margin: '6px 0', border: '1px solid var(--border)', borderRadius: 8, cursor: answered ? 'default' : 'pointer', fontSize: '.88rem' }
          if (answered && oi === q.ans) style = { ...style, borderColor: 'var(--green,#10b981)', background: 'rgba(16,185,129,.12)', color: 'var(--green,#10b981)' }
          else if (answered && oi === selected && oi !== q.ans) style = { ...style, borderColor: 'var(--red,#ef4444)', background: 'rgba(239,68,68,.1)', color: 'var(--red,#ef4444)' }
          return <div key={oi} style={style} onClick={() => selectAnswer(oi)}>{opt}</div>
        })}
      </div>
      {answered && <button onClick={next} style={{ marginTop: 12, padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>{qi < pool.length - 1 ? '下一题 →' : '查看结果'}</button>}
    </div>
  )
}

// ── Stats Mode ──
function StatsMode({ known }) {
  const stats = DATA.map(ch => {
    let total = 0, mastered = 0, reviewing = 0
    ch.sections.forEach((sec, si) => {
      sec.kp.forEach((_, ki) => {
        total++
        const key = `${ch.id}-${si}-${ki}`
        if (known[key] === true) mastered++
        else if (known[key] === false) reviewing++
      })
    })
    return { ...ch, total, mastered, reviewing }
  })
  const grandTotal = stats.reduce((s, c) => s + c.total, 0)
  const grandMastered = stats.reduce((s, c) => s + c.mastered, 0)

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent,#6c5ce7)' }}>{grandTotal ? Math.round(grandMastered / grandTotal * 100) : 0}%</p>
        <p style={{ color: 'var(--text2)', fontSize: '.88rem' }}>总进度 · 已掌握 {grandMastered} / {grandTotal}</p>
      </div>
      {stats.map(ch => {
        const pct = ch.total ? Math.round(ch.mastered / ch.total * 100) : 0
        return (
          <div key={ch.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '.88rem' }}>
              <span>{ch.icon} {ch.title}</span>
              <span style={{ color: 'var(--text3)' }}>{ch.mastered}/{ch.total} ({pct}%)</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: 'var(--accent,#6c5ce7)', borderRadius: 4, transition: 'width .3s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ──
export default function MarxismStudySystem() {
  const [mode, setMode] = useState('browse')
  const [known, setKnown] = useState(loadKnown)

  const toggleKnown = useCallback((key, val) => {
    setKnown(prev => {
      const next = { ...prev }
      if (next[key] === val) delete next[key]
      else next[key] = val
      saveKnown(next)
      return next
    })
  }, [])

  const modes = [
    ['browse', '📖 浏览'],
    ['flashcard', '🃏 闪卡'],
    ['quiz', '📝 测验'],
    ['stats', '📊 统计'],
  ]

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {modes.map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: '.85rem', fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (mode === k ? 'var(--accent,#6c5ce7)' : 'var(--border)'),
            background: mode === k ? 'var(--accent,#6c5ce7)' : 'transparent',
            color: mode === k ? '#fff' : 'var(--text)',
          }}>{label}</button>
        ))}
      </div>
      {mode === 'browse' && <BrowseMode known={known} onToggle={toggleKnown} />}
      {mode === 'flashcard' && <FlashcardMode known={known} />}
      {mode === 'quiz' && <QuizMode />}
      {mode === 'stats' && <StatsMode known={known} />}
    </div>
  )
}
