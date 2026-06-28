import { useState } from 'react'

export default function FilePreview({ fileUrl, fileName, onClose }) {
  const [loading, setLoading] = useState(true)
  const [docxHtml, setDocxHtml] = useState('')
  const isPptx = fileUrl?.endsWith('.pptx')
  const isDocx = fileUrl?.endsWith('.docx')
  const gviewUrl = `https://docs.google.com/gview?url=${encodeURIComponent(window.location.origin + '/site/' + fileUrl)}&embedded=true`

  // Load mammoth for DOCX
  if (isDocx && !docxHtml && !loading) {
    setLoading(true)
    if (window.mammoth) {
      fetch('/site/' + fileUrl)
        .then(r => r.arrayBuffer())
        .then(buf => window.mammoth.convertToHtml({ arrayBuffer: buf }))
        .then(r => { setDocxHtml(r.value); setLoading(false) })
        .catch(() => { setLoading(false) })
    }
  }

  if (!fileUrl && !fileName) return null

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }} style={{
      display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10000, background: 'rgba(0,0,0,.7)', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--card,#1e293b)', borderRadius: 16, padding: 20,
        maxWidth: '90vw', width: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border,#334155)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📄 {fileName || (isPptx ? 'PPTX 预览' : 'DOCX 预览')}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 400 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中…</div>}
          {!loading && isPptx && (
            <iframe src={gviewUrl} style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }} title="PPTX Preview" />
          )}
          {!loading && isDocx && (
            docxHtml ? <div dangerouslySetInnerHTML={{ __html: docxHtml }} style={{ padding: 20, background: '#fff', color: '#333', borderRadius: 8 }} />
              : <iframe src={gviewUrl} style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }} title="DOCX Preview" />
          )}
          {!isPptx && !isDocx && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>不支持的文件格式</div>
          )}
        </div>
      </div>
    </div>
  )
}
