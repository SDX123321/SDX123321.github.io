import { useState, useEffect, useRef } from 'react'

export default function PageSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        // Only intercept if page has its own search
        const main = document.querySelector('.main')
        if (main) { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }
      }
      if (e.key === 'Escape' && open) { setOpen(false); clearMarks() }
      if (e.key === 'F3' || (e.key === 'g' && e.ctrlKey)) {
        e.preventDefault()
        setCurrentIdx(i => (i + 1) % matches.length)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, matches.length])

  const clearMarks = () => {
    document.querySelectorAll('mark.psm').forEach(m => {
      m.replaceWith(document.createTextNode(m.textContent))
    })
    // Normalize merged text nodes
    document.querySelectorAll('.main, main').forEach(el => el.normalize())
  }

  const doSearch = (q) => {
    clearMarks()
    setQuery(q)
    if (!q.trim()) { setMatches([]); return }
    const main = document.querySelector('.main') || document.querySelector('main')
    if (!main) return
    const found = []
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    nodes.forEach(node => {
      const idx = node.textContent.toLowerCase().indexOf(q.toLowerCase())
      if (idx >= 0 && node.parentElement.closest('mark') === null) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + q.length)
        const mark = document.createElement('mark')
        mark.className = 'psm'
        mark.style.cssText = 'background:rgba(250,204,21,.4);color:inherit;padding:0 1px;border-radius:2px;'
        range.surroundContents(mark)
        found.push(mark)
      }
    })
    setMatches(found)
    setCurrentIdx(0)
    if (found.length > 0) scrollToMatch(found, 0)
  }

  const scrollToMatch = (marks, idx) => {
    marks.forEach((m, i) => { m.style.outline = i === idx ? '2px solid var(--accent)' : 'none' })
    marks[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  useEffect(() => {
    if (matches.length > 0) scrollToMatch(matches, currentIdx)
  }, [currentIdx])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', top: 3, left: 280, right: 0, zIndex: 99,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px', background: 'var(--card,#1e293b)',
      borderBottom: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,.2)',
    }}>
      <span style={{ fontSize: '.78rem', color: 'var(--text3)' }}>🔍</span>
      <input ref={inputRef} value={query} onChange={e => doSearch(e.target.value)}
        autoFocus placeholder="搜索当前页面…"
        onKeyDown={e => {
          if (e.key === 'Enter') setCurrentIdx(i => (i + 1) % matches.length)
          if (e.key === 'Escape') { setOpen(false); clearMarks() }
        }}
        style={{
          flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--bg)', color: 'var(--text)', fontSize: '.82rem', outline: 'none',
        }}
      />
      <span style={{ fontSize: '.75rem', color: 'var(--text3)', minWidth: 40 }}>
        {matches.length > 0 ? `${currentIdx + 1}/${matches.length}` : query ? '无匹配' : ''}
      </span>
      <button onClick={() => setCurrentIdx(i => Math.max(i - 1, 0))} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '.8rem' }}>▲</button>
      <button onClick={() => setCurrentIdx(i => (i + 1) % matches.length)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '.8rem' }}>▼</button>
      <button onClick={() => { setOpen(false); clearMarks() }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '.9rem' }}>✕</button>
    </div>
  )
}
