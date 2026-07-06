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
import PageSearch from '../../features/search/PageSearch'
import ChapterProgress from '../../features/ux/ChapterProgress'
import CrossLinks from '../../features/cross-links/CrossLinks'
import AnnotationOverlay from '../../features/annotation/AnnotationOverlay'
import '../../styles/course-layout.css'

const COURSE_META = {
  probability: { name: '概率论与数理统计', color: '#2563eb', icon: '统' },
  os: { name: '操作系统', color: '#10b981', icon: 'OS' },
  algorithm: { name: '算法设计与分析', color: '#7c3aed', icon: '算' },
  dsp: { name: '数字信号处理', color: '#6c63ff', icon: 'DSP' },
  marxism: { name: '马克思主义基本原理', color: '#e63946', icon: '马' },
  calculus: { name: '高等数学（重修）', color: '#e74c3c', icon: '∫' },
  maogai: { name: '毛泽东思想概论', color: '#dc2626', icon: '概' },
  signals: { name: '信号与系统', color: '#06b6d4', icon: '信' },
  gaokao: { name: '江苏高考真题基因库', color: '#2563eb', icon: '高' },
}

const COURSE_PAGES = {
  probability: lazy(() => import('./ProbabilityPage')),
  os: lazy(() => import('./OsPage')),
  algorithm: lazy(() => import('./AlgorithmPage')),
  dsp: lazy(() => import('./DspPage')),
  marxism: lazy(() => import('./MarxismPage')),
  calculus: lazy(() => import('./CalculusPage')),
  maogai: lazy(() => import('./MaogaiPage')),
  signals: lazy(() => import('./SignalsPage')),
  gaokao: lazy(() => import('./GaokaoPage')),
}

export default function CourseLayout() {
  const { courseId } = useParams()
  const meta = COURSE_META[courseId]
  const PageComponent = COURSE_PAGES[courseId]
  const mainRef = useRef(null)
  const { toggleTheme } = useTheme()

  useScrollMemory()
  useEffect(() => { loadBusuanzi() }, [])

  useEffect(() => {
    if (!meta) return
    document.title = `${meta.name} - 期末复习`
    const iconEl = document.querySelector('.sidebar-brand-icon')
    const titleEl = document.querySelector('.sidebar-brand-title')
    if (iconEl) iconEl.textContent = meta.icon
    if (titleEl) titleEl.textContent = meta.name
  }, [courseId, meta])

  if (!meta || !PageComponent) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text)' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 12 }}>课程未找到</h1>
        <p style={{ color: 'var(--text-light)' }}>“{courseId}”尚未迁移至新版课程体系。</p>
        <Link to="/" style={{ color: 'var(--accent)', marginTop: 16, display: 'inline-block' }}>返回首页</Link>
      </div>
    )
  }

  return (
    <>
      <button
        className="nav-toggle"
        onClick={() => {
          document.querySelector('.course-sidebar')?.classList.toggle('open')
          document.querySelector('.sidebar-overlay')?.classList.toggle('show')
        }}
        aria-label="打开菜单"
      >
        &#9776;
      </button>

      <div className="progress-bar">
        <div className="fill" id="progress" />
      </div>

      <nav className={`course-sidebar sidebar ${courseId}`} id="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">{meta.icon}</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-title">{meta.name}</span>
            <span className="sidebar-brand-sub">{courseId === 'gaokao' ? '高中内容' : '大学内容'}</span>
          </div>
        </div>
        <Link to="/" className="sidebar-back">
          <span className="sidebar-back-icon">←</span>
          <span>返回课程主页</span>
        </Link>
        <div className="nav-group">
          <div className="nav-group-title">加载中</div>
        </div>
      </nav>

      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector('.course-sidebar')?.classList.remove('open')
          document.querySelector('.sidebar-overlay')?.classList.remove('show')
        }}
      />

      <main className={`course-main main ${courseId}`} ref={mainRef}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>
            <p>加载课程内容中...</p>
          </div>
        }>
          <PageComponent />
        </Suspense>
      </main>

      <WrongBookFAB />
      <RandomQuizFAB />
      <FormulaRefFAB />
      <PrintModeFAB />
      <KeyboardShortcuts onToggleTheme={toggleTheme} />
      <PageSearch />
      <ChapterProgress />
      <CrossLinks />
      <AnnotationOverlay containerRef={mainRef} />

      <div
        className="back-top"
        id="backTop"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </div>

      <div
        className="visitor-bar"
        style={{
          position: 'fixed',
          bottom: 12,
          left: 286,
          padding: '6px 14px',
          borderRadius: 20,
          fontSize: '.75rem',
          zIndex: 80,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span id="busuanzi_container_site_pv">
          总访问 <span id="busuanzi_value_site_pv">...</span>
        </span>
        {' · '}
        <span id="busuanzi_container_page_pv">
          本页 <span id="busuanzi_value_page_pv">...</span>
        </span>
        {' '}
        <a
          href={`https://github.com/SDX123321/SDX123321.github.io/issues/new?title=${encodeURIComponent(meta.name + '页面反馈')}&body=${encodeURIComponent('问题描述：')}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#fbbf24', textDecoration: 'none', marginLeft: 4 }}
          title="提交建议或反馈"
        >
          反馈
        </a>
      </div>
    </>
  )
}
