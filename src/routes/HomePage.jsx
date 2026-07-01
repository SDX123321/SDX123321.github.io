import { useState, useEffect, useRef } from 'react'
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
  { path: 'os', icon: '💻', title: '操作系统', desc: '操作系统概述、处理器管理（进程/调度/PV 操作/死锁）、存储管理（分页/分段/页面置换）、设备管理、文件系统。', tags: ['5 章','PV 操作','调度算法','银行家算法'], iconClass: 'icon-green', subLinks: [
    { to: '/courses/os/exercises', label: '📝 习题解答' },
  ] },
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
  const [sortedCourses, setSortedCourses] = useState(COURSES)
  const containerRef = useGsapAnimations(totalStudyTime)
  const sortRef = useRef(false)

  useScrollMemory()
  useEffect(() => { loadBusuanzi() }, [])

  // Load giscus dynamically (script tag in JSX doesn't execute)
  useEffect(() => {
    const container = document.querySelector('.giscus-wrap')
    if (!container || container.querySelector('script')) return
    const script = document.createElement('script')
    script.src = 'https://giscus.app/client.js'
    script.setAttribute('data-repo', 'SDX123321/SDX123321.github.io')
    script.setAttribute('data-repo-id', 'R_kgDONOvdMA')
    script.setAttribute('data-category', 'Announcements')
    script.setAttribute('data-category-id', 'DIC_kwDONOvdMM4C__x3')
    script.setAttribute('data-mapping', 'pathname')
    script.setAttribute('data-strict', '0')
    script.setAttribute('data-reactions-enabled', '1')
    script.setAttribute('data-emit-metadata', '0')
    script.setAttribute('data-input-position', 'top')
    script.setAttribute('data-theme', 'preferred_color_scheme')
    script.setAttribute('data-lang', 'zh-CN')
    script.crossOrigin = 'anonymous'
    script.async = true
    container.appendChild(script)
  }, [])

  // Dynamic course ordering based on saved exam schedule
  useEffect(() => {
    if (sortRef.current) return
    const classId = localStorage.getItem('exam_class_id')
    if (!classId) { setSortedCourses(COURSES); return }

    const courseKeys = {
      os: ['操作系统'], algorithm: ['算法'], signals: ['信号与系统'],
      dsp: ['数字信号处理'], calculus: ['高等数学'], marxism: ['马克思主义'],
      probability: ['概率论'], maogai: ['毛泽东'],
    }

    // Parse deleted exams to deprioritize courses the user hid
    const deletedCourses = new Set()
    try {
      const raw = localStorage.getItem('exam_deleted')
      if (raw) {
        const delMap = JSON.parse(raw)
        const list = delMap[classId]
        if (Array.isArray(list)) {
          list.forEach(entry => {
            const courseName = entry.split('|')[0]
            for (const [path, keys] of Object.entries(courseKeys)) {
              if (keys.some(k => courseName.includes(k))) deletedCourses.add(path)
            }
          })
        }
      }
    } catch (e) {}

    const load = (data) => {
      const exams = data[classId]
      if (!exams) { setSortedCourses(COURSES); return }
      const now = new Date()
      const withDate = COURSES.map(c => {
        const keys = courseKeys[c.path] || []
        let earliest = null
        for (const e of exams) {
          if (!keys.some(k => e.course.includes(k))) continue
          const dt = new Date(e.iso)
          if (dt > now && (!earliest || dt < earliest)) earliest = dt
        }
        return { ...c, _examDate: earliest, _deprioritized: deletedCourses.has(c.path), _noExam: !earliest || deletedCourses.has(c.path) }
      })
      withDate.sort((a, b) => {
        if (a._deprioritized && !b._deprioritized) return 1
        if (!a._deprioritized && b._deprioritized) return -1
        if (a._examDate && b._examDate) return a._examDate - b._examDate
        if (a._examDate) return -1
        if (b._examDate) return 1
        return 0
      })
      setSortedCourses(withDate)
      sortRef.current = true
    }

    // Try window cache first, then fetch
    if (window.EXAM_SCHEDULE_DATA) { load(window.EXAM_SCHEDULE_DATA); return }
    fetch('/files/exam-schedule.json').then(r => r.json()).then(load).catch(() => {
      const script = document.createElement('script')
      script.src = '/files/exam-schedule-data.js'
      script.onload = () => { if (window.EXAM_SCHEDULE_DATA) load(window.EXAM_SCHEDULE_DATA) }
      document.head.appendChild(script)
    })
  }, [])

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
        {sortedCourses.map(c => (
          <div key={c.path} className="card-wrap">
            <div className={`card${c._noExam ? ' card-no-exam' : ''}`} style={c.style}>
              <Link to={`/courses/${c.path}/`} className="card-body">
                <div className={`icon ${c.iconClass || ''}`} style={c.iconStyle}>{c.icon}</div>
                <h2>{c.title}</h2>
                <p>{c.desc}</p>
                <div className="tags">
                  {c.tags.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </Link>
              <div className="card-actions">
                <Link to={`/courses/${c.path}/`} className="card-action-btn card-action-main">进入课程 →</Link>
                {c.subLinks?.map(link => (
                  <Link key={link.to} to={link.to} className="card-action-btn card-action-sub">
                    {link.label.replace('📝 ', '')} →
                  </Link>
                ))}
              </div>
            </div>
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
      <div className="comment-section">
        <h2>💬 评论区</h2>
        <div className="giscus-wrap">
          <div className="giscus" />
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
