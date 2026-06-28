import { useState, useRef, useEffect, useCallback } from 'react'
import { FILES } from '../../data/files'

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [focus, setFocus] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef(null)
  const fuseRef = useRef(null)

  // Load Fuse.js on mount
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js'
    script.onload = () => {
      if (window.Fuse) {
        fuseRef.current = new window.Fuse(FILES, {
          keys: ['n', 'sn'],
          threshold: 0.4,
          includeScore: true,
        })
      }
    }
    document.head.appendChild(script)
    // Keyboard shortcut: Ctrl+K or /
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); inputRef.current?.focus()
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
        e.preventDefault(); inputRef.current?.focus()
      }
      if (e.key === 'Escape') { setFocus(false); inputRef.current?.blur() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const doSearch = useCallback((q) => {
    setQuery(q)
    setSelectedIdx(-1)
    if (!q.trim() || !fuseRef.current) { setResults([]); return }
    const r = fuseRef.current.search(q).slice(0, 10)
    setResults(r.map(m => m.item))
  }, [])

  const openFile = (f) => {
    window.open('/' + f.p, '_blank')
    setFocus(false)
  }

  return (
    <div className="search-section" style={{ maxWidth: 560, margin: '0 auto 28px', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
        <input
          ref={inputRef}
          value={query} onChange={e => doSearch(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 200)}
          placeholder="搜索知识点、资料名称… (Ctrl+K)"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
            if (e.key === 'Enter' && selectedIdx >= 0 && results[selectedIdx]) openFile(results[selectedIdx])
          }}
          style={{
            width: '100%', padding: '12px 16px 12px 40px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
            fontSize: '.92rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
      {focus && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          maxHeight: 420, overflowY: 'auto', zIndex: 200,
          boxShadow: '0 8px 30px rgba(0,0,0,.2)',
        }}>
          {results.map((f, i) => (
            <div key={i} onClick={() => openFile(f)} onMouseEnter={() => setSelectedIdx(i)} style={{
              padding: '10px 16px', cursor: 'pointer', fontSize: '.85rem',
              background: i === selectedIdx ? 'var(--accent-bg)' : 'transparent',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{f.n}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text3)', marginTop: 2 }}>
                <span style={{ background: f.c + '20', color: f.c, padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>{f.sn}</span>
                <span>{f.tn}</span>
                <span style={{ marginLeft: 6 }}>{f.sz}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
