import { useState, useEffect, useCallback } from 'react'
import quizzes from './quizData'

const CHAPTERS = {
  ch1: '算法概述', ch2: '分治法', ch3: '动态规划', ch4: '贪心算法',
  ch5: '回溯法', ch6: '分支限界法', ch7: '随机算法', final: '综合测验',
}

const STORAGE_KEY = 'algo_quiz'

function loadScores() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch (e) { return {} }
}
function saveScores(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch (e) {} }

export default function FlashcardSystem() {
  const [tab, setTab] = useState('quiz') // 'quiz' | 'flashcard'
  const [chapter, setChapter] = useState('ch1')
  const [scores, setScores] = useState(loadScores)
  const [qi, setQi] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)

  // Flashcard state
  const [fcIdx, setFcIdx] = useState(0)
  const [fcFlipped, setFcFlipped] = useState(false)

  const flashcards = [
    { front: '算法四大性质', back: '有限性、确定性、可行性、输入(0个或多个)/输出(1个或多个)' },
    { front: '分治法三步骤', back: '分解 → 递归求解 → 合并\n子问题：独立 + 平衡' },
    { front: '动态规划两要素', back: '1. 最优子结构性质\n2. 重叠子问题性质\n求解方向：自底向上' },
    { front: '贪心算法两性质', back: '1. 贪心选择性质\n2. 最优子结构性质\n局部最优 → 全局最优' },
    { front: '回溯法 vs 分支限界', back: '回溯：DFS + 剪枝 → 所有解\n分支限界：BFS + 剪枝 → 最优解' },
    { front: '子集树 vs 排列树', back: '子集树：2^n 叶子(背包)\n排列树：n! 叶子(TSP)' },
    { front: '蒙特卡洛 vs 拉斯维加斯', back: 'MC：大概率正确，时间确定\nLV：完全正确，时间不确定' },
    { front: '约束函数 vs 限界函数', back: '约束：去不可行解\n限界：去可行非最优解' },
  ]

  const qs = quizzes[chapter] || []
  const currentQ = qs[qi]

  const selectAnswer = useCallback((oi) => {
    if (answered) return
    setSelected(oi)
    setAnswered(true)
    const key = `${chapter}-${qi}`
    const isCorrect = oi === currentQ.ans
    setScores(prev => {
      const next = { ...prev, [key]: isCorrect }
      saveScores(next)
      return next
    })
  }, [answered, chapter, qi, currentQ])

  const nextQ = () => { setQi(i => (i + 1) % qs.length); setSelected(null); setAnswered(false) }
  const prevQ = () => { setQi(i => (i - 1 + qs.length) % qs.length); setSelected(null); setAnswered(false) }

  const totalScore = Object.keys(scores).filter(k => k.startsWith(chapter + '-')).length
  const correctScore = Object.keys(scores).filter(k => k.startsWith(chapter + '-') && scores[k]).length

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['quiz', '📝 测验'], ['flashcard', '🃏 闪卡']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '6px 16px', borderRadius: 8, border: '1px solid ' + (tab === k ? 'var(--accent,#6c5ce7)' : 'var(--border)'),
            background: tab === k ? 'var(--accent,#6c5ce7)' : 'transparent',
            color: tab === k ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
          }}>{label}</button>
        ))}
      </div>

      {/* Chapter selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(CHAPTERS).map(([k, name]) => (
          <button key={k} onClick={() => { setChapter(k); setQi(0); setSelected(null); setAnswered(false) }} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: '.78rem', cursor: 'pointer',
            border: '1px solid ' + (chapter === k ? 'var(--accent,#6c5ce7)' : 'var(--border)'),
            background: chapter === k ? 'rgba(108,99,255,.15)' : 'transparent',
            color: chapter === k ? 'var(--accent,#6c5ce7)' : 'var(--text3)',
            fontWeight: chapter === k ? 700 : 400,
          }}>{name}</button>
        ))}
      </div>

      {tab === 'quiz' && currentQ && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '.85rem', color: 'var(--text2)' }}>第 {qi + 1} / {qs.length} 题</span>
            <span style={{ fontSize: '.85rem', color: 'var(--text2)' }}>得分: {correctScore} / {totalScore}</span>
          </div>
          <div style={{ background: 'var(--card2,#22263a)', borderRadius: 10, padding: 18, marginBottom: 12 }}>
            <p style={{ fontWeight: 600, marginBottom: 14, fontSize: '.95rem' }}>{qi + 1}. {currentQ.q}</p>
            {currentQ.opts.map((opt, oi) => {
              let cls = { display: 'block', padding: '10px 14px', margin: '6px 0', border: '1px solid var(--border)', borderRadius: 8, cursor: answered ? 'default' : 'pointer', fontSize: '.88rem', transition: 'all .15s' }
              if (answered && oi === currentQ.ans) cls = { ...cls, borderColor: 'var(--green,#10b981)', background: 'rgba(16,185,129,.12)', color: 'var(--green,#10b981)' }
              else if (answered && oi === selected && oi !== currentQ.ans) cls = { ...cls, borderColor: 'var(--red,#ef4444)', background: 'rgba(239,68,68,.1)', color: 'var(--red,#ef4444)' }
              else if (oi === selected) cls = { ...cls, borderColor: 'var(--accent,#6c5ce7)', background: 'rgba(108,99,255,.1)' }
              return <div key={oi} style={cls} onClick={() => selectAnswer(oi)}>{opt}</div>
            })}
            {answered && currentQ.explain && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(108,99,255,.08)', fontSize: '.85rem', color: 'var(--text2)' }}>
                💡 {currentQ.explain}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={prevQ} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer', fontSize: '.85rem' }}>← 上一题</button>
            <button onClick={nextQ} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>下一题 →</button>
          </div>
        </div>
      )}

      {tab === 'flashcard' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div
            onClick={() => setFcFlipped(!fcFlipped)}
            style={{
              maxWidth: 400, margin: '0 auto', padding: 30, borderRadius: 14,
              background: 'var(--card2,#22263a)', border: '1px solid var(--border)',
              cursor: 'pointer', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform .3s', transform: fcFlipped ? 'rotateY(180deg)' : 'none',
            }}
          >
            <p style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'pre-wrap', transform: fcFlipped ? 'rotateY(180deg)' : 'none' }}>
              {fcFlipped ? flashcards[fcIdx].back : flashcards[fcIdx].front}
            </p>
          </div>
          <p style={{ margin: '12px 0', color: 'var(--text3)', fontSize: '.82rem' }}>点击卡片翻转 · {fcIdx + 1} / {flashcards.length}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => { setFcIdx(i => (i - 1 + flashcards.length) % flashcards.length); setFcFlipped(false) }} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}>←</button>
            <button onClick={() => { setFcIdx(i => (i + 1) % flashcards.length); setFcFlipped(false) }} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer' }}>→</button>
          </div>
        </div>
      )}
    </div>
  )
}
