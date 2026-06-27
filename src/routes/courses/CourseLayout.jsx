import { useParams, Link } from 'react-router-dom'
import { useEffect, useRef, lazy, Suspense } from 'react'
import useScrollMemory from '../../hooks/useScrollMemory'
import { loadBusuanzi } from '../../lib/cdnScripts'
import { useTheme } from '../../features/theme/ThemeContext'
import WrongBookFAB from '../../features/wrong-book/WrongBookFAB'
import RandomQuizFAB from '../../features/random-quiz/RandomQuizFAB'
import FormulaRefFAB from '../../features/formula-ref/FormulaRefFAB'
import PrintModeFAB from '../../features/print-mode/PrintModeFAB'
import KeyboardShortcuts from '../../features/ux/KeyboardShortcuts'

const COURSE_META = {
  probability: { name: '概率论与数理统计', color: '#2563eb', icon: '📊' },
  os:          { name: '操作系统',         color: '#10b981', icon: '💻' },
  algorithm:   { name: '算法设计与分析',   color: '#7c3aed', icon: '🔬' },
  dsp:         { name: '数字信号处理',     color: '#6c63ff', icon: '📡' },
  marxism:     { name: '马克思主义基本原理', color: '#e63946', icon: '📰' },
  calculus:    { name: '高等数学（重修）',   color: '#e74c3c', icon: '📈' },
  maogai:      { name: '毛泽东思想概论',   color: '#dc2626', icon: '📰' },
}

// Lazy-loaded course page components
const COURSE_PAGES = {
  probability: lazy(() => import('./ProbabilityPage')),
  os:          lazy(() => import('./OsPage')),
  algorithm:   lazy(() => import('./AlgorithmPage')),
  dsp:         lazy(() => import('./DspPage')),
  marxism:     lazy(() => import('./MarxismPage')),
  calculus:    lazy(() => import('./CalculusPage')),
  maogai:      lazy(() => import('./MaogaiPage')),
}

export default function CourseLayout() {
  const { courseId } = useParams()
  const meta = COURSE_META[courseId]
  const PageComponent = COURSE_PAGES[courseId]
  const mainRef = useRef(null)

  useScrollMemory()
  const { toggleTheme } = useTheme()

  // Load busuanzi counter
  useEffect(() => { loadBusuanzi() }, [])

  // Update sidebar title when course changes
  useEffect(() => {
    if (!meta) return
    document.title = `${meta.name} - 期末复习`
    // Update sidebar title
    const titleEl = document.querySelector('.sidebar-title')
    if (titleEl) {
      titleEl.innerHTML = `${meta.icon} ${meta.name}`
    }
  }, [courseId, meta])

  if (!meta || !PageComponent) {
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
          <div className="nav-group-title">加载中…</div>
        </div>
      </nav>

      {/* Sidebar overlay (mobile) */}
      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector('.sidebar')?.classList.remove('open')
          document.querySelector('.sidebar-overlay')?.classList.remove('show')
        }}
      />

      {/* Main content */}
      <main className="main" ref={mainRef}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>
            <p>加载课程内容…</p>
          </div>
        }>
          <PageComponent />
        </Suspense>
      </main>

      {/* Shared feature FABs */}
      <WrongBookFAB />
      <RandomQuizFAB />
      <FormulaRefFAB />
      <PrintModeFAB />
      <KeyboardShortcuts onToggleTheme={toggleTheme} />

      {/* Back to top */}
      <div
        className="back-top"
        id="backTop"
        style={{ display: 'none' }}
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
