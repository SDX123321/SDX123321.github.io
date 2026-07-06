import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import extractedQuestions from '../../data/jiangsu-gaokao-extracted.json'
import extracted2026Docx from '../../data/gaokao-2026-docx-extracted.json'
import extracted2026PdfText from '../../data/gaokao-2026-pdf-text-extracted.json'
import gaokaoIndex from '../../data/jiangsu-gaokao-index.json'
import ocrQuestions from '../../data/jiangsu-gaokao-ocr.json'
import {
  getQuestionKnowledgeIds,
  knowledgeEdges,
  knowledgeNodes,
  recommendPracticeQuestions,
  summarizeKnowledgeAttempts,
} from '../../data/gaokao-knowledge-graph'
import { useAuth } from '../../features/account/AuthContext'
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

const extractedQualityLabels = {
  matched: '已匹配解析',
  candidate: '可读候选',
  review: '需核验',
}

const extractedQualityOrder = {
  matched: 0,
  candidate: 1,
  review: 2,
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

function KnowledgeGraph({ activeSubject, attempts }) {
  const { nodeStats } = useMemo(() => summarizeKnowledgeAttempts(attempts), [attempts])
  const visibleSubjects = activeSubject ? [activeSubject] : subjects
  const visibleNodes = visibleSubjects.flatMap(subject => (
    knowledgeNodes.filter(node => node.subject === subject.key).slice(0, activeSubject ? 8 : 3)
  ))
  const positions = new Map()
  const rowHeight = 92
  const width = 1120
  const height = Math.max(180, visibleSubjects.length * rowHeight + 38)

  visibleSubjects.forEach((subject, rowIndex) => {
    const y = 46 + rowIndex * rowHeight
    positions.set(`subject:${subject.key}`, { x: 88, y, label: subject.name, subject })
    visibleNodes
      .filter(node => node.subject === subject.key)
      .forEach((node, nodeIndex) => {
        positions.set(node.id, { x: 292 + nodeIndex * 194, y, label: node.label, node })
      })
  })

  const nodeClass = id => {
    const stat = nodeStats[id]
    if (!stat) return 'is-idle'
    if (stat.wrong > 0 && stat.correct / stat.total < 0.7) return 'is-weak'
    return 'is-strong'
  }

  return (
    <div className="knowledge-graph-wrap">
      <svg className="knowledge-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="高考知识图谱">
        {visibleSubjects.flatMap(subject => (
          visibleNodes
            .filter(node => node.subject === subject.key)
            .map(node => {
              const from = positions.get(`subject:${subject.key}`)
              const to = positions.get(node.id)
              return <line key={`${subject.key}-${node.id}`} x1={from.x + 56} y1={from.y} x2={to.x - 58} y2={to.y} />
            })
        ))}
        {knowledgeEdges.map(([fromId, toId, label]) => {
          const from = positions.get(fromId)
          const to = positions.get(toId)
          if (!from || !to) return null
          return (
            <g key={`${fromId}-${toId}`} className="graph-cross-edge">
              <line x1={from.x + 58} y1={from.y + 24} x2={to.x - 58} y2={to.y + 24} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 8}>{label}</text>
            </g>
          )
        })}
        {[...positions.entries()].map(([id, point]) => {
          const isSubject = id.startsWith('subject:')
          const stat = nodeStats[id]
          return (
            <g key={id} className={`graph-node ${isSubject ? 'is-subject' : nodeClass(id)}`} transform={`translate(${point.x} ${point.y})`}>
              <rect x="-64" y="-24" width="128" height="48" rx="8" />
              <text className="graph-label" y="-2">{point.label}</text>
              {!isSubject && (
                <text className="graph-stat" y="15">
                  {stat ? `${stat.correct}/${stat.total}` : '未作答'}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function WeaknessPanel({ attempts, questions, activeSubject }) {
  const { weakNodes } = useMemo(() => summarizeKnowledgeAttempts(attempts), [attempts])
  const recommendations = useMemo(() => (
    recommendPracticeQuestions(questions, attempts, 6)
  ), [attempts, questions])
  const visibleWeakNodes = activeSubject
    ? weakNodes.filter(item => item.node?.subject === activeSubject.key)
    : weakNodes

  return (
    <div className="weakness-panel">
      <article>
        <h3>薄弱环节</h3>
        {visibleWeakNodes.length > 0 ? (
          <div className="weakness-list">
            {visibleWeakNodes.slice(0, 6).map(item => (
              <div key={item.id}>
                <strong>{item.node?.label || item.id}</strong>
                <span>错 {item.wrong} 次 · 正确率 {Math.round(item.accuracy * 100)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p>完成练习并标记“做错了”后，这里会把结果映射到知识图谱。</p>
        )}
      </article>
      <article>
        <h3>对应推荐题</h3>
        {recommendations.length > 0 ? (
          <div className="recommend-list">
            {recommendations.map(({ question, knowledgeIds }) => (
              <button
                type="button"
                key={question.id}
                onClick={() => document.getElementById(`practice-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                <strong>{question.title}</strong>
                <span>{knowledgeIds.map(id => knowledgeNodes.find(node => node.id === id)?.label || id).join(' / ')}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>当前没有薄弱点记录，先从任意一题开始反馈即可。</p>
        )}
      </article>
    </div>
  )
}

function QuestionCard({ question, isDone, onDone, attempt, onAttempt }) {
  const [open, setOpen] = useState(isDone)
  const knowledgeIds = getQuestionKnowledgeIds(question)
  const knowledgeLabels = knowledgeIds.map(id => knowledgeNodes.find(node => node.id === id)?.label || id)

  return (
    <article id={`practice-${question.id}`} className={`gaokao-question ${isDone ? 'is-complete' : ''} ${attempt ? `attempt-${attempt.result}` : ''}`}>
      <div className="question-topline">
        <span>{question.year}</span>
        <span>{subjects.find(item => item.key === question.subject)?.name}</span>
        <span>{question.sourceType}</span>
        <span className={`difficulty difficulty-${question.difficulty}`}>{difficultyLabels[question.difficulty]}</span>
      </div>
      <h3>{question.title}</h3>
      <div className="knowledge-tags">
        {knowledgeLabels.map(label => <span key={label}>{label}</span>)}
      </div>
      <pre className="question-prompt">{question.prompt}</pre>
      <div className="question-actions">
        <button type="button" onClick={() => { setOpen(value => !value); onDone(question.id) }}>
          {open ? '收起题解' : '查看详细题解'}
        </button>
        <button type="button" className={attempt?.result === 'correct' ? 'is-selected' : ''} onClick={() => onAttempt(question, 'correct')}>
          做对了
        </button>
        <button type="button" className={attempt?.result === 'wrong' ? 'is-selected is-wrong' : ''} onClick={() => onAttempt(question, 'wrong')}>
          做错了
        </button>
      </div>
      {attempt && (
        <div className="attempt-note">
          已记录：{attempt.result === 'correct' ? '掌握' : '薄弱'} · {new Date(attempt.updatedAt).toLocaleString('zh-CN', { hour12: false })}
        </div>
      )}
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

function ExtractedQuestionCard({ file, question }) {
  const flags = question.flags || []
  const hasAnswer = Boolean(question.answer)
  const hasSolution = Array.isArray(question.solution) && question.solution.length > 0

  return (
    <article className={`extract-card extract-${question.quality}`}>
      <div className="question-topline">
        <span>{file.year}</span>
        <span>{file.subjectName}</span>
        <span>{extractedQualityLabels[question.quality] || '待整理'}</span>
      </div>
      <h3>{file.source} · 第 {question.number} 题</h3>
      {file.analysisSource && (
        <p className="analysis-source">解析来源：{file.analysisSource}</p>
      )}
      <pre className="question-prompt">{question.prompt}</pre>
      {hasAnswer && (
        <div className="extract-answer">
          <strong>参考答案</strong>
          <span>{question.answer}</span>
        </div>
      )}
      {hasSolution && (
        <div className="extract-solution">
          <strong>解析摘录</strong>
          <ol>
            {question.solution.map((step, index) => <li key={`${question.number}-${index}`}>{step}</li>)}
          </ol>
        </div>
      )}
      {flags.length > 0 && (
        <div className="extract-flags">
          {flags.map(flag => <span key={flag}>{flag}</span>)}
        </div>
      )}
      <p className="extract-note">
        {question.quality === 'matched'
          ? '题解状态：已从解析卷自动匹配答案与解析，仍需人工复核公式、图片和表格。'
          : '题解状态：需人工核验。含公式或图表的内容可能在 DOCX 抽取时缺失，暂不作为正式题库条目。'}
      </p>
    </article>
  )
}

function OcrQuestionCard({ question }) {
  const score = Math.round((question.averageScore || 0) * 100)

  return (
    <article className="ocr-card">
      <div className="question-topline">
        <span>2026</span>
        <span>江苏数学</span>
        <span>{question.type}</span>
        <span>置信度 {score}%</span>
      </div>
      <h3>扫描卷 OCR · 第 {question.number} 题</h3>
      <pre className="question-prompt">{question.prompt}</pre>
      <div className="extract-flags">
        {question.flags.map(flag => <span key={flag}>{flag}</span>)}
      </div>
      <p className="extract-note">
        该题来自 2026 江苏数学 PDF 扫描识别。题干顺序已按双栏版面整理，公式、根号、上下标和图形信息仍需人工复核。
      </p>
    </article>
  )
}

function SubjectYearCard({ year, cell }) {
  return (
    <article className="subject-year-card">
      <strong>{year}</strong>
      <span>资料 {cell?.total || 0} 份</span>
      <small>可抽取 {cell?.byStatus?.extractable || 0} · 需转换 {cell?.byStatus?.['needs-conversion'] || 0} · OCR {cell?.byStatus?.['needs-ocr-check'] || 0}</small>
    </article>
  )
}

export default function GaokaoPage() {
  const params = useParams()
  const subjectSlug = (params['*'] || '').replace(/^\/+|\/+$/g, '').split('/')[0]
  const activeSubject = subjects.find(subject => subject.key === subjectSlug)
  const isSubjectPage = Boolean(subjectSlug)
  const subjectNotFound = isSubjectPage && !activeSubject
  const pageNavLinks = useMemo(() => {
    if (!activeSubject) return navLinks
    const links = [
      { id: 'subject-overview', label: `${activeSubject.name}概览`, keywords: `${activeSubject.name} 高考 概览` },
      { id: 'subject-trend', label: '命题趋势', keywords: `${activeSubject.name} 趋势 高频考点` },
      { id: 'subject-knowledge', label: '知识图谱', keywords: `${activeSubject.name} 知识图谱 薄弱点` },
      { id: 'subject-years', label: '年份资料', keywords: `${activeSubject.name} 年份 资料` },
      { id: 'subject-extracts', label: '真实样本', keywords: `${activeSubject.name} 题干 解析` },
      { id: 'subject-practice', label: '扩展训练', keywords: `${activeSubject.name} 练习 题解` },
      { id: 'subject-advice', label: '复习建议', keywords: `${activeSubject.name} 建议 易错` },
    ]
    if (activeSubject.key === 'math') {
      links.splice(3, 0, { id: 'subject-gene', label: '数学基因', keywords: '数学 出题基因 OCR 迁移' })
    }
    return links
  }, [activeSubject])

  const [filters, setFilters] = useState(() => loadJson('gaokao_jiangsu_filters', {
    subject: 'all',
    difficulty: 'all',
  }))
  const [completed, setCompleted] = useState(() => new Set(loadJson('gaokao_jiangsu_done', [])))
  const [attempts, setAttempts] = useState(() => loadJson('gaokao_knowledge_attempts', {}))
  const { syncStudyEvent, syncGaokaoAttempt } = useAuth()

  useEffect(() => {
    document.title = activeSubject
      ? `${activeSubject.name}高考专题 - 期末复习`
      : '江苏高考真题基因库 - 期末复习'
  }, [activeSubject])

  useEffect(() => {
    localStorage.setItem('gaokao_jiangsu_filters', JSON.stringify(filters))
  }, [filters])

  useEffect(() => {
    localStorage.setItem('gaokao_jiangsu_done', JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    localStorage.setItem('gaokao_knowledge_attempts', JSON.stringify(attempts))
  }, [attempts])

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    sidebar.querySelectorAll('.nav-group').forEach(group => group.remove())

    const group = document.createElement('div')
    group.className = 'nav-group'
    const title = document.createElement('div')
    title.className = 'nav-group-title'
    title.textContent = activeSubject ? `${activeSubject.name}专题导航` : '高中专题导航'
    group.appendChild(title)

    if (activeSubject) {
      const overview = document.createElement('a')
      overview.href = '/courses/gaokao/'
      overview.textContent = '返回九科总览'
      overview.dataset.keywords = '九科 总览 高考'
      group.appendChild(overview)
    }

    pageNavLinks.forEach(link => {
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
    pageNavLinks.forEach(link => {
      const target = document.getElementById(link.id)
      if (target) observer.observe(target)
    })
    return () => observer.disconnect()
  }, [activeSubject, pageNavLinks])

  const filteredQuestions = useMemo(() => {
    return practiceQuestions.filter(question => {
      if (filters.subject !== 'all' && question.subject !== filters.subject) return false
      if (filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) return false
      return true
    })
  }, [filters])

  const extractedSamples = useMemo(() => {
    return [...extractedQuestions.files, ...extracted2026Docx.files, ...extracted2026PdfText.files]
      .flatMap(file => file.questions.map(question => ({ file, question })))
      .filter(item => item.question.prompt.length >= 20)
      .sort((left, right) => (
        (extractedQualityOrder[left.question.quality] ?? 9) - (extractedQualityOrder[right.question.quality] ?? 9)
      ))
  }, [])

  const subjectExtractedSamples = useMemo(() => {
    if (!activeSubject) return []
    return [...extractedQuestions.files, ...extracted2026Docx.files, ...extracted2026PdfText.files]
      .filter(file => file.subject === activeSubject.key)
      .flatMap(file => file.questions.map(question => ({ file, question })))
      .filter(item => item.question.prompt.length >= 20)
      .sort((left, right) => (
        (extractedQualityOrder[left.question.quality] ?? 9) - (extractedQualityOrder[right.question.quality] ?? 9)
      ))
  }, [activeSubject])

  const subjectPracticeQuestions = useMemo(() => {
    if (!activeSubject) return []
    return practiceQuestions.filter(question => question.subject === activeSubject.key)
  }, [activeSubject])

  const subjectYearRows = useMemo(() => {
    if (!activeSubject) return []
    return gaokaoIndex.yearSummaries.map(summary => ({
      year: summary.year,
      cell: gaokaoIndex.matrix[summary.year][activeSubject.key],
    }))
  }, [activeSubject])

  const completeQuestion = id => {
    setCompleted(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const question = practiceQuestions.find(item => item.id === id)
    syncStudyEvent({
      eventType: 'practice_done',
      course: 'gaokao',
      subject: question?.subject || activeSubject?.key || null,
      pagePath: window.location.pathname,
      objectId: id,
      payload: { sourceType: question?.sourceType || null, difficulty: question?.difficulty || null },
    })
  }

  const recordAttempt = (question, result) => {
    const knowledgeIds = getQuestionKnowledgeIds(question)
    const nextAttempt = {
      result,
      knowledgeIds,
      updatedAt: new Date().toISOString(),
      subject: question.subject,
      title: question.title,
    }
    setAttempts(prev => ({ ...prev, [question.id]: nextAttempt }))
    setCompleted(prev => {
      const next = new Set(prev)
      next.add(question.id)
      return next
    })
    syncGaokaoAttempt({
      questionKey: question.id,
      subjectKey: question.subject,
      result,
      knowledgeNodes: knowledgeIds,
      promptSnapshot: question.prompt,
      answerSnapshot: question.answer,
      sourceType: question.sourceType,
      metadata: {
        pagePath: window.location.pathname,
        difficulty: question.difficulty,
        title: question.title,
      },
    })
    syncStudyEvent({
      eventType: result === 'correct' ? 'gaokao_answer_correct' : 'gaokao_answer_wrong',
      course: 'gaokao',
      subject: question.subject,
      pagePath: window.location.pathname,
      objectId: question.id,
      payload: {
        result,
        knowledgeIds,
        difficulty: question.difficulty,
        sourceType: question.sourceType,
      },
    })
  }

  const indexCoverage = [
    { label: '候选资料', value: `${gaokaoIndex.totals.files} 个文件` },
    { label: '可直接抽取', value: `${gaokaoIndex.totals.extractable} 个 DOCX` },
    { label: '需转换', value: `${gaokaoIndex.totals.needsConversion} 个旧 DOC` },
    { label: '需 OCR 检查', value: `${gaokaoIndex.totals.needsOcrCheck} 个 PDF` },
  ]
  const combinedExtractSummary = {
    files: (extractedQuestions.summary.files || 0) + (extracted2026Docx.summary.files || 0) + (extracted2026PdfText.summary.files || 0),
    questions: (extractedQuestions.summary.questions || 0) + (extracted2026Docx.summary.questions || 0) + (extracted2026PdfText.summary.questions || 0),
    matchedQuestions: (extractedQuestions.summary.matchedQuestions || 0) + (extracted2026Docx.summary.matchedQuestions || 0) + (extracted2026PdfText.summary.matchedQuestions || 0),
    reviewQuestions: (extractedQuestions.summary.reviewQuestions || 0) + (extracted2026Docx.summary.reviewQuestions || 0) + (extracted2026PdfText.summary.reviewQuestions || 0),
  }

  if (subjectNotFound) {
    return (
      <div className="gaokao-page">
        <section className="gaokao-section">
          <div className="section-heading">
            <span>Not Found</span>
            <h2>学科未找到</h2>
          </div>
          <p className="extract-intro">当前路径没有对应的高考学科，请返回九科总览重新选择。</p>
          <Link className="subject-back-link" to="/courses/gaokao/">返回九科总览</Link>
        </section>
      </div>
    )
  }

  if (activeSubject) {
    return (
      <div className="gaokao-page subject-page" style={{ '--subject-accent': activeSubject.accent }}>
        <section id="subject-overview" className="gaokao-hero subject-hero">
          <div>
            <span className="eyebrow">高中内容 · 江苏高考 · {activeSubject.name}</span>
            <h1>{activeSubject.name}高考专题</h1>
            <p>{activeSubject.trend}</p>
            <Link className="subject-back-link" to="/courses/gaokao/">返回九科总览</Link>
          </div>
          <div className="hero-metrics" aria-label={`${activeSubject.name}专题统计`}>
            <div><strong>{subjectYearRows.reduce((sum, item) => sum + (item.cell?.total || 0), 0)}</strong><span>资料索引</span></div>
            <div><strong>{subjectExtractedSamples.length}</strong><span>真实样本</span></div>
            <div><strong>{subjectPracticeQuestions.length}</strong><span>扩展训练</span></div>
            <div><strong>{activeSubject.highFrequency.length}</strong><span>高频能力点</span></div>
          </div>
        </section>

        <section id="subject-trend" className="gaokao-section">
          <div className="section-heading">
            <span>Trend</span>
            <h2>命题趋势与高频能力</h2>
          </div>
          <div className="subject-focus-grid">
            <article>
              <h3>高频能力点</h3>
              <div className="tag-cloud">
                {activeSubject.highFrequency.map(item => <span key={item}>{item}</span>)}
              </div>
            </article>
            <article>
              <h3>常见失分点</h3>
              <ul className="compact-list">
                {activeSubject.easyMistakes.map(item => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
        </section>

        <section id="subject-knowledge" className="gaokao-section">
          <div className="section-heading">
            <span>Knowledge Graph</span>
            <h2>{activeSubject.name}知识图谱与薄弱点</h2>
          </div>
          <KnowledgeGraph activeSubject={activeSubject} attempts={attempts} />
          <WeaknessPanel attempts={attempts} questions={subjectPracticeQuestions} activeSubject={activeSubject} />
        </section>

        <section id="subject-years" className="gaokao-section">
          <div className="section-heading">
            <span>Years</span>
            <h2>年份资料</h2>
          </div>
          <div className="subject-year-grid">
            {subjectYearRows.map(item => <SubjectYearCard key={item.year} year={item.year} cell={item.cell} />)}
          </div>
        </section>

        {activeSubject.key === 'math' && (
          <section id="subject-gene" className="gaokao-section">
            <div className="section-heading">
              <span>Question Gene</span>
              <h2>数学出题基因与 2026 OCR 样本</h2>
            </div>
            <div className="prep-grid">
              {genePatterns.filter(block => block.title.includes('数学')).map(block => (
                <article key={block.title}>
                  <h3>{block.title}</h3>
                  <ul>{block.points.map(point => <li key={point}>{point}</li>)}</ul>
                </article>
              ))}
            </div>
            <div className="ocr-grid subject-ocr-grid">
              {ocrQuestions.questions.slice(0, 6).map(question => (
                <OcrQuestionCard key={question.number} question={question} />
              ))}
            </div>
          </section>
        )}

        <section id="subject-extracts" className="gaokao-section">
          <div className="section-heading">
            <span>Extracted</span>
            <h2>结构化题库</h2>
          </div>
          {subjectExtractedSamples.length > 0 ? (
            <div className="extract-grid">
              {subjectExtractedSamples.map(({ file, question }) => (
                <ExtractedQuestionCard
                  key={`${file.year}-${file.subject}-${file.source}-${question.number}`}
                  file={file}
                  question={question}
                />
              ))}
            </div>
          ) : (
            <p className="extract-intro">该科目的可展示 DOCX 样本仍在清洗中；旧 DOC、扫描件或特殊排版会继续标为待转换/待复核。</p>
          )}
        </section>

        <section id="subject-practice" className="gaokao-section">
          <div className="section-heading">
            <span>Practice</span>
            <h2>扩展训练</h2>
          </div>
          {subjectPracticeQuestions.length > 0 ? (
            <div className="question-grid">
              {subjectPracticeQuestions.map(question => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  isDone={completed.has(question.id)}
                  onDone={completeQuestion}
                  attempt={attempts[question.id]}
                  onAttempt={recordAttempt}
                />
              ))}
            </div>
          ) : (
            <p className="extract-intro">该科扩展训练题会按真实题型和教材顺序继续补充；当前先展示趋势、资料和真实样本。</p>
          )}
        </section>

        <section id="subject-advice" className="gaokao-section">
          <div className="section-heading">
            <span>Advice</span>
            <h2>复习建议</h2>
          </div>
          <div className="subject-advice">{activeSubject.advice}</div>
          <p className="extract-intro">
            本学科页面只显示与 {activeSubject.name} 相关的资料与题目；总览页仍保留九科矩阵、全局 OCR 和来源说明。
          </p>
        </section>
      </div>
    )
  }

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

      <section id="knowledge-map" className="gaokao-section">
        <div className="section-heading">
          <span>Knowledge Graph</span>
          <h2>九科知识图谱与薄弱点推荐</h2>
        </div>
        <KnowledgeGraph attempts={attempts} />
        <WeaknessPanel attempts={attempts} questions={practiceQuestions} />
      </section>

      <section id="ocr" className="gaokao-section">
        <div className="section-heading">
          <span>OCR Scan</span>
          <h2>2026 江苏数学扫描卷 OCR</h2>
        </div>
        <div className="extract-summary">
          <span>PDF 页 {ocrQuestions.summary.pdfPages} 页</span>
          <span>OCR 行 {ocrQuestions.summary.ocrLines} 行</span>
          <span>拆分题目 {ocrQuestions.summary.questions} 题</span>
          <span>全部待复核 {ocrQuestions.summary.reviewQuestions} 题</span>
        </div>
        <p className="extract-intro">
          这部分来自本地 2026 江苏数学扫描 PDF。页面展示的是 OCR 题干，用于分析题型分布、情境包装和压轴结构；
          涉及公式、图形、选项排版的地方先标记为待复核，不混入正式题解练习。
        </p>
        <div className="ocr-grid">
          {ocrQuestions.questions.map(question => (
            <OcrQuestionCard key={question.number} question={question} />
          ))}
        </div>
      </section>

      <section id="extracts" className="gaokao-section">
        <div className="section-heading">
          <span>Extracted DOCX</span>
          <h2>真实题干结构化题库</h2>
        </div>
        <div className="extract-summary">
          <span>来源文件 {combinedExtractSummary.files} 份</span>
          <span>抽取题干 {combinedExtractSummary.questions} 题</span>
          <span>已匹配解析 {combinedExtractSummary.matchedQuestions ?? 0} 题</span>
          <span>需核验 {combinedExtractSummary.reviewQuestions} 题</span>
        </div>
        <p className="extract-intro">
          这一栏来自真实 DOCX 与带文本层 PDF 试卷抽取，已合并 2020-2025 江苏/新高考样本、2026 审计清单中的 DOCX 和可直接读文本的 PDF。含公式、图片、复杂表格的题目可能会丢失部分内容，因此带有质量标记；
          已匹配解析的样本会展示答案与解析摘录，但在人工复核前仍不替代正式练习区。
        </p>
        <div className="extract-grid">
          {extractedSamples.map(({ file, question }) => (
            <ExtractedQuestionCard
              key={`${file.year}-${file.subject}-${file.source}-${question.number}`}
              file={file}
              question={question}
            />
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
              attempt={attempts[question.id]}
              onAttempt={recordAttempt}
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
          从本地目录生成，DOCX 候选题干由 `scripts/extract-gaokao-docx.py` 抽取；后续逐题入库时，会继续区分“真实原题”“解析摘录”“AI 迁移题”。
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
