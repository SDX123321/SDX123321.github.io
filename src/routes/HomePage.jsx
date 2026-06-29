import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/homepage.css'
import GlobalSearch from '../features/search/GlobalSearch'
import ExamQuery from '../features/exam/ExamQuery'
import FileBrowser from '../features/files/FileBrowser'
import SplashModal from '../features/home/SplashModal'
import MeteorShower from '../features/ux/MeteorShower'
import FireworkCanvas from '../features/ux/FireworkCanvas'
import { useGsapAnimations } from '../hooks/useGsapAnimations'
import useScrollMemory from '../hooks/useScrollMemory'
import { loadBusuanzi } from '../lib/cdnScripts'

const COURSES = [
  { path: 'probability', icon: '📊', title: '概率论与数理统计', desc: '随机事件与概率、随机变量及其分布、多维随机变量、数字特征、大数定律与中心极限定理、参数估计、假设检验。', tags: ['7 章','公式速查表','经典例题','考试重点'], iconClass: 'icon-blue' },
  { path: 'os', icon: '💻', title: '操作系统', desc: '操作系统概述、处理器管理（进程/调度/PV 操作/死锁）、存储管理（分页/分段/页面置换）、设备管理、文件系统。', tags: ['5 章','PV 操作','调度算法','银行家算法'], iconClass: 'icon-green' },
  { path: 'algorithm', icon: '🔬', title: '算法设计与分析', desc: '算法概述、分治法、动态规划、贪心算法、回溯法、分支限界法。含算法可视化演示与经典例题详解。', tags: ['6 章','可视化','代码演示','复杂度分析'], iconClass: 'icon-purple', subLinks: [
    { to: '/courses/algorithm/exercises', label: '📝 习题解答' },
  ] },
  { path: 'dsp', icon: '📡', title: '数字信号处理', desc: '离散时间信号与系统、Z 变换、DFT/FFT、数字滤波器设计。含蝶形运算图解与互动练习。', tags: ['4 章','FFT 图解','互动练习','MathJax'], style: { borderLeft: '3px solid #00d2ff' }, iconStyle: { background: 'linear-gradient(135deg,#6c63ff,#00d2ff)' } },
  { path: 'marxism', icon: '📰', title: '马克思主义基本原理', desc: '唯物辩证法、认识论、唯物史观、资本主义本质与规律、社会主义发展。含互动复习与知识卡片。', tags: ['7 章','互动复习','知识卡片','暗色模式'], style: { borderLeft: '3px solid #e63946' }, iconStyle: { background: 'linear-gradient(135deg,#e63946,#f4845f)' } },
  { path: 'maogai', icon: '📰', title: '毛泽东思想和中国特色社会主义理论体系概论', desc: '毛泽东思想、邓小平理论、"三个代表"、科学发展观、习近平新时代中国特色社会主义思想。含复习提纲与考试重点。', tags: ['复习提纲','考试重点'], style: { borderLeft: '3px solid #dc2626' }, iconStyle: { background: 'linear-gradient(135deg,#dc2626,#f87171)' } },
  { path: 'calculus', icon: '📈', title: '高等数学（重修）', desc: '常微分方程、多元函数微分（偏导/复合函数/极值）、多元积分（重积分/格林公式/高斯公式）、复变函数（可导性/柯西积分公式）。', tags: ['5 大专题','复习课笔记','考试分值','互动练习'], style: { borderLeft: '3px solid #e74c3c' }, iconStyle: { background: 'linear-gradient(135deg,#e74c3c,#f39c12)' } },
  { path: 'signals', icon: '📶', title: '信号与系统B', desc: '信号与系统基本概念、连续/离散时域分析、傅里叶变换、拉普拉斯变换、Z 变换。含核心公式速查、典型例题与互动练习。', tags: ['6 章','公式速查','互动练习','MathJax'], style: { borderLeft: '3px solid #06b6d4' }, iconStyle: { background: 'linear-gradient(135deg,#06b6d4,#22d3ee)' } },
]

