import { useState, useMemo } from 'react'
import { FILES } from '../../data/files'

const TYPE_MAP = {
  exam: '历年试卷', review: '复习资料', answer: '参考答案',
  textbook: '电子课本', slides: '课件', homework: '作业', lab: '实验',
}

export default function FileBrowser() {
  const [subject, setSubject] = useState('')
  const [type, setType] = useState('')
  const [previewFile, setPreviewFile] = useState(null)

  const subjects = useMemo(() => {
    const seen = new Set()
    return FILES.reduce((acc, f) => {
      if (!seen.has(f.s)) { seen.add(f.s); acc.push({ slug: f.s, name: f.sn }) }
      return acc
    }, [])
  }, [])

  const filtered = useMemo(() => {
    return FILES.filter(f => (!subject || f.s === subject) && (!type || f.t === type))
  }, [subject, type])

  const downloadFile = (f, e) => {
    e.stopPropagation()
    if (f.t === 'textbook') {
      if (confirm('该电子课本仅供个人学习交流使用，不得用于商业用途。是否继续？')) {
        window.open('/' + f.p, '_blank')
      }
      return
    }
    window.open('/' + f.p, '_blank')
  }

  const openPreview = (f, e) => {
    e.stopPropagation()
    setPreviewFile(f)
  }

  const getPreviewUrl = (f) => {
    if (f.p.endsWith('.pptx') || f.p.endsWith('.docx')) {
      return `https://docs.google.com/gview?url=${encodeURIComponent(window.location.origin + '/' + f.p)}&embedded=true`
    }
    return '/' + f.p
  }

  return (
    <>
      <div>
        {/* Filter bar */}
        <div id="filterBar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.78rem', color: 'var(--text3)', fontWeight: 600 }}>学科：</span>
            <button onClick={() => setSubject('')} className={`filter-btn${subject === '' ? ' active' : ''}`} data-g="s" data-v="">全部</button>
            {subjects.map(s => (
              <button key={s.slug} onClick={() => setSubject(s.slug)}
                className={`filter-btn${subject === s.slug ? ' active' : ''}`}
                data-g="s" data-v={s.slug}>{s.name}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.78rem', color: 'var(--text3)', fontWeight: 600 }}>类型：</span>
            <button onClick={() => setType('')} className={`filter-btn${type === '' ? ' active' : ''}`} data-g="t" data-v="">全部</button>
            {Object.entries(TYPE_MAP).map(([k, name]) => (
              <button key={k} onClick={() => setType(k)}
                className={`filter-btn${type === k ? ' active' : ''}`}
                data-g="t" data-v={k}>{name}</button>
            ))}
          </div>
        </div>

        <div id="fileCount" style={{ fontSize: '.8rem', color: 'var(--text3)', marginBottom: 10 }}>
          共 {filtered.length} 个文件
        </div>

        {/* File grid */}
        <div id="fileList" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 10, maxHeight: 480, overflowY: 'auto', paddingRight: 4,
        }}>
          {filtered.map((f, i) => (
            <div className="file-card" key={i} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '.72rem', fontWeight: 700,
                  background: f.c + '20', color: f.c, flexShrink: 0,
                }}>{f.tn.slice(0, 2)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: '.88rem', fontWeight: 600, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.n}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text3)', marginTop: 2 }}>
                    <span style={{ background: f.c + '20', color: f.c, padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>{f.sn}</span>
                    {f.sz}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <button className="dl-btn dl-btn-preview"
                  onClick={e => openPreview(f, e)}>预览</button>
                <button className="dl-btn dl-btn-download"
                  onClick={e => downloadFile(f, e)}>下载</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {previewFile && (
        <div onClick={() => setPreviewFile(null)} style={{
          display: 'flex', position: 'fixed', inset: 0,
          zIndex: 10000, background: 'rgba(0,0,0,.7)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card,#1e293b)', borderRadius: 16, padding: 20,
            maxWidth: '90vw', width: 900, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border,#334155)',
            boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '.9rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                📄 {previewFile.n}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <a href={getPreviewUrl(previewFile)} target="_blank" rel="noreferrer" style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text2)', fontSize: '.78rem',
                  textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>↗ 新窗口打开</a>
                <button onClick={() => setPreviewFile(null)} style={{
                  background: 'none', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1,
                }}>&times;</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', borderRadius: 8 }}>
              {previewFile.p.endsWith('.pptx') || previewFile.p.endsWith('.docx') ? (
                <iframe
                  src={getPreviewUrl(previewFile)}
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
                  title={previewFile.n}
                />
              ) : (
                <iframe
                  src={getPreviewUrl(previewFile)}
                  style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
                  title={previewFile.n}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
