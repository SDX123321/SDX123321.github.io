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

const HIGH_SCHOOL_COURSES = [
  {
    path: 'gaokao',
    icon: 'book',
    title: '江苏高考真题基因库',
    desc: '整理近十年江苏高考与新高考全国一卷资料，按科目、年份、题型和命题趋势做互动式学习页。',
    tags: ['高中内容', '江苏高考', '十年真题', '全科分析'],
    style: { borderLeft: '3px solid #2563eb' },
    iconStyle: { background: 'linear-gradient(135deg,#2563eb,#dc2626)' },
  },
]

const UNIVERSITY_COURSES = [
  {
    path: 'probability',
    icon: 'chart',
    title: '概率论与数理统计',
    desc: '随机事件与概率、随机变量及其分布、多维随机变量、数字特征、大数定律与中心极限定理、参数估计、假设检验。',
    tags: ['7 章', '公式速查', '经典例题', '考试重点'],
    iconClass: 'icon-blue',
  },
  {
    path: 'os',
    icon: 'terminal',
    title: '操作系统',
    desc: '操作系统概述、处理器管理、存储管理、设备管理、文件系统。包含进程调度、PV 操作、死锁与页面置换。',
    tags: ['5 章', 'PV 操作', '调度算法', '页面置换'],
    iconClass: 'icon-green',
    subLinks: [{ to: '/courses/os/exercises', label: '习题解答' }],
  },
  {
    path: 'algorithm',
    icon: 'nodes',
    title: '算法设计与分析',
    desc: '算法概述、分治法、动态规划、贪心算法、回溯法、分支限界法，含可视化演示与经典例题详解。',
    tags: ['6 章', '可视化', '代码演示', '复杂度分析'],
    iconClass: 'icon-purple',
    subLinks: [{ to: '/courses/algorithm/exercises', label: '习题解答' }],
  },
  {
    path: 'dsp',
    icon: 'wave',
    title: '数字信号处理',
    desc: '离散时间信号与系统、Z 变换、DFT/FFT、数字滤波器设计，含蝶形运算图解与互动练习。',
    tags: ['4 章', 'FFT 图解', '互动练习', 'MathJax'],
    style: { borderLeft: '3px solid #00d2ff' },
    iconStyle: { background: 'linear-gradient(135deg,#6c63ff,#00d2ff)' },
    subLinks: [{ to: '/courses/dsp/exercises', label: '习题解答' }],
  },
  {
    path: 'marxism',
    icon: 'book',
    title: '马克思主义基本原理',
    desc: '唯物辩证法、认识论、唯物史观、资本主义本质与规律、社会主义发展，含互动复习与知识卡片。',
    tags: ['7 章', '互动复习', '知识卡片', '暗色模式'],
    style: { borderLeft: '3px solid #e63946' },
    iconStyle: { background: 'linear-gradient(135deg,#e63946,#f4845f)' },
    subLinks: [{ to: '/courses/marxism/review', label: '复习提纲' }],
  },
  {
    path: 'maogai',
    icon: 'book',
    title: '毛泽东思想和中国特色社会主义理论体系概论',
    desc: '毛泽东思想、邓小平理论、“三个代表”、科学发展观、习近平新时代中国特色社会主义思想。',
    tags: ['复习提纲', '考试重点'],
    style: { borderLeft: '3px solid #dc2626' },
    iconStyle: { background: 'linear-gradient(135deg,#dc2626,#f87171)' },
  },
  {
    path: 'calculus',
    icon: 'sigma',
    title: '高等数学（重修）',
    desc: '常微分方程、多元函数微分、多元积分、复变函数，含复习课笔记、考试分值和互动练习。',
    tags: ['5 大专题', '复习笔记', '考试分析', '互动练习'],
    style: { borderLeft: '3px solid #e74c3c' },
    iconStyle: { background: 'linear-gradient(135deg,#e74c3c,#f39c12)' },
  },
  {
    path: 'dmath',
    icon: 'logic',
    title: '离散数学基础',
    desc: '命题逻辑、一阶逻辑、集合论、二元关系与函数，含核心定义、公式、定理和经典例题。',
    tags: ['4 章', '核心公式', '等价关系', 'MathJax'],
    style: { borderLeft: '3px solid #8b5cf6' },
    iconStyle: { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' },
    subLinks: [{ to: '/courses/dmath/review', label: '复习' }],
  },
  {
    path: 'signals',
    icon: 'wave',
    title: '信号与系统',
    desc: '信号与系统基本概念、时域分析、傅里叶变换、拉普拉斯变换、Z 变换，含公式速查与互动练习。',
    tags: ['6 章', '公式速查', '互动练习', 'MathJax'],
    style: { borderLeft: '3px solid #06b6d4' },
    iconStyle: { background: 'linear-gradient(135deg,#06b6d4,#22d3ee)' },
  },
]

const COURSE_KEYS = {
  os: ['操作系统'],
  algorithm: ['算法'],
  signals: ['信号与系统'],
  dsp: ['数字信号处理'],
  calculus: ['高等数学'],
  marxism: ['马克思主义'],
  probability: ['概率论'],
  maogai: ['毛泽东'],
}

function SvgIcon({ name }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  const paths = {
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M4 5.5v16" />
        <path d="M8 7h8" />
        <path d="M8 11h6" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15l3-4 3 2 4-7" />
        <path d="M18 6h-4" />
      </>
    ),
    terminal: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="M7 10l2 2-2 2" />
        <path d="M12 14h4" />
      </>
    ),
    nodes: (
      <>
        <circle cx="6" cy="7" r="2.4" />
        <circle cx="18" cy="7" r="2.4" />
        <circle cx="12" cy="17" r="2.4" />
        <path d="M8.2 8.5l2.6 5.5" />
        <path d="M15.8 8.5L13.2 14" />
        <path d="M8.4 7h7.2" />
      </>
    ),
    wave: (
      <>
        <path d="M3 12h3l2.2-6 3.6 12L14 12h7" />
        <path d="M4 19h16" />
      </>
    ),
    sigma: (
      <>
        <path d="M18 5H7l6 7-6 7h11" />
        <path d="M18 5v3" />
        <path d="M18 16v3" />
      </>
    ),
    logic: (
      <>
        <path d="M5 6h5v5H5z" />
        <path d="M14 13h5v5h-5z" />
        <path d="M10 8.5h3a3 3 0 0 1 3 3V13" />
        <path d="M8 11v5a2 2 0 0 0 2 2h4" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.book}</svg>
}

