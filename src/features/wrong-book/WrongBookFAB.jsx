import { useState } from 'react'
import useWrongBook from './useWrongBook'

export default function WrongBookFAB() {
  const [open, setOpen] = useState(false)
  const { wrongs, clearAll, exportAsText, grouped } = useWrongBook()
  const [filter, setFilter] = useState('all')

  const groups = grouped()
  const pages = Object.keys(groups)
  const filtered = filter === 'all' ? wrongs : (groups[filter] || [])

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        title="错题本"
        style={{
          position: 'fixed', bottom: 140, right: 30, zIndex: 98,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--red,#ef4444)', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: '1.2em', boxShadow: '0 4px 15px rgba(0,0,0,.3)',
          transition: 'transform .2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        📝
        {wrongs.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20,
            borderRadius: 10, background: '#fff', color: 'var(--red,#ef4444)',
            fontSize: '.7rem', fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 4px',
          }}>{wrongs.length}</span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 10000, background: 'rgba(0,0,0,.5)', alignItems: 'center', justifyContent: 'center',
          }}>
          <div style={{
            background: 'var(--card,#1a1d27)', borderRadius: 16, padding: 28,
            maxWidth: 720, width: '92vw', maxHeight: '80vh', overflowY: 'auto',
            border: '1px solid var(--border,#2d3436)', position: 'relative',
          }}>
            <button onClick={() => setOpen(false)} style={{
              position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text3,#8892b0)', lineHeight: 1,
            }}>&times;</button>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: 'var(--accent2,#a29bfe)' }}>📝 错题本</h3>

            {/* Tab filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <button onClick={() => setFilter('all')} style={{
                padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: filter === 'all' ? 'var(--accent,#6c5ce7)' : 'transparent',
                color: filter === 'all' ? '#fff' : 'var(--text-dim,#8892b0)',
                cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
              }}>全部 ({wrongs.length})</button>
              {pages.map(p => (
                <button key={p} onClick={() => setFilter(p)} style={{
                  padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: filter === p ? 'var(--accent,#6c5ce7)' : 'transparent',
                  color: filter === p ? '#fff' : 'var(--text-dim,#8892b0)',
                  cursor: 'pointer', fontSize: '.85rem', fontWeight: 600,
                }}>{p} ({groups[p].length})</button>
              ))}
            </div>

            {/* Wrong items */}
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--text-dim,#8892b0)' }}>暂无错题，继续加油！</p>
            ) : (
              filtered.slice().reverse().map((w, i) => (
                <div key={i} style={{
                  background: 'var(--card2,#232736)', borderRadius: 10,
                  padding: '14px 16px', margin: '8px 0', border: '1px solid var(--border,#2d3436)',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '.92rem' }}>{w.question}</div>
                  <div style={{ fontSize: '.85rem', color: 'var(--text-dim,#8892b0)' }}>
                    <span style={{ color: 'var(--red,#ff6b6b)' }}>✗ 你的答案: {w.userAnswer}</span><br />
                    <span style={{ color: 'var(--green,#00cec9)' }}>✓ 正确答案: {w.correctAnswer}</span>
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-dim,#8892b0)', marginTop: 4 }}>
                    {new Date(w.time).toLocaleString()}
                  </div>
                </div>
              ))
            )}

            {/* Actions */}
            {wrongs.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button onClick={() => { if (confirm('确定清空所有错题？')) clearAll() }} style={{
                  background: 'var(--red,#ff6b6b)', color: '#fff', border: 'none',
                  padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '.82rem',
                }}>清空错题</button>
                <button onClick={exportAsText} style={{
                  background: 'var(--card2,#22263a)', color: 'var(--text)', border: '1px solid var(--border)',
                  padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '.82rem',
                }}>导出为文本</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
