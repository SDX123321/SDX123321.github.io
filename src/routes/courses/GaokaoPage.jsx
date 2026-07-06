import { useEffect, useMemo, useState } from 'react'
import {
  coverage,
  genePatterns,
  navLinks,
  practiceQuestions,
  sourceDate,
  sources,
  subjects,
  years,
} from '../../data/jiangsu-gaokao'
import gaokaoIndex from '../../data/jiangsu-gaokao-index.json'
import '../../styles/courses/gaokao.css'

const difficultyLabels = {
  all: '全部难度',
  easy: '基础',
  medium: '中档',
  hard: '攻坚',
}

const statusLabels = {
  available: '可分析',
  partial: '待清洗',
  review: '需复核',
  ocr: '需 OCR',
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function SvgIcon({ name }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }
  const paths = {
    'book-open': <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    function: <><path d="M5 19c3 0 3-14 6-14" /><path d="M9 9h6" /><path d="M14 5h4" /><path d="M14 19h4" /></>,
    languages: <><path d="M4 5h9" /><path d="M9 3v2" /><path d="M6 9c1.2 2.8 3.5 4.8 7 6" /><path d="M12 9c-.9 2.3-2.7 4.2-6 6" /><path d="M15 19l3-7 3 7" /><path d="M16 17h4" /></>,
    atom: <><circle cx="12" cy="12" r="1.4" /><ellipse cx="12" cy="12" rx="8" ry="3.2" /><ellipse cx="12" cy="12" rx="3.2" ry="8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="3.2" ry="8" transform="rotate(120 12 12)" /></>,
    flask: <><path d="M9 3h6" /><path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" /><path d="M8 15h8" /></>,
    leaf: <><path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" /><path d="M5 19c3-5 7-8 14-14" /></>,
    landmark: <><path d="M4 9h16" /><path d="M5 9l7-5 7 5" /><path d="M7 10v7" /><path d="M12 10v7" /><path d="M17 10v7" /><path d="M4 20h16" /></>,
    scroll: <><path d="M8 4h10a2 2 0 0 1 2 2v12" /><path d="M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10" /><path d="M8 8h8" /><path d="M8 12h7" /></>,
    map: <><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
  }
  return <svg {...common}>{paths[name] || paths.check}</svg>
}

function statusClass(status) {
  return `status-pill status-${status}`
}

function indexCellClass(cell) {
  if (!cell || cell.total === 0) return 'index-empty'
  if (cell.byStatus.extractable > 0) return 'index-ready'
  if (cell.byStatus['needs-conversion'] > 0) return 'index-convert'
  if (cell.byStatus['needs-ocr-check'] > 0) return 'index-ocr'
  return 'index-other'
}

