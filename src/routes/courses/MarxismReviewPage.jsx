import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DATA from '../../courses/marxism/reviewData'
import '../../styles/courses/marxism-review.css'

/* ── Item renderers ── */

function ChoiceItem({ item }) {
  return (
    <div className="mr-card mr-choice">
      <div className="mr-card-dot" />
      <div className="mr-card-body">
        <p>{item.text}</p>
        {item.emphasis && (
          <div className="mr-emphasis">
            <span className="mr-emph-icon">💡</span> {item.emphasis}
          </div>
        )}
      </div>
    </div>
  )
}

function EssayItem({ item }) {
  return (
    <div className="mr-card mr-essay">
      <div className="mr-essay-q">
        <span className="mr-essay-q-label">问：</span>
        {item.question}
        {item.emphasis && (
          <div className="mr-emphasis">
            <span className="mr-emph-icon">💡</span> {item.emphasis}
          </div>
        )}
      </div>
      <div className="mr-essay-a">
        <span className="mr-essay-a-label">答：</span>
        <div className="mr-answer-text">{item.answer}</div>
        {item.altAnswer && (
          <details className="mr-alt-wrap">
            <summary className="mr-alt-toggle">💡 备选答题方式</summary>
            <div className="mr-answer-text">{item.altAnswer}</div>
          </details>
        )}
      </div>
    </div>
  )
}

function NoteItem({ item }) {
  return (
    <div className="mr-note">
      <span className="mr-note-icon">📌</span> {item.text}
    </div>
  )
}

function OverviewItem({ item }) {
  return (
    <div className="mr-overview">
      <pre className="mr-overview-pre">{item.lines.join('\n')}</pre>
    </div>
  )
}

function CompareItem({ item }) {
  return (
    <div className="mr-compare-wrap">
      {item.title && <div className="mr-compare-title">{item.title}</div>}
      <div className="mr-compare">
        {item.pairs.map((pair, i) => (
          <div key={i} className={`mr-compare-row ${i === 0 ? 'mr-compare-header' : ''}`}>
            <div className="mr-compare-a">{pair.a}</div>
            <div className="mr-compare-vs">⇄</div>
            <div className="mr-compare-b">{pair.b}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiagramItem({ item }) {
  return (
    <div className="mr-diagram-wrap">
      {item.title && <div className="mr-diagram-title">{item.title}</div>}
      <pre className="mr-diagram-pre">{item.lines.join('\n')}</pre>
    </div>
  )
}

/* ── Section ── */

function ReviewSection({ ch }) {
  const renderItem = (item, i) => {
    switch (item.type) {
      case 'choice-header':
        return (
          <div key={i} className="mr-sub-header">
            <span className="mr-sub-icon">📝</span> {item.text}
          </div>
        )
      case 'essay-header':
        return (
          <div key={i} className="mr-sub-header mr-sub-header-essay">
            <span className="mr-sub-icon">✏️</span> {item.text}
          </div>
        )
      case 'choice':
        return <ChoiceItem key={i} item={item} />
      case 'essay':
        return <EssayItem key={i} item={item} />
      case 'note':
        return <NoteItem key={i} item={item} />
      case 'overview':
        return <OverviewItem key={i} item={item} />
      case 'compare':
        return <CompareItem key={i} item={item} />
      case 'diagram':
        return <DiagramItem key={i} item={item} />
      default:
        return null
    }
  }

  /* Group consecutive overview/diagram items into 2-column grid */
  const renderItems = () => {
    const out = []
    let gridGroup = []

    ch.items.forEach((item, i) => {
      if (item.type === 'overview' || item.type === 'diagram') {
        gridGroup.push({ item, i })
      } else {
        if (gridGroup.length > 0) {
          out.push(
            <div key={`grid-${gridGroup[0].i}`} className="mr-grid-2col">
              {gridGroup.map(({ item, i }) => renderItem(item, i))}
            </div>
          )
          gridGroup = []
        }
        out.push(renderItem(item, i))
      }
    })

    if (gridGroup.length > 0) {
      out.push(
        <div key={`grid-${gridGroup[0].i}`} className="mr-grid-2col">
          {gridGroup.map(({ item, i }) => renderItem(item, i))}
        </div>
      )
    }

    return out
  }

  return (
    <section id={ch.id} className="mr-section">
      <h2 className="mr-section-title">
        <span className="mr-section-icon">{ch.icon}</span>
        {ch.title}
        {ch.subtitle && <span className="mr-section-subtitle">{ch.subtitle}</span>}
      </h2>

      {renderItems()}
    </section>
  )
}

/* ── Page ── */

export default function MarxismReviewPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="mr-page">
      <nav className="mr-nav">
        <Link to="/courses/marxism/" className="mr-back-link">← 返回课程</Link>
        <span className="mr-nav-title">马克思主义基本原理复习提纲</span>
      </nav>

      <div className="mr-layout">
        <button className="mr-sb-toggle" onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? '收起目录' : '展开目录'}>
          {sidebarOpen ? '‹' : '›'}
        </button>

        <aside className={`mr-sidebar ${sidebarOpen ? '' : 'mr-sidebar-hide'}`}>
          <div className="mr-sb-title">📑 目录</div>
          <div className="mr-sb-nav">
            {DATA.map(ch => (
              <a key={ch.id} className="mr-sb-item" href={`#${ch.id}`} onClick={(e) => {
                e.preventDefault()
                document.getElementById(ch.id)?.scrollIntoView({ behavior: 'smooth' })
              }}>
                {ch.icon} {ch.title.replace(/^[ⅠⅡⅢⅣⅤⅥⅦ]+ /, '')}
              </a>
            ))}
          </div>
        </aside>

        <main className="mr-main">
          <header className="mr-header">
            <h1>马克思主义基本原理复习提纲</h1>
            <p className="mr-subtitle">基于老师复习课划出的重点整理 · 选择题 + 大题</p>
          </header>

          {DATA.map(ch => (
            <ReviewSection key={ch.id} ch={ch} />
          ))}

          <footer className="mr-footer">
            <Link to="/courses/marxism/" className="mr-footer-link">← 返回马克思主义基本原理课程</Link>
            <Link to="/" className="mr-footer-link">← 返回首页</Link>
          </footer>
        </main>
      </div>
    </div>
  )
}
