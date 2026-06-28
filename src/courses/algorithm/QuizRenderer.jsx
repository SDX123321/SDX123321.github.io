import { useState } from 'react'
import quizzes from './quizData'

export default function QuizRenderer({ quizKey }) {
  const qs = quizzes[quizKey]
  if (!qs || qs.length === 0) return null

  return (
    <div>
      {qs.map((q, i) => (
        <QuizItem key={i} q={q} index={i} />
      ))}
    </div>
  )
}

function QuizItem({ q, index }) {
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)

  const handleSelect = (oi) => {
    if (answered) return
    setSelected(oi)
    setAnswered(true)
  }

  const isCorrect = selected === q.ans

  return (
    <div className="quiz-q" style={{ marginBottom: 20 }}>
      <h4 style={{ fontSize: '.92rem', fontWeight: 600, marginBottom: 10 }}>
        {index + 1}. {q.q}
      </h4>
      <div className="opts" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {q.opts.map((opt, oi) => {
          let bg = 'transparent'
          let borderColor = 'var(--border)'
          let color = 'var(--text)'

          if (answered) {
            if (oi === q.ans) {
              bg = 'rgba(16,185,129,.12)'
              borderColor = 'var(--success)'
              color = 'var(--success)'
            } else if (oi === selected && oi !== q.ans) {
              bg = 'rgba(239,68,68,.1)'
              borderColor = 'var(--danger)'
              color = 'var(--danger)'
            }
          } else if (oi === selected) {
            bg = 'var(--accent-bg)'
            borderColor = 'var(--accent)'
          }

          return (
            <div
              key={oi}
              className="quiz-opt"
              onClick={() => handleSelect(oi)}
              style={{
                padding: '10px 14px',
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                cursor: answered ? 'default' : 'pointer',
                fontSize: '.88rem',
                background: bg,
                color,
                transition: 'all .15s',
              }}
            >
              {String.fromCharCode(65 + oi)}. {opt}
            </div>
          )
        })}
      </div>
      {answered && q.explain && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: isCorrect ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
          fontSize: '.82rem', color: isCorrect ? 'var(--success)' : 'var(--danger)',
          lineHeight: 1.6,
        }}>
          {isCorrect ? '✓' : '✗'} {q.explain}
        </div>
      )}
    </div>
  )
}
