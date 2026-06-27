import { useState, useEffect, useRef, useCallback } from 'react'

function collectPageQuizzes() {
  const containers = document.querySelectorAll('.quiz-container[data-correct]')
  const questions = []
  containers.forEach(c => {
    const qEl = c.querySelector('.quiz-q')
    if (!qEl) return
    const correct = parseInt(c.dataset.correct)
    if (isNaN(correct)) return
    const opts = []
    c.querySelectorAll('.quiz-options label').forEach(label => {
      const clone = label.cloneNode(true)
      const inp = clone.querySelector('input')
      if (inp) inp.remove()
      opts.push(clone.textContent.trim())
    })
    if (!opts.length) return
    // Find chapter heading
    let chapter = '综合'
    let prev = c.previousElementSibling
    while (prev) {
      if (prev.tagName === 'H2' || prev.tagName === 'H3') { chapter = prev.textContent.trim(); break }
      prev = prev.previousElementSibling
    }
    questions.push({ text: qEl.innerHTML.trim(), options: opts, correct, chapter })
  })
  return questions
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
}

export default function RandomQuizFAB() {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('config') // config | quiz | result
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(0)
  const timerRef = useRef(null)

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startQuiz = (count, timeMin) => {
    const allQ = collectPageQuizzes()
    if (allQ.length === 0) { alert('当前页面没有找到自测题目。'); return }
    const shuffled = allQ.slice().sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(count, allQ.length))
    setQuestions(selected)
    setAnswers(new Array(selected.length).fill(-1))
    setCurrentIdx(0)
    setSubmitted(false)
    setScore(0)
    setTimeLeft(timeMin * 60)
    setPhase('quiz')
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); timerRef.current = null; submitQuiz(); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const selectOpt = (qi, oi) => {
    if (submitted) return
    setAnswers(prev => { const n = [...prev]; n[qi] = oi; return n })
  }

  const submitQuiz = useCallback(() => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    let correct = 0
    questions.forEach((q, i) => { if (answers[i] === q.correct) correct++ })
    setScore(correct)
    setPhase('result')
  }, [submitted, questions, answers])

  const close = () => { setOpen(false); setPhase('config'); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  return (
    <>
      {/* FAB */}
      <button onClick={() => { setOpen(true); setPhase('config') }} title="随机组卷" style={{
        position: 'fixed', bottom: 195, right: 30, zIndex: 98,
        width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.2em',
        boxShadow: '0 4px 15px rgba(0,0,0,.3)', transition: 'transform .2s',
      }}>🎲</button>

      {/* Overlay */}
      {open && (
        <div onClick={e => { if (e.target === e.currentTarget) close() }} style={{
          display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10001, background: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--card,#1a1d27)', borderRadius: 16, padding: 28, maxWidth: 700, width: '92vw',
            maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border,#2d3436)',
            position: 'relative', boxShadow: '0 12px 40px rgba(0,0,0,.4)',
          }}>
            <button onClick={close} style={{
              position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text3,#6b7194)',
            }}>&times;</button>

            {phase === 'config' && <ConfigView onStart={startQuiz} />}
            {phase === 'quiz' && (
              <QuizView
                questions={questions} answers={answers} currentIdx={currentIdx}
                timeLeft={timeLeft} submitted={submitted}
                onSelect={selectOpt} onGo={setCurrentIdx} onSubmit={submitQuiz}
              />
            )}
            {phase === 'result' && (
              <ResultView questions={questions} answers={answers} score={score}
                onRetry={() => setPhase('config')} onClose={close} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ConfigView({ onStart }) {
  const allQ = collectPageQuizzes()
  const chapters = [...new Set(allQ.map(q => q.chapter))]
  const [count, setCount] = useState(10)
  const [time, setTime] = useState(15)

  return (
    <>
      <h3 style={{ margin: '0 0 20px', fontSize: '1.15rem', color: 'var(--accent2,#a78bfa)' }}>🎲 随机组卷</h3>
      <p style={{ color: 'var(--text2,#9ba1b8)', fontSize: '.88rem', marginBottom: 16 }}>
        从当前页面 <strong>{allQ.length}</strong> 道题中随机抽取
      </p>
      <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>题目数量</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {[10, 15, 20].map(n => (
          <label key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid ${count === n ? 'var(--accent,#6c8aff)' : 'var(--border,#2d3436)'}`, borderRadius: 8, cursor: 'pointer', fontSize: '.88rem', background: count === n ? 'rgba(108,138,255,.1)' : 'transparent' }}>
            <input type="radio" name="rq-count" checked={count === n} onChange={() => setCount(n)} /> {n} 题
          </label>
        ))}
      </div>
      <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>考试时长</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ v: 10, l: '10分钟' }, { v: 15, l: '15分钟' }, { v: 20, l: '20分钟' }, { v: 30, l: '30分钟' }].map(t => (
          <label key={t.v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: `1px solid ${time === t.v ? 'var(--accent,#6c8aff)' : 'var(--border,#2d3436)'}`, borderRadius: 8, cursor: 'pointer', fontSize: '.88rem', background: time === t.v ? 'rgba(108,138,255,.1)' : 'transparent' }}>
            <input type="radio" name="rq-time" checked={time === t.v} onChange={() => setTime(t.v)} /> {t.l}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={() => onStart(count, time)} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c8aff)', color: '#fff', cursor: 'pointer', fontSize: '.9rem', fontWeight: 600 }}>开始考试</button>
      </div>
    </>
  )
}

function QuizView({ questions, answers, currentIdx, timeLeft, onSelect, onGo, onSubmit }) {
  const q = questions[currentIdx]
  const answeredCount = answers.filter(a => a !== -1).length

  return (
    <>
      {/* Timer */}
      <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 16, borderBottom: '1px solid var(--border)', fontSize: '1.3rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: timeLeft <= 60 ? 'var(--danger,#f87171)' : 'var(--success,#34d399)' }}>
        {formatTime(timeLeft)}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {questions.map((_, i) => (
          <div key={i} onClick={() => onGo(i)} style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
            border: `2px solid ${i === currentIdx ? 'var(--accent,#6c8aff)' : answers[i] !== -1 ? 'var(--success,#34d399)' : 'var(--border,#2d3436)'}`,
            background: answers[i] !== -1 && i !== currentIdx ? 'rgba(52,211,153,.15)' : 'transparent',
            color: i === currentIdx ? 'var(--accent,#6c8aff)' : answers[i] !== -1 ? 'var(--success,#34d399)' : 'var(--text3,#6b7194)',
            transform: i === currentIdx ? 'scale(1.1)' : 'none',
          }}>{i + 1}</div>
        ))}
      </div>

      {/* Question card */}
      <div style={{ background: 'var(--card2,#22263a)', borderRadius: 12, padding: 20, margin: '12px 0' }}>
        <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: (currentIdx + 1) + '. ' + q.text }} />
        {q.options.map((opt, oi) => (
          <div key={oi} onClick={() => onSelect(currentIdx, oi)} style={{
            display: 'block', padding: '10px 16px', margin: '6px 0', borderRadius: 8, cursor: 'pointer', fontSize: '.88rem',
            border: `1px solid ${answers[currentIdx] === oi ? 'var(--accent,#6c8aff)' : 'var(--border,#2d3436)'}`,
            background: answers[currentIdx] === oi ? 'rgba(108,138,255,.18)' : 'transparent',
            color: 'var(--text,#e8eaf0)',
          }}>{opt}</div>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        {currentIdx > 0 ? (
          <button onClick={() => onGo(currentIdx - 1)} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--card2,#22263a)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '.9rem' }}>← 上一题</button>
        ) : <div />}
        {currentIdx < questions.length - 1 ? (
          <button onClick={() => onGo(currentIdx + 1)} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--accent,#6c8aff)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '.9rem', fontWeight: 600 }}>下一题 →</button>
        ) : (
          <button onClick={onSubmit} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--accent,#6c8aff)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '.9rem', fontWeight: 600 }}>提交答卷</button>
        )}
      </div>
    </>
  )
}

function ResultView({ questions, answers, score, onRetry, onClose }) {
  const pct = Math.round(score / questions.length * 100)
  const color = pct >= 80 ? 'var(--success,#34d399)' : pct >= 60 ? 'var(--warning,#fbbf24)' : 'var(--danger,#f87171)'

  return (
    <>
      <div style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: '3.5rem', fontWeight: 800, color, margin: '16px 0 8px' }}>{pct}</div>
        <div style={{ fontSize: '.95rem', color: 'var(--text2,#9ba1b8)' }}>正确 {score} / {questions.length} 题</div>
      </div>
      {questions.map((q, i) => (
        <div key={i} style={{ background: 'var(--card2,#22263a)', borderRadius: 12, padding: 20, margin: '12px 0' }}>
          <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: (i + 1) + '. ' + q.text }} />
          {q.options.map((opt, oi) => {
            let cls = { display: 'block', padding: '10px 16px', margin: '6px 0', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.88rem' }
            if (oi === q.correct) cls = { ...cls, borderColor: 'var(--success,#34d399)', background: 'rgba(52,211,153,.15)', color: 'var(--success,#34d399)' }
            else if (oi === answers[i] && answers[i] !== q.correct) cls = { ...cls, borderColor: 'var(--danger,#f87171)', background: 'rgba(248,113,113,.15)', color: 'var(--danger,#f87171)' }
            return <div key={oi} style={cls}>{opt}</div>
          })}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
        <button onClick={onRetry} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--accent,#6c8aff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>再考一次</button>
        <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--card2,#22263a)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>关闭</button>
      </div>
    </>
  )
}