function CourseSection({ title, description, courses }) {
  return (
    <section className="course-section">
      <div className="course-section-head">
        <div>
          <span>{title}</span>
          <p>{description}</p>
        </div>
      </div>
      <div className="cards">
        {courses.map(course => (
          <div key={course.path} className="card-wrap">
            <div className={`card${course._noExam ? ' card-no-exam' : ''}`} style={course.style}>
              <Link to={`/courses/${course.path}/`} className="card-body">
                <div className={`icon ${course.iconClass || ''}`} style={course.iconStyle}>
                  <SvgIcon name={course.icon} />
                </div>
                <h2>{course.title}</h2>
                <p>{course.desc}</p>
                <div className="tags">
                  {course.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                </div>
              </Link>
              <div className="card-actions">
                <Link to={`/courses/${course.path}/`} className="card-action-btn card-action-main">进入课程</Link>
                {course.subLinks?.map(link => (
                  <Link key={link.to} to={link.to} className="card-action-btn card-action-sub">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  const [totalStudyTime, setTotalStudyTime] = useState(null)
  const [universityCourses, setUniversityCourses] = useState(UNIVERSITY_COURSES)
  const containerRef = useGsapAnimations(totalStudyTime)
  const sortRef = useRef(false)

  useScrollMemory()
  useEffect(() => { loadBusuanzi() }, [])

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

  useEffect(() => {
    if (sortRef.current) return
    const classId = localStorage.getItem('exam_class_id')
    if (!classId) {
      setUniversityCourses(UNIVERSITY_COURSES)
      return
    }

    const deletedCourses = new Set()
    try {
      const raw = localStorage.getItem('exam_deleted')
      if (raw) {
        const deletedMap = JSON.parse(raw)
        const list = deletedMap[classId]
        if (Array.isArray(list)) {
          list.forEach(entry => {
            const courseName = entry.split('|')[0]
            for (const [path, keys] of Object.entries(COURSE_KEYS)) {
              if (keys.some(key => courseName.includes(key))) deletedCourses.add(path)
            }
          })
        }
      }
    } catch {}

    const load = data => {
      const exams = data[classId]
      if (!exams) {
        setUniversityCourses(UNIVERSITY_COURSES)
        return
      }
      const now = new Date()
      const withDate = UNIVERSITY_COURSES.map(course => {
        const keys = COURSE_KEYS[course.path] || []
        let earliest = null
        for (const exam of exams) {
          if (!keys.some(key => exam.course.includes(key))) continue
          const date = new Date(exam.iso)
          if (date > now && (!earliest || date < earliest)) earliest = date
        }
        return {
          ...course,
          _examDate: earliest,
          _deprioritized: deletedCourses.has(course.path),
          _noExam: !earliest || deletedCourses.has(course.path),
        }
      })
      withDate.sort((a, b) => {
        if (a._deprioritized && !b._deprioritized) return 1
        if (!a._deprioritized && b._deprioritized) return -1
        if (a._examDate && b._examDate) return a._examDate - b._examDate
        if (a._examDate) return -1
        if (b._examDate) return 1
        return 0
      })
      setUniversityCourses(withDate)
      sortRef.current = true
    }

    if (window.EXAM_SCHEDULE_DATA) {
      load(window.EXAM_SCHEDULE_DATA)
      return
    }
    fetch('/files/exam-schedule.json').then(response => response.json()).then(load).catch(() => {
      const script = document.createElement('script')
      script.src = '/files/exam-schedule-data.js'
      script.onload = () => { if (window.EXAM_SCHEDULE_DATA) load(window.EXAM_SCHEDULE_DATA) }
      document.head.appendChild(script)
    })
  }, [])

  useEffect(() => {
    let total = 0
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith('dwell_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key))
          if (data && typeof data === 'object') {
            Object.values(data).forEach(value => { if (typeof value === 'number') total += value })
          }
        } catch {}
      }
    }
    if (total > 60) {
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      setTotalStudyTime(hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`)
    }
  }, [])

  return (
    <>
      <MeteorShower />
      <FireworkCanvas />
      <div className="container" ref={containerRef}>
        <h1>期末复习</h1>
        <p className="subtitle">高中高考专题与大学期末课程的复习入口</p>

        <GlobalSearch />
        <ExamQuery />

        {totalStudyTime && (
          <div className="study-time-badge" style={{ maxWidth: 560, margin: '0 auto 28px', padding: '14px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
            <span style={{ fontSize: '.92rem', color: 'var(--text)', fontWeight: 600 }}>累计学习时间</span>
            <span style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 700, marginLeft: 8 }}>{totalStudyTime}</span>
          </div>
        )}

        <CourseSection
          title="高中内容"
          description="高考真题、命题趋势、题型迁移和互动训练集中放在这里。"
          courses={HIGH_SCHOOL_COURSES}
        />

        <CourseSection
          title="大学内容"
          description="原有期末复习课程保留在大学内容区，考试排序仍会按你的班级课表自动调整。"
          courses={universityCourses}
        />

        <div className="file-section" style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.15rem', color: 'var(--text)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            资料下载
          </h2>
          <FileBrowser />
        </div>

        <div className="comment-section">
          <h2>评论区</h2>
          <div className="giscus-wrap">
            <div className="giscus" />
          </div>
        </div>

        <div className="footer">
          <div className="footer-stats">
            <span id="busuanzi_container_site_pv">
              本站总访问 <span id="busuanzi_value_site_pv">...</span> 次
            </span>
            <span style={{ margin: '0 8px' }}>·</span>
            <span id="busuanzi_container_site_uv">
              访客 <span id="busuanzi_value_site_uv">...</span> 人
            </span>
          </div>
          Built with care · <a href="https://github.com/SDX123321" target="_blank" rel="noreferrer">@SDX123321</a>
          <br />
          <SplashModal />
        </div>
      </div>
    </>
  )
}
