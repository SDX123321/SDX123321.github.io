import { useParams, Link, Outlet } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import useScrollMemory from '../../hooks/useScrollMemory'
import usePageId from '../../hooks/usePageId'

const COURSE_META = {
  probability: { name: '概率论与数理统计', color: '#2563eb', icon: '📊', chapters: 8 },
  os:          { name: '操作系统',         color: '#10b981', icon: '💻', chapters: 5 },
  algorithm:   { name: '算法设计与分析',   color: '#7c3aed', icon: '🔬', chapters: 6 },
  dsp:         { name: '数字信号处理',     color: '#6c63ff', icon: '📡', chapters: 6 },
  marxism:     { name: '马克思主义基本原理', color: '#e63946', icon: '📰', chapters: 7 },
  calculus:    { name: '高等数学（重修）',   color: '#e74c3c', icon: '📈', chapters: 5 },
  maogai:      { name: '毛泽东思想概论',   color: '#dc2626', icon: '📰', chapters: 1 },
}

export default function CourseLayout() {
  const { courseId } = useParams()
  const pageId = usePageId()
  const meta = COURSE_META[courseId]
  const mainRef = useRef(null)

  // Restore scroll position on navigation
  useScrollMemory()

  // Sidebar highlight via IntersectionObserver
  useEffect(() => {
    if (!mainRef.current) return
    const ids = mainRef.current.querySelectorAll('[id]')
    if (!ids.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id
            document.querySelectorAll('.sidebar a').forEach(a => {
              a.classList.toggle('active', a.getAttribute('href') === '#' + id)
            })
          }
        })
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )

    ids.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [courseId])

  if (!meta) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 12 }}>课程未找到</h1>
        <p style={{ color: 'var(--text-light)' }}>「{courseId}」尚未迁移至新版</p>
        <Link to="/site/" style={{ color: 'var(--accent)', marginTop: 16, display: 'inline-block' }}>← 返回首页</Link>
      </div>
    )
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="nav-toggle"
        onClick={() => document.querySelector('.sidebar')?.classList.toggle('open')}
        aria-label="打开菜单"
      >
        &#9776;
      </button>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="fill" id="progress" />
      </div>

      {/* Sidebar */}
      <nav className="sidebar" id="sidebar">
        <div className="sidebar-title">
          {meta.icon} {meta.name}
          <small>{meta.chapters} 章</small>
        </div>
        <Link
          to="/site/"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', color: 'var(--accent)',
            fontSize: 13, textDecoration: 'none',
            borderBottom: '1px solid var(--border)',
          }}
        >
          ← 返回课程主页
        </Link>
        <div className="nav-group">
          <div className="nav-group-title">内容加载中…</div>
        </div>
      </nav>

      {/* Main content area */}
      <main className="main" ref={mainRef}>
        <Outlet />
      </main>

      {/* Back to top */}
      <div
        className="back-top"
        id="backTop"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </div>

      {/* Visitor counter bar */}
      <div style={{
        position: 'fixed', bottom: 12, left: 286,
        background: 'rgba(26,29,46,.9)', padding: '6px 14px',
        borderRadius: 20, fontSize: '.75rem', color: 'var(--text-dim)',
        zIndex: 80, border: '1px solid var(--border)', backdropFilter: 'blur(8px)',
      }}>
        <span id="busuanzi_container_site_pv">
          👁 <span id="busuanzi_value_site_pv">...</span>
        </span>
        {' · '}
        <span id="busuanzi_container_page_pv">
          📄 <span id="busuanzi_value_page_pv">...</span>
        </span>
        {' '}
        <a
          href={`https://github.com/SDX123321/SDX123321.github.io/issues/new?title=${encodeURIComponent(meta.name + '页面反馈')}&body=${encodeURIComponent('问题描述：')}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#fbbf24', textDecoration: 'none', marginLeft: 4 }}
          title="提交建议或反馈"
        >
          💬 反馈
        </a>
      </div>
    </>
  )
}
