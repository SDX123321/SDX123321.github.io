import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { loadAnnotations, saveAnnotation, removeAnnotation } from './annotationStorage'

const COLORS = [
  { bg: 'rgba(251,191,36,0.35)', border: '#fbbf24', name: '黄' },
  { bg: 'rgba(52,211,153,0.35)', border: '#34d399', name: '绿' },
  { bg: 'rgba(96,165,250,0.35)', border: '#60a5fa', name: '蓝' },
  { bg: 'rgba(248,113,113,0.35)', border: '#f87171', name: '红' },
  { bg: 'rgba(167,139,250,0.35)', border: '#a78bfa', name: '紫' },
]

let idCounter = Date.now()
function uid() { return 'ann_' + (idCounter++) }

export default function AnnotationOverlay({ containerRef }) {
  const location = useLocation()
  const [mode, setMode] = useState(false)
  const [subMode, setSubMode] = useState('highlight') // 'highlight' | 'erase'
  const [selToolbar, setSelToolbar] = useState(null)
  const [noteDialog, setNoteDialog] = useState(null)
  const [noteText, setNoteText] = useState('')
  const selTextRef = useRef('')
  const selRangeRef = useRef(null)
  const restoreKey = useRef(0)
  const pathname = location.pathname

  const getContainer = useCallback(() => {
    return containerRef?.current || document.querySelector('.course-main, .os-ex-page, .container')
  }, [containerRef])

  // ── restore highlights on mode/page change ──
  useEffect(() => {
    if (!mode) return
    const el = getContainer()
    if (!el) return
    setTimeout(() => restoreHighlights(el, pathname, openAnn), 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pathname, restoreKey.current])

  // ── text selection → toolbar ──
  useEffect(() => {
    if (!mode || subMode !== 'highlight') { setSelToolbar(null); return }
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelToolbar(null); return }
      const range = sel.getRangeAt(0)
      const el = getContainer()
      if (el && !el.contains(range.commonAncestorContainer)) { setSelToolbar(null); return }
      const rect = range.getBoundingClientRect()
      selTextRef.current = sel.toString().trim()
      selRangeRef.current = range
      setSelToolbar({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    }
    document.addEventListener('mouseup', handler)
    return () => document.removeEventListener('mouseup', handler)
  }, [mode, subMode, getContainer])

  const doHighlight = useCallback((color) => {
    const range = selRangeRef.current
    const text = selTextRef.current
    if (!range || !text) return
    const id = uid()
    const ann = { id, text, color, note: '', created: Date.now() }
    highlightRange(range, id, color.note ? color.note : color, openAnn)
    saveAnnotation(pathname, ann)
    setSelToolbar(null)
    selRangeRef.current = null
  }, [pathname])

  const openAnn = (ann, e) => {
    e?.stopPropagation()
    setNoteText(ann.note || '')
    setNoteDialog(ann)
  }

  const saveNote = () => {
    if (!noteDialog) return
    const ann = { ...noteDialog, note: noteText }
    saveAnnotation(pathname, ann)
    setNoteDialog(null)
    restoreKey.current++
  }

  const deleteAnn = (ann) => {
    removeAnnotation(pathname, ann.id)
    document.querySelectorAll(`[data-ann-id="${ann.id}"]`).forEach(el => {
      const parent = el.parentNode
      if (parent) {
        const text = document.createTextNode(el.textContent)
        parent.replaceChild(text, el)
        parent.normalize()
      }
    })
    setNoteDialog(null)
    restoreKey.current++
  }

  // ── eraser: click highlight to remove ──
  useEffect(() => {
    if (!mode || subMode !== 'erase') return
    const el = getContainer()
    if (!el) return
    const handler = (e) => {
      const mark = e.target.closest('[data-ann-id]')
      if (!mark) return
      const id = mark.getAttribute('data-ann-id')
      const anns = loadAnnotations(pathname)
      const ann = anns.find(a => a.id === id)
      if (ann) deleteAnn(ann)
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [mode, subMode, pathname, getContainer])

  // ── margin note: click bookmark icon on highlighted text ──
  useEffect(() => {
    if (!mode) return
    const el = getContainer()
    if (!el) return
    el.querySelectorAll('[data-ann-id]').forEach(mark => {
      if (mark.querySelector('.ann-note-pin')) return
      if (annsHaveNote(mark.getAttribute('data-ann-id'), pathname)) {
        const pin = document.createElement('span')
        pin.className = 'ann-note-pin'
        pin.textContent = '📌'
        pin.style.cssText = 'font-size:.65rem;margin-left:2px;cursor:pointer;opacity:.7'
        pin.addEventListener('click', (e) => {
          e.stopPropagation()
          const id = mark.getAttribute('data-ann-id')
          const anns = loadAnnotations(pathname)
          const ann = anns.find(a => a.id === id)
          if (ann) openAnn(ann, e)
        })
        mark.appendChild(pin)
      }
    })
  })

  return (
    <>
      {/* Toolbar */}
      {selToolbar && (
        <div className="ann-toolbar" style={{
          position: 'fixed', top: selToolbar.top, left: selToolbar.left,
          transform: 'translate(-50%, -100%)', zIndex: 9999,
          display: 'flex', gap: 4, background: '#1e293b',
          borderRadius: 10, padding: '6px 10px',
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {COLORS.map(c => (
            <button key={c.name} className="ann-color-btn" title={c.name}
              onClick={() => doHighlight(c)}
              style={{ background: c.bg, border: `2px solid ${c.border}`, width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', padding: 0 }} />
          ))}
          <div className="ann-toolbar-divider" />
          <button className="ann-cancel-btn" onClick={() => setSelToolbar(null)} style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '.75rem', padding: '0 6px',
          }}>✕</button>
        </div>
      )}

      {/* Note dialog */}
      {noteDialog && (
        <div className="ann-overlay" onClick={() => setNoteDialog(null)} style={{
          position: 'fixed', inset: 0, zIndex: 10001, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.4)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card,#1e293b)', border: '1px solid var(--border,#334155)',
            borderRadius: 14, padding: 20, maxWidth: 420, width: '90vw',
            boxShadow: '0 12px 40px rgba(0,0,0,.4)',
          }}>
            <div style={{ fontSize: '.82rem', color: 'var(--text3)', marginBottom: 4 }}>批注</div>
            <div style={{
              fontSize: '.88rem', color: 'var(--text)', marginBottom: 12, padding: '8px 12px',
              background: noteDialog.color?.bg || noteDialog.color, borderRadius: 8,
              borderLeft: `3px solid ${getBorderColor(noteDialog.color)}`,
            }}>"{noteDialog.text}"</div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="添加笔记…"
              style={{
                width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                fontSize: '.85rem', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12,
              }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => deleteAnn(noteDialog)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--danger,#ef4444)',
                background: 'transparent', color: 'var(--danger,#ef4444)', fontSize: '.82rem',
                cursor: 'pointer', marginRight: 'auto',
              }}>删除</button>
              <button onClick={() => setNoteDialog(null)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text2)', fontSize: '.82rem', cursor: 'pointer',
              }}>取消</button>
              <button onClick={saveNote} style={{
                padding: '6px 18px', borderRadius: 8, border: 'none',
                background: 'var(--accent,#10b981)', color: '#fff', fontSize: '.82rem',
                fontWeight: 600, cursor: 'pointer',
              }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Main FAB */}
      <div style={{ position: 'fixed', bottom: 100, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {/* Sub-mode options when active */}
        {mode && (
          <div style={{ display: 'flex', gap: 6, background: 'var(--card,#1e293b)', border: '1px solid var(--border,#334155)', borderRadius: 10, padding: '6px 8px', boxShadow: '0 4px 16px rgba(0,0,0,.2)', marginBottom: 4 }}>
            <button onClick={() => setSubMode('highlight')} title="高亮"
              style={{
                padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: '.75rem', fontWeight: 600,
                background: subMode === 'highlight' ? 'var(--accent,#10b981)' : 'transparent',
                color: subMode === 'highlight' ? '#fff' : 'var(--text2)', cursor: 'pointer',
              }}>🖍 高亮</button>
            <button onClick={() => setSubMode('erase')} title="擦除"
              style={{
                padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: '.75rem', fontWeight: 600,
                background: subMode === 'erase' ? '#ef4444' : 'transparent',
                color: subMode === 'erase' ? '#fff' : 'var(--text2)', cursor: 'pointer',
              }}>🧹 擦除</button>
          </div>
        )}
        <button className="ann-fab" onClick={() => setMode(m => !m)}
          title={mode ? '退出标注模式' : '标注模式'}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: '2px solid',
            borderColor: mode ? 'var(--accent,#10b981)' : 'var(--border,#334155)',
            background: mode ? 'var(--accent,#10b981)' : 'var(--card,#1e293b)',
            color: mode ? '#fff' : 'var(--text2)', fontSize: '1.1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .2s', flexShrink: 0,
            boxShadow: mode ? '0 0 16px rgba(16,185,129,.4)' : '0 2px 8px rgba(0,0,0,.15)',
          }}>
          {mode ? '✓' : '🖍'}
        </button>
      </div>
    </>
  )
}

function getBorderColor(color) {
  if (!color) return '#fbbf24'
  const s = typeof color === 'string' ? color : (color.bg || '')
  if (s.includes('251,191')) return '#fbbf24'
  if (s.includes('52,211')) return '#34d399'
  if (s.includes('96,165')) return '#60a5fa'
  if (s.includes('248,113')) return '#f87171'
  if (s.includes('167,139')) return '#a78bfa'
  return '#fbbf24'
}

function annsHaveNote(id, pathname) {
  const anns = loadAnnotations(pathname)
  const a = anns.find(x => x.id === id)
  return a && a.note
}

function highlightRange(range, id, color, onOpen) {
  try {
    const mark = document.createElement('span')
    mark.setAttribute('data-ann-id', id)
    const bgColor = color.bg || color
    mark.style.background = bgColor
    mark.style.borderRadius = '3px'
    mark.style.cursor = 'pointer'
    mark.style.transition = 'background .15s'
    mark.addEventListener('mouseenter', () => { mark.style.background = bgColor.replace('0.35', '0.55') })
    mark.addEventListener('mouseleave', () => { mark.style.background = bgColor })
    range.surroundContents(mark)
    // Attach open handler
    mark.addEventListener('click', (e) => {
      e.stopPropagation()
      const anns = loadAnnotations(window.__annPathname || '')
      const ann = anns.find(a => a.id === id)
      if (ann && onOpen) onOpen(ann, e)
    })
  } catch (e) { console.warn('highlightRange', e) }
}

function restoreHighlights(container, pathname, onOpen) {
  window.__annPathname = pathname
  const anns = loadAnnotations(pathname)
  if (!anns.length) return
  const root = container.querySelector('.course-content, .os-ex-container, .cards') || container

  anns.forEach(ann => {
    if (root.querySelector(`[data-ann-id="${ann.id}"]`)) return
    const textNodes = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false)
    while (walker.nextNode()) textNodes.push(walker.currentNode)

    for (const node of textNodes) {
      const idx = node.textContent.indexOf(ann.text)
      if (idx === -1) continue
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + ann.text.length)
        highlightRange(range, ann.id, ann.color, onOpen)
        break
      } catch (e) { /* skip */ }
    }
  })
}

export { COLORS }