export default function HomePage() {
  const [totalStudyTime, setTotalStudyTime] = useState(null)
  const containerRef = useGsapAnimations(totalStudyTime)

  useScrollMemory()
  useEffect(() => { loadBusuanzi() }, [])

  useEffect(() => {
    // Aggregate study time from all pages
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('dwell_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key))
          if (data && typeof data === 'object') {
            Object.values(data).forEach(v => { if (typeof v === 'number') total += v })
          }
        } catch (e) {}
      }
    }
    if (total > 60) {
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      setTotalStudyTime(h > 0 ? `${h}小时${m}分钟` : `${m}分钟`)
    }
  }, [])

  return (
    <>
      <MeteorShower />
      <FireworkCanvas />
      <div className="container" ref={containerRef}>
      <h1>期末复习</h1>
      <p className="subtitle">2025-2026 学年第二学期 · 知识点总结与例题精讲</p>

      {/* Global search */}
      <GlobalSearch />

      {/* Exam schedule query */}
      <ExamQuery />

      {/* Study time */}
      {totalStudyTime && (
        <div className="study-time-badge" style={{ maxWidth: 560, margin: '0 auto 28px', padding: '14px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
          <span style={{ fontSize: '1.3rem' }}>📖</span>
          <span style={{ fontSize: '.92rem', color: 'var(--text)', fontWeight: 600, marginLeft: 8 }}>累计学习时间</span>
          <span style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 700, marginLeft: 8 }}>{totalStudyTime}</span>
        </div>
      )}

      {/* Course cards */}
      <div className="cards">
        {COURSES.map(c => (
          <div key={c.path} className="card-wrap">
            <Link className="card" to={`/courses/${c.path}/`} style={c.style}>
              <div className={`icon ${c.iconClass || ''}`} style={c.iconStyle}>{c.icon}</div>
              <h2>{c.title}</h2>
              <p>{c.desc}</p>
              <div className="tags">
                {c.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </Link>
            {c.subLinks && (
              <div className="card-sublinks">
                {c.subLinks.map(link => (
                  <Link key={link.to} to={link.to} className="card-sublink">{link.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* File download section */}
      <div className="file-section" style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: '1.15rem', color: 'var(--text)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          📥 资料下载
        </h2>
        <FileBrowser />
      </div>

      {/* Giscus comments */}
      <div className="comment-section" style={{ maxWidth: 800, margin: '0 auto 32px', padding: '0 20px' }}>
        <h2 style={{ fontSize: '1.15rem', color: 'var(--text)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          💬 评论区
        </h2>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, minHeight: 200 }}>
          <div className="giscus" />
          <script
            src="https://giscus.app/client.js"
            data-repo="SDX123321/SDX123321.github.io"
            data-repo-id="R_kgDONOvdMA"
            data-category="Announcements"
            data-category-id="DIC_kwDONOvdMM4C__x3"
            data-mapping="pathname"
            data-strict="0"
            data-reactions-enabled="1"
            data-emit-metadata="0"
            data-input-position="top"
            data-theme="preferred_color_scheme"
            data-lang="zh-CN"
            crossOrigin="anonymous"
            async
          />
        </div>
      </div>

      <div className="footer">
        <div className="footer-stats">
          <span id="busuanzi_container_site_pv">
            👁 本站总访问 <span id="busuanzi_value_site_pv">...</span> 次
          </span>
          <span style={{ margin: '0 8px' }}>·</span>
          <span id="busuanzi_container_site_uv">
            👤 访客 <span id="busuanzi_value_site_uv">...</span> 人
          </span>
        </div>
        Built with ❤️ · <a href="https://github.com/SDX123321" target="_blank" rel="noreferrer">@SDX123321</a>
        <br />
        <SplashModal />
      </div>
    </div>
    </>
  )
}
