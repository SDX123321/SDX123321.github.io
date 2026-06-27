import { useParams, Link } from 'react-router-dom'

const COURSE_META = {
  probability: { name: '概率论与数理统计', color: '#2563eb' },
  os:          { name: '操作系统',         color: '#10b981' },
  algorithm:   { name: '算法设计与分析',   color: '#7c3aed' },
  dsp:         { name: '数字信号处理',     color: '#6c63ff' },
  marxism:     { name: '马克思主义基本原理', color: '#e63946' },
  calculus:    { name: '高等数学（重修）',   color: '#e74c3c' },
  maogai:      { name: '毛泽东思想概论',   color: '#dc2626' },
}

export default function CourseLayout() {
  const { courseId } = useParams()
  const meta = COURSE_META[courseId]

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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar placeholder */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, width: 260, height: '100vh',
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        color: '#e2e8f0', overflowY: 'auto', padding: '20px 0', zIndex: 100,
      }}>
        <div style={{ textAlign: 'center', padding: '10px 16px 20px', fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid #334155', marginBottom: 10, color: '#f8fafc' }}>
          {meta.name}
        </div>
        <Link to="/site/" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', color: 'var(--accent)', fontSize: 13, textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>
          ← 返回课程主页
        </Link>
        <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: '.85rem', textAlign: 'center' }}>
          课程内容正在迁移中…<br />请先使用旧版页面
        </div>
      </nav>

      {/* Main content */}
      <main style={{ marginLeft: 260, padding: '30px 40px 60px', maxWidth: 1000, flex: 1 }}>
        <h1 style={{ fontSize: '2rem', color: meta.color, marginBottom: 8 }}>{meta.name}</h1>
        <p style={{ color: 'var(--text-light)', marginBottom: 24 }}>课程内容正在从旧版迁移至 React SPA…</p>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <p style={{ color: 'var(--text)', fontSize: '.92rem' }}>
            Phase 1 完成后，此页面将包含完整的课程内容、测验、交互工具和评论区。
          </p>
        </div>

        <div className="footer" style={{ marginTop: 40 }}>
          Built with ❤️ · <a href="https://github.com/SDX123321" target="_blank" rel="noreferrer">@SDX123321</a>
        </div>
      </main>
    </div>
  )
}