function formatGeneratedAt(value) {
  if (!value) return '未知'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

function QuestionCard({ question, isDone, onDone }) {
  const [open, setOpen] = useState(isDone)

  return (
    <article className={`gaokao-question ${isDone ? 'is-complete' : ''}`}>
      <div className="question-topline">
        <span>{question.year}</span>
        <span>{subjects.find(item => item.key === question.subject)?.name}</span>
        <span>{question.sourceType}</span>
        <span className={`difficulty difficulty-${question.difficulty}`}>{difficultyLabels[question.difficulty]}</span>
      </div>
      <h3>{question.title}</h3>
      <pre className="question-prompt">{question.prompt}</pre>
      <div className="question-actions">
        <button type="button" onClick={() => { setOpen(value => !value); onDone(question.id) }}>
          {open ? '收起题解' : '查看详细题解'}
        </button>
      </div>
      {open && (
        <div className="question-explain">
          <strong>参考答案：{question.answer}</strong>
          <ol>
            {question.solution.map(step => <li key={step}>{step}</li>)}
          </ol>
        </div>
      )}
    </article>
  )
}

export default function GaokaoPage() {
  const [filters, setFilters] = useState(() => loadJson('gaokao_jiangsu_filters', {
    subject: 'all',
    difficulty: 'all',
  }))
  const [completed, setCompleted] = useState(() => new Set(loadJson('gaokao_jiangsu_done', [])))

  useEffect(() => {
    document.title = '江苏高考真题基因库 - 期末复习'
  }, [])

  useEffect(() => {
    localStorage.setItem('gaokao_jiangsu_filters', JSON.stringify(filters))
  }, [filters])

  useEffect(() => {
    localStorage.setItem('gaokao_jiangsu_done', JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    sidebar.querySelectorAll('.nav-group').forEach(group => group.remove())

    const group = document.createElement('div')
    group.className = 'nav-group'
    const title = document.createElement('div')
    title.className = 'nav-group-title'
    title.textContent = '高中专题导航'
    group.appendChild(title)

    navLinks.forEach(link => {
      const item = document.createElement('a')
      item.href = `#${link.id}`
      item.textContent = link.label
      item.dataset.keywords = link.keywords
      item.onclick = event => {
        event.preventDefault()
        document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        sidebar.classList.remove('open')
        document.querySelector('.sidebar-overlay')?.classList.remove('show')
      }
      group.appendChild(item)
    })
    sidebar.appendChild(group)

    const navItems = [...group.querySelectorAll('a')]
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        navItems.forEach(item => item.classList.remove('active'))
        group.querySelector(`a[href="#${entry.target.id}"]`)?.classList.add('active')
      })
    }, { rootMargin: '-20% 0px -65% 0px' })
    navLinks.forEach(link => {
      const target = document.getElementById(link.id)
      if (target) observer.observe(target)
    })
    return () => observer.disconnect()
  }, [])

  const filteredQuestions = useMemo(() => {
    return practiceQuestions.filter(question => {
      if (filters.subject !== 'all' && question.subject !== filters.subject) return false
      if (filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) return false
      return true
    })
  }, [filters])

  const completeQuestion = id => {
    setCompleted(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const indexCoverage = [
    { label: '候选资料', value: `${gaokaoIndex.totals.files} 个文件` },
    { label: '可直接抽取', value: `${gaokaoIndex.totals.extractable} 个 DOCX` },
    { label: '需转换', value: `${gaokaoIndex.totals.needsConversion} 个旧 DOC` },
    { label: '需 OCR 检查', value: `${gaokaoIndex.totals.needsOcrCheck} 个 PDF` },
  ]

  return (
    <div className="gaokao-page">
      <section id="overview" className="gaokao-hero">
        <div>
          <span className="eyebrow">高中内容 · 江苏近十年 · 全科分析</span>
          <h1>江苏高考真题基因库</h1>
          <p>
            本页把江苏近十年高考放在同一条时间线上观察：2017-2020 作为江苏自主命题对照，
            2021 以后按江苏使用的新高考全国Ⅰ卷 / 新课标Ⅰ卷主线分析。页面先呈现严谨可追溯的资料状态、
            九科命题趋势和完整训练题解；扫描件和旧 .doc 文件在 OCR 或转换前不会被标成已完整入库。
          </p>
        </div>
        <div className="hero-metrics" aria-label="专题统计">
          <div><strong>10</strong><span>年份范围</span></div>
          <div><strong>9</strong><span>覆盖科目</span></div>
          <div><strong>{practiceQuestions.length}</strong><span>完整题解</span></div>
          <div><strong>{gaokaoIndex.totals.coveredCells}/90</strong><span>资料格覆盖</span></div>
        </div>
      </section>

      <section className="source-alert">
        <strong>严谨性说明</strong>
        <span>
          真实真题全文入库需要逐份抽取、OCR、去重和人工核对。本轮页面不把未核验扫描件硬写成题库；
          “完整题解”区为基于近年命题风格生成的高考风格训练题，用于训练迁移能力。
        </span>
      </section>

      <section id="coverage" className="gaokao-section">
        <div className="section-heading">
          <span>Coverage</span>
          <h2>十年资料矩阵</h2>
        </div>
        <div className="coverage-strip">
          {coverage.map(item => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
        <div className="coverage-strip index-strip">
          {indexCoverage.map(item => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
        <div className="index-note">
          索引生成时间：{formatGeneratedAt(gaokaoIndex.generatedAt)}。脚本只记录文件名和相对路径，不把本地绝对路径写入网页数据。
        </div>
        <div className="index-table-wrap" aria-label="江苏高考资料索引表">
          <table className="index-table">
            <thead>
              <tr>
                <th>年份</th>
                {gaokaoIndex.subjects.map(subject => <th key={subject.key}>{subject.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {gaokaoIndex.yearSummaries.map(summary => (
                <tr key={summary.year}>
                  <th>
                    <strong>{summary.year}</strong>
                    <span>{summary.coveredSubjects}/{summary.totalSubjects} 科</span>
                  </th>
                  {gaokaoIndex.subjects.map(subject => {
                    const cell = gaokaoIndex.matrix[summary.year][subject.key]
                    return (
                      <td key={subject.key} className={indexCellClass(cell)}>
                        <strong>{cell.total}</strong>
                        <span>抽 {cell.byStatus.extractable}</span>
                        <span>转 {cell.byStatus['needs-conversion']}</span>
                        <span>OCR {cell.byStatus['needs-ocr-check']}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="year-grid">
          {years.map(item => (
            <article key={item.year} className={`year-card year-${item.status}`}>
              <div className="year-card-head">
                <strong>{item.year}</strong>
                <span className={statusClass(item.status)}>{statusLabels[item.status]}</span>
              </div>
              <h3>{item.paper}</h3>
              <p>{item.subjects}</p>
              <small>{item.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section id="subjects" className="gaokao-section">
        <div className="section-heading">
          <span>Subjects</span>
          <h2>九科命题趋势</h2>
        </div>
        <div className="subject-grid">
          {subjects.map(subject => (
            <article key={subject.key} className="subject-card" style={{ '--subject-accent': subject.accent }}>
              <div className="subject-title">
                <div className="subject-icon"><SvgIcon name={subject.icon} /></div>
                <h3>{subject.name}</h3>
              </div>
              <p>{subject.trend}</p>
              <h4>高频能力点</h4>
              <div className="tag-cloud">
                {subject.highFrequency.map(item => <span key={item}>{item}</span>)}
              </div>
              <h4>常见失分点</h4>
              <ul className="compact-list">
                {subject.easyMistakes.map(item => <li key={item}>{item}</li>)}
              </ul>
              <div className="subject-advice">{subject.advice}</div>
            </article>
          ))}
        </div>
      </section>

      <section id="gene" className="gaokao-section">
        <div className="section-heading">
          <span>Question Gene</span>
          <h2>出题基因与迁移规则</h2>
        </div>
        <div className="prep-grid">
          {genePatterns.map(block => (
            <article key={block.title}>
              <h3>{block.title}</h3>
              <ul>
                {block.points.map(point => <li key={point}>{point}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="questions" className="gaokao-section">
        <div className="section-heading">
          <span>Practice</span>
          <h2>完整题干与详细题解</h2>
        </div>
        <div className="filters">
          <label>
            科目
            <select value={filters.subject} onChange={event => setFilters({ ...filters, subject: event.target.value })}>
              <option value="all">全部科目</option>
              {subjects.map(subject => <option key={subject.key} value={subject.key}>{subject.name}</option>)}
            </select>
          </label>
          <label>
            难度
            <select value={filters.difficulty} onChange={event => setFilters({ ...filters, difficulty: event.target.value })}>
              {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setFilters({ subject: 'all', difficulty: 'all' })}>重置</button>
        </div>
        <div className="question-summary">
          <span>已查看 {completed.size}/{practiceQuestions.length}</span>
          <span>当前筛选 {filteredQuestions.length} 题</span>
        </div>
        <div className="question-grid">
          {filteredQuestions.map(question => (
            <QuestionCard
              key={question.id}
              question={question}
              isDone={completed.has(question.id)}
              onDone={completeQuestion}
            />
          ))}
        </div>
      </section>

      <section id="sources" className="gaokao-section sources-section">
        <div className="section-heading">
          <span>Sources</span>
          <h2>来源与处理口径</h2>
        </div>
        <p>
          访问与整理日期：{sourceDate}。本页优先使用本地资料目录作为证据来源；
          数学迁移规则使用个人 Skill gaokao-question-gene。资料索引由 `scripts/build-gaokao-index.mjs`
          从本地目录生成；后续逐题入库时，会继续区分“真实原题”“解析摘录”“AI 迁移题”。
        </p>
        <div className="source-list">
          {sources.map(source => (
            <article key={source.name}>
              <strong>{source.name}</strong>
              <span>{source.detail}</span>
              <em>{source.status}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
