import { useCallback, useEffect, useMemo, useState } from 'react'
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
import extracted2026Ocr from '../../data/gaokao-2026-ocr-extracted.json'
import extracted2026Residual from '../../data/gaokao-2026-residual-extracted.json'
import answerOverrides from '../../data/gaokao-2026-answer-overrides.json'
import gaokaoIndex from '../../data/jiangsu-gaokao-index.json'
import ocrQuestions from '../../data/jiangsu-gaokao-ocr.json'
import {
  getQuestionKnowledgeIds,
  getKnowledgeQuestionType,
  getSubjectKnowledgeLayout,
  knowledgeEdges,
  knowledgeNodes,
  recommendPracticeQuestions,
  summarizeKnowledgeAttempts,
} from '../../data/gaokao-knowledge-graph'
import { useAuth } from '../../features/account/AuthContext'
import '../../styles/courses/gaokao.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787'
const QUESTION_BATCH_SIZE = 120
const QUESTION_INDEX_CACHE_KEY = 'gaokao_question_index_cache'

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

const extractedLibraries = [
  extractedQuestions,
  extracted2026Docx,
  extracted2026PdfText,
  extracted2026Ocr,
  extracted2026Residual,
]

const answerOverrideById = new Map(
  (answerOverrides.overrides || []).map((override) => [override.questionId, override]),
)
const answerOverrideBySource = new Map(
  (answerOverrides.overrides || [])
    .map((override) => [answerOverrideLookupKey(override), override])
    .filter(([key]) => key),
)

function answerOverrideLookupKey(value) {
  if (!value?.dataset || !value?.source || value?.number === undefined || value?.number === null)
    return null
  return [value.dataset, value.source, value.relativePath || '', String(value.number)].join(
    '\u241f',
  )
}

function findAnswerOverride(question, context = {}) {
  if (question?.id && answerOverrideById.has(question.id))
    return answerOverrideById.get(question.id)
  return answerOverrideBySource.get(
    answerOverrideLookupKey({
      dataset: context.dataset,
      source: context.source,
      relativePath: context.relativePath,
      number: question?.number,
    }),
  )
}

function applyAnswerOverride(question, context = {}) {
  if (question?.answer) return question
  const override = findAnswerOverride(question, context)
  if (!override?.answer) return question
  return {
    ...question,
    answer: override.answer,
    solution:
      Array.isArray(question.solution) && question.solution.length > 0
        ? question.solution
        : override.solution || [],
    flags: [...(question.flags || []), 'answer_override', `answer_override_${override.method}`],
  }
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function truncateText(value, maxLength) {
  const text = value ? String(value) : ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item))
  if (!value) return []
  return [String(value)]
}

function normalizeDbQuestion(row) {
  const subject = subjects.find((item) => item.key === row.subjectKey)
  const questionNumber = row.questionNumber ? `第 ${row.questionNumber} 题` : '题目'
  const sourceType = row.sourceType || '结构化题库'
  const difficulty = difficultyLabels[row.difficulty] ? row.difficulty : 'medium'
  const prompt = row.prompt || ''
  return {
    id: row.questionKey || `gaokao-db-${row.id}`,
    year: row.year || '2026',
    subject: row.subjectKey,
    sourceType,
    difficulty,
    title: `${row.year || '2026'} ${row.subjectName || subject?.name || row.subjectKey || '高考'} ${questionNumber}`,
    prompt,
    answer: row.answer || '答案待补全',
    solution: normalizeList(row.solution),
    flags: normalizeList(row.flags),
    quality: row.quality,
    questionType: row.questionType,
    questionKey: row.questionKey,
    metadata: row.metadata || {},
    hasSolution: Boolean(row.hasSolution),
    solutionStatus: row.solutionStatus || row.metadata?.solutionEnrichment?.status || null,
    updatedAt: row.updatedAt,
  }
}

function writeQuestionIndexCache(query, questions, pageInfo) {
  try {
    localStorage.setItem(
      QUESTION_INDEX_CACHE_KEY,
      JSON.stringify({
        query,
        ids: questions.map((question) => question.id),
        pageInfo,
        updatedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // 浏览器存储只做轻量索引兜底，失败时不影响题库加载。
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
    'book-open': (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    ),
    function: (
      <>
        <path d="M5 19c3 0 3-14 6-14" />
        <path d="M9 9h6" />
        <path d="M14 5h4" />
        <path d="M14 19h4" />
      </>
    ),
    languages: (
      <>
        <path d="M4 5h9" />
        <path d="M9 3v2" />
        <path d="M6 9c1.2 2.8 3.5 4.8 7 6" />
        <path d="M12 9c-.9 2.3-2.7 4.2-6 6" />
        <path d="M15 19l3-7 3 7" />
        <path d="M16 17h4" />
      </>
    ),
    atom: (
      <>
        <circle cx="12" cy="12" r="1.4" />
        <ellipse cx="12" cy="12" rx="8" ry="3.2" />
        <ellipse cx="12" cy="12" rx="3.2" ry="8" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="3.2" ry="8" transform="rotate(120 12 12)" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />
        <path d="M8 15h8" />
      </>
    ),
    leaf: (
      <>
        <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" />
        <path d="M5 19c3-5 7-8 14-14" />
      </>
    ),
    landmark: (
      <>
        <path d="M4 9h16" />
        <path d="M5 9l7-5 7 5" />
        <path d="M7 10v7" />
        <path d="M12 10v7" />
        <path d="M17 10v7" />
        <path d="M4 20h16" />
      </>
    ),
    scroll: (
      <>
        <path d="M8 4h10a2 2 0 0 1 2 2v12" />
        <path d="M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10" />
        <path d="M8 8h8" />
        <path d="M8 12h7" />
      </>
    ),
    map: (
      <>
        <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" />
        <path d="M9 4v14" />
        <path d="M15 6v14" />
      </>
    ),
    check: (
      <>
        <path d="M20 6L9 17l-5-5" />
      </>
    ),
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

function mergeAccountWeaknesses(rows = [], knowledgeIds = [], result) {
  const now = new Date().toISOString()
  const byId = new Map(rows.map((row) => [row.knowledgeNode, { ...row }]))
  knowledgeIds.forEach((id) => {
    const current = byId.get(id) || { knowledgeNode: id, total: 0, correct: 0, wrong: 0 }
    const total = (Number(current.total) || 0) + 1
    const correct = (Number(current.correct) || 0) + (result === 'correct' ? 1 : 0)
    const wrong = (Number(current.wrong) || 0) + (result === 'wrong' ? 1 : 0)
    byId.set(id, { ...current, total, correct, wrong, lastAnsweredAt: now })
  })
  return [...byId.values()].sort(
    (left, right) =>
      (Number(right.wrong) || 0) - (Number(left.wrong) || 0) ||
      (Number(right.total) || 0) - (Number(left.total) || 0) ||
      String(right.lastAnsweredAt || '').localeCompare(String(left.lastAnsweredAt || '')),
  )
}

const knowledgeNodeById = new Map(knowledgeNodes.map((node) => [node.id, node]))

function buildKnowledgeQuestionCounts(questions = []) {
  return questions.reduce((counts, question) => {
    getQuestionKnowledgeIds(question).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  }, {})
}

function formatAccuracy(stat) {
  return stat?.total ? `${Math.round((stat.correct / stat.total) * 100)}%` : '未作答'
}

function questionRenderKey(question, index, scope) {
  return [scope, question.id, question.year, question.sourceType, question.number, index]
    .filter(Boolean)
    .join('-')
}

function practiceAnchorId(question, index, scope) {
  return `practice-${questionRenderKey(question, index, scope).replace(/[^\w-]/g, '-')}`
}

function scrollToPracticeQuestion(questionId) {
  const target = Array.from(document.querySelectorAll('[data-practice-question-id]')).find(
    (element) => element.dataset.practiceQuestionId === String(questionId),
  )
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function hasCompleteAnswer(question) {
  return Boolean(question.answer && question.answer !== '答案待补全')
}

const subjectSolutionHints = {
  chinese: '回到材料原文找证据，把选项或观点拆成关键词，再逐一核对是否越界、偷换或遗漏。',
  math: '先把条件转成式子、图像或参数范围，再检查端点、定义域和等号能否取到。',
  english: '抓住空前空后、指代词和逻辑连接词，确认选项能同时承接前文并引出后文。',
  physics: '先明确研究对象和过程，画出受力、运动或能量关系，再代入数据核对量纲。',
  chemistry: '把现象、反应原理、变量控制和结论边界对应起来，避免只凭颜色或单一现象下结论。',
  biology: '先区分自变量、因变量和无关变量，再用实验结果或遗传比例反推机制。',
  politics: '先锁定材料主体和设问角度，再把教材术语落回材料中的具体做法。',
  history: '先定位时空背景，再用材料证据说明变化、原因、影响或观点是否成立。',
  geography: '先判断区域条件和过程链条，再把自然因素、人类活动和治理措施对应起来。',
}

const solutionStepTitles = ['审题定位', '建立方法', '推进推理', '形成结论', '复盘迁移']

function splitAnswerParts(answer) {
  if (!answer || answer === '答案待补全') return []
  return String(answer)
    .split(/(?=（\d+）)|(?=\(\d+\))|；|;/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function buildDetailedSolutionSteps(question, knowledgeLabels) {
  const solution = Array.isArray(question.solution) ? question.solution.filter(Boolean) : []
  const answerParts = splitAnswerParts(question.answer)
  const subjectName = subjects.find((item) => item.key === question.subject)?.name || '本题'
  const questionType = getKnowledgeQuestionType(question)
  const hint =
    subjectSolutionHints[question.subject] || '先拆条件，再选方法，最后把结论和标准答案逐项核对。'
  const labels = knowledgeLabels.length > 0 ? knowledgeLabels.join('、') : '题干中的核心概念'
  const sourceSteps = solution.length > 0 ? solution : answerParts

  const steps = [
    {
      title: '审题定位',
      detail: `${subjectName}题先判断题型为「${questionType}」，核心知识点落在「${labels}」。读题时先标出设问对象、限制条件和要求输出的结论，避免直接套用答案。`,
    },
  ]

  if (sourceSteps.length > 0) {
    sourceSteps.forEach((step, index) => {
      const title = solutionStepTitles[Math.min(index + 1, solutionStepTitles.length - 1)]
      const answerPart = answerParts[index]
        ? `本步最后要能对上标准答案中的「${answerParts[index]}」。`
        : '本步完成后要回到设问，确认没有遗漏小问或条件。'
      steps.push({
        title,
        detail: `依据标准题解，第 ${index + 1} 步可以这样展开：${step} ${answerPart}`,
      })
    })
  } else {
    steps.push({
      title: '建立方法',
      detail: `${hint} 当前题目还没有完整解析，先用标准答案反推需要证明、计算或说明的关键中间量。`,
    })
  }

  steps.push({
    title: '核对答案',
    detail: hasCompleteAnswer(question)
      ? `把每个小问的结果逐项对照标准答案「${question.answer}」。若表达题与标准答案不完全一致，优先检查关键词、因果链和条件边界是否完整。`
      : '标准答案仍待补全，先保留推理链条和疑点，后续补答案时再做逐项校验。',
  })

  steps.push({
    title: '迁移提醒',
    detail: hint,
  })

  return steps
}

function buildQuestionTaxonomy(questions = [], nodeStats = {}, activeSubject = null) {
  const groups = new Map()
  questions.forEach((question) => {
    const knowledgeIds = getQuestionKnowledgeIds(question)
    const questionType = getKnowledgeQuestionType(question)
    knowledgeIds.forEach((nodeId) => {
      const current = groups.get(nodeId) || {
        id: nodeId,
        node: knowledgeNodeById.get(nodeId),
        total: 0,
        answered: 0,
        typeCounts: {},
        examples: [],
      }
      current.total += 1
      if (hasCompleteAnswer(question)) current.answered += 1
      current.typeCounts[questionType] = (current.typeCounts[questionType] || 0) + 1
      if (current.examples.length < 3) current.examples.push({ question, questionType })
      groups.set(nodeId, current)
    })
  })
  const subjectOrder = activeSubject
    ? knowledgeNodes.filter((node) => node.subject === activeSubject.key).map((node) => node.id)
    : knowledgeNodes.map((node) => node.id)
  return [...groups.values()]
    .map((group) => ({
      ...group,
      stat: nodeStats[group.id],
      typeEntries: Object.entries(group.typeCounts).sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'),
      ),
    }))
    .sort((left, right) => {
      const leftWeak = left.stat?.wrong || 0
      const rightWeak = right.stat?.wrong || 0
      return (
        rightWeak - leftWeak ||
        subjectOrder.indexOf(left.id) - subjectOrder.indexOf(right.id) ||
        right.total - left.total
      )
    })
}

function QuestionTaxonomyPanel({ questions, activeSubject, attempts, accountWeaknesses }) {
  const { nodeStats } = useMemo(
    () => summarizeKnowledgeAttempts(attempts, accountWeaknesses),
    [attempts, accountWeaknesses],
  )
  const layout = activeSubject ? getSubjectKnowledgeLayout(activeSubject.key) : null
  const taxonomy = useMemo(
    () => buildQuestionTaxonomy(questions, nodeStats, activeSubject),
    [questions, nodeStats, activeSubject],
  )
  const typeCount = useMemo(
    () => new Set(taxonomy.flatMap((group) => group.typeEntries.map(([type]) => type))).size,
    [taxonomy],
  )
  const answeredCount = questions.filter(hasCompleteAnswer).length
  const visibleGroups = activeSubject ? taxonomy : taxonomy.slice(0, 12)

  return (
    <div
      className={`question-taxonomy ${layout ? `question-taxonomy-${layout.pattern}` : 'question-taxonomy-overview'}`}
    >
      <div className="taxonomy-summary">
        <div>
          <strong>{questions.length}</strong>
          <span>已归纳题目</span>
        </div>
        <div>
          <strong>{taxonomy.length}</strong>
          <span>覆盖知识点</span>
        </div>
        <div>
          <strong>{typeCount}</strong>
          <span>识别题型</span>
        </div>
        <div>
          <strong>
            {answeredCount}/{questions.length}
          </strong>
          <span>答案完整度</span>
        </div>
      </div>
      {visibleGroups.length > 0 ? (
        <div className="taxonomy-grid">
          {visibleGroups.map((group) => {
            const stat = group.stat
            const answerRate = Math.round((group.answered / group.total) * 100)
            const practiceHint =
              stat?.wrong > 0
                ? `先补 ${stat.wrong} 次错题记录`
                : group.answered < group.total
                  ? '先看有完整答案的题'
                  : '可做同题型迁移'
            return (
              <article
                key={group.id}
                className={`taxonomy-card ${stat?.wrong > 0 ? 'has-weakness' : ''}`}
              >
                <div className="taxonomy-card-head">
                  <div>
                    <strong>{group.node?.label || group.id}</strong>
                    <span>{group.node?.group || '知识点'}</span>
                  </div>
                  <em>{practiceHint}</em>
                </div>
                <p>{group.node?.description}</p>
                <div className="taxonomy-metrics">
                  <span>{group.total} 题</span>
                  <span>答案 {answerRate}%</span>
                  <span>正确率 {formatAccuracy(stat)}</span>
                </div>
                <div className="taxonomy-types">
                  {group.typeEntries.map(([type, count]) => (
                    <span
                      key={type}
                      style={{
                        '--type-share': `${Math.max(14, Math.round((count / group.total) * 100))}%`,
                      }}
                    >
                      <b>{type}</b>
                      <i>{count}</i>
                    </span>
                  ))}
                </div>
                <div className="taxonomy-examples">
                  {group.examples.map(({ question, questionType }) => (
                    <button
                      type="button"
                      key={questionRenderKey(question, group.id, questionType)}
                      onClick={() => scrollToPracticeQuestion(question.id)}
                    >
                      <span>{questionType}</span>
                      <strong>{question.title}</strong>
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="extract-intro">题库加载后，这里会按知识点和题型自动归纳已有题目。</p>
      )}
    </div>
  )
}

function KnowledgeGraph({ activeSubject, attempts, accountWeaknesses, questions = [] }) {
  const { nodeStats } = useMemo(
    () => summarizeKnowledgeAttempts(attempts, accountWeaknesses),
    [attempts, accountWeaknesses],
  )
  const questionCounts = useMemo(() => buildKnowledgeQuestionCounts(questions), [questions])
  const layout = activeSubject ? getSubjectKnowledgeLayout(activeSubject.key) : null

  const nodeClass = (id) => {
    const stat = nodeStats[id]
    if (!stat) return 'is-idle'
    if (stat.wrong > 0 && stat.correct / stat.total < 0.7) return 'is-weak'
    return 'is-strong'
  }

  if (activeSubject && layout) {
    return (
      <div className={`subject-knowledge-map subject-knowledge-${layout.pattern}`}>
        <div className="subject-knowledge-head">
          <div>
            <h3>{layout.title}</h3>
            <p>{layout.lead}</p>
          </div>
          <div className="knowledge-stage-rail" aria-label="复习流程">
            {layout.stages.map((stage) => (
              <span key={stage}>{stage}</span>
            ))}
          </div>
        </div>
        <div className="knowledge-lanes">
          {layout.lanes.map((lane, laneIndex) => (
            <article
              key={lane.label}
              className="knowledge-lane"
              style={{ '--lane-index': laneIndex }}
            >
              <div className="knowledge-lane-head">
                <span>{lane.label}</span>
                <p>{lane.hint}</p>
              </div>
              <div className="knowledge-node-stack">
                {lane.nodes.map((nodeId) => {
                  const node = knowledgeNodeById.get(nodeId)
                  const stat = nodeStats[nodeId]
                  const questionCount = questionCounts[nodeId] || 0
                  return (
                    <div key={nodeId} className={`knowledge-node-card ${nodeClass(nodeId)}`}>
                      <div className="knowledge-node-title">
                        <strong>{node?.label || nodeId}</strong>
                        <span>{node?.group || '知识点'}</span>
                      </div>
                      <p>{node?.description}</p>
                      <div className="knowledge-node-metrics">
                        <span>{questionCount} 题</span>
                        <span>{stat ? `错 ${stat.wrong} 次` : '暂无错题'}</span>
                        <span>正确率 {formatAccuracy(stat)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="knowledge-type-row">
                {lane.questionTypes.map((type) => (
                  <span key={type}>{type}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    )
  }

  const visibleSubjects = activeSubject ? [activeSubject] : subjects
  const visibleNodes = visibleSubjects.flatMap((subject) =>
    knowledgeNodes.filter((node) => node.subject === subject.key).slice(0, activeSubject ? 8 : 3),
  )
  const positions = new Map()
  const rowHeight = 92
  const width = 1120
  const height = Math.max(180, visibleSubjects.length * rowHeight + 38)

  visibleSubjects.forEach((subject, rowIndex) => {
    const y = 46 + rowIndex * rowHeight
    positions.set(`subject:${subject.key}`, { x: 88, y, label: subject.name, subject })
    visibleNodes
      .filter((node) => node.subject === subject.key)
      .forEach((node, nodeIndex) => {
        positions.set(node.id, { x: 292 + nodeIndex * 194, y, label: node.label, node })
      })
  })

  return (
    <div className="knowledge-graph-wrap">
      <svg
        className="knowledge-graph"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="高考知识图谱"
      >
        {visibleSubjects.flatMap((subject) =>
          visibleNodes
            .filter((node) => node.subject === subject.key)
            .map((node) => {
              const from = positions.get(`subject:${subject.key}`)
              const to = positions.get(node.id)
              return (
                <line
                  key={`${subject.key}-${node.id}`}
                  x1={from.x + 56}
                  y1={from.y}
                  x2={to.x - 58}
                  y2={to.y}
                />
              )
            }),
        )}
        {knowledgeEdges.map(([fromId, toId, label]) => {
          const from = positions.get(fromId)
          const to = positions.get(toId)
          if (!from || !to) return null
          return (
            <g key={`${fromId}-${toId}`} className="graph-cross-edge">
              <line x1={from.x + 58} y1={from.y + 24} x2={to.x - 58} y2={to.y + 24} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 8}>
                {label}
              </text>
            </g>
          )
        })}
        {[...positions.entries()].map(([id, point]) => {
          const isSubject = id.startsWith('subject:')
          const stat = nodeStats[id]
          return (
            <g
              key={id}
              className={`graph-node ${isSubject ? 'is-subject' : nodeClass(id)}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              <rect x="-64" y="-24" width="128" height="48" rx="8" />
              <text className="graph-label" y="-2">
                {point.label}
              </text>
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

function WeaknessPanel({ attempts, questions, activeSubject, accountWeaknesses }) {
  const hasAccountStats = (accountWeaknesses || []).length > 0
  const localAttemptCount = Object.keys(attempts || {}).length
  const { weakNodes } = useMemo(
    () => summarizeKnowledgeAttempts(attempts, accountWeaknesses),
    [attempts, accountWeaknesses],
  )
  const recommendations = useMemo(
    () => recommendPracticeQuestions(questions, attempts, 9, accountWeaknesses),
    [attempts, questions, accountWeaknesses],
  )
  const visibleWeakNodes = activeSubject
    ? weakNodes.filter((item) => item.node?.subject === activeSubject.key)
    : weakNodes
  const groupedRecommendations = recommendations.reduce((groups, item) => {
    const nodeId = item.targetWeakIds[0] || item.knowledgeIds[0] || 'general'
    if (!groups[nodeId]) groups[nodeId] = []
    groups[nodeId].push(item)
    return groups
  }, {})

  return (
    <div className="weakness-panel">
      <article>
        <h3>薄弱环节</h3>
        {hasAccountStats && <p className="weakness-source">已合并账号做题记录。</p>}
        {!hasAccountStats && localAttemptCount > 0 && (
          <p className="weakness-source">根据本机 {localAttemptCount} 条做题记录生成。</p>
        )}
        {visibleWeakNodes.length > 0 ? (
          <div className="weakness-list">
            {visibleWeakNodes.slice(0, 6).map((item) => (
              <div key={item.id}>
                <strong>{item.node?.label || item.id}</strong>
                <span>
                  错 {item.wrong} 次 · 正确率 {Math.round(item.accuracy * 100)}%
                </span>
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
          <>
            <div className="practice-route">
              {recommendations.slice(0, 3).map(({ question, questionType, reasons }, index) => (
                <button
                  type="button"
                  key={questionRenderKey(question, index, 'practice-route')}
                  onClick={() => scrollToPracticeQuestion(question.id)}
                >
                  <span>第 {index + 1} 步</span>
                  <strong>{questionType}</strong>
                  <em>{reasons[0] || '补齐练习'}</em>
                </button>
              ))}
            </div>
            <div className="recommend-groups">
              {Object.entries(groupedRecommendations).map(([nodeId, items]) => (
                <div key={nodeId} className="recommend-group">
                  <div className="recommend-group-head">
                    <strong>{knowledgeNodeById.get(nodeId)?.label || '综合补练'}</strong>
                    <span>{items.length} 题</span>
                  </div>
                  <div className="recommend-list">
                    {items.slice(0, 3).map(({ question, knowledgeIds, questionType, reasons }) => (
                      <button
                        type="button"
                        key={questionRenderKey(question, nodeId, questionType)}
                        onClick={() => scrollToPracticeQuestion(question.id)}
                      >
                        <strong>{question.title}</strong>
                        <span>
                          {questionType} ·{' '}
                          {knowledgeIds
                            .map((id) => knowledgeNodeById.get(id)?.label || id)
                            .join(' / ')}
                        </span>
                        <em>{reasons.join(' · ')}</em>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>当前没有薄弱点记录，先从任意一题开始反馈即可。</p>
        )}
      </article>
    </div>
  )
}

function QuestionCard({ question, isDone, onDone, attempt, onAttempt, anchorId }) {
  const [open, setOpen] = useState(false)
  const knowledgeIds = getQuestionKnowledgeIds(question)
  const knowledgeLabels = knowledgeIds.map(
    (id) => knowledgeNodes.find((node) => node.id === id)?.label || id,
  )
  const solution = Array.isArray(question.solution) ? question.solution : []
  const detailedSolution = buildDetailedSolutionSteps(question, knowledgeLabels)
  const difficultyLabel = difficultyLabels[question.difficulty] || question.difficulty || '待标注'

  return (
    <article
      id={anchorId}
      data-practice-question-id={question.id}
      className={`gaokao-question ${isDone ? 'is-complete' : ''} ${attempt ? `attempt-${attempt.result}` : ''}`}
    >
      <div className="question-topline">
        <span>{question.year}</span>
        <span>{subjects.find((item) => item.key === question.subject)?.name}</span>
        <span>{question.sourceType}</span>
        <span className={`difficulty difficulty-${question.difficulty || 'unknown'}`}>
          {difficultyLabel}
        </span>
      </div>
      <h3>{question.title}</h3>
      <div className="knowledge-tags">
        {knowledgeLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <pre className="question-prompt">{question.prompt}</pre>
      <div className="question-actions">
        <button
          type="button"
          onClick={() => {
            setOpen((value) => {
              const nextOpen = !value
              if (nextOpen) onDone(question.id)
              return nextOpen
            })
          }}
        >
          {open ? '收起题解' : '查看标准答案与分步思路'}
        </button>
        <button
          type="button"
          className={attempt?.result === 'correct' ? 'is-selected' : ''}
          onClick={() => onAttempt(question, 'correct')}
        >
          做对了
        </button>
        <button
          type="button"
          className={attempt?.result === 'wrong' ? 'is-selected is-wrong' : ''}
          onClick={() => onAttempt(question, 'wrong')}
        >
          做错了
        </button>
      </div>
      {attempt && (
        <div className="attempt-note">
          已记录：{attempt.result === 'correct' ? '掌握' : '薄弱'} ·{' '}
          {new Date(attempt.updatedAt).toLocaleString('zh-CN', { hour12: false })}
        </div>
      )}
      {open && (
        <div className="question-explain">
          <div className="standard-answer">
            <span>标准答案</span>
            <strong>{question.answer}</strong>
          </div>
          <div className="detailed-solution">
            <div className="solution-title">
              <span>解题思路</span>
              <strong>按标准答案拆解的分步骤路径</strong>
            </div>
            <ol>
              {detailedSolution.map((step, index) => (
                <li key={`${step.title}-${index}`}>
                  <span>{step.title}</span>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
          {solution.length > 0 ? (
            <details className="source-solution">
              <summary>查看原始题解依据</summary>
              <ol>
                {solution.map((step, index) => (
                  <li key={`${question.id}-source-${index}`}>{step}</li>
                ))}
              </ol>
            </details>
          ) : (
            <p className="question-empty-detail">原始解析待补全，已根据标准答案生成基础思路。</p>
          )}
        </div>
      )}
    </article>
  )
}

function ExtractedQuestionCard({ file, question }) {
  const displayQuestion = applyAnswerOverride(question)
  const flags = displayQuestion.flags || []
  const hasAnswer = Boolean(displayQuestion.answer)
  const hasSolution = Array.isArray(displayQuestion.solution) && displayQuestion.solution.length > 0

  return (
    <article className={`extract-card extract-${question.quality}`}>
      <div className="question-topline">
        <span>{file.year}</span>
        <span>{file.subjectName}</span>
        <span>{extractedQualityLabels[question.quality] || '待整理'}</span>
      </div>
      <h3>
        {file.source} · 第 {question.number} 题
      </h3>
      {file.analysisSource && <p className="analysis-source">解析来源：{file.analysisSource}</p>}
      <pre className="question-prompt">{displayQuestion.prompt}</pre>
      {hasAnswer && (
        <div className="extract-answer">
          <strong>参考答案</strong>
          <span>{displayQuestion.answer}</span>
        </div>
      )}
      {hasSolution && (
        <div className="extract-solution">
          <strong>解析摘录</strong>
          <ol>
            {displayQuestion.solution.map((step, index) => (
              <li key={`${question.number}-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {flags.length > 0 && (
        <div className="extract-flags">
          {flags.map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
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
  const displayQuestion = applyAnswerOverride(question, {
    dataset: 'jiangsu-gaokao-ocr.json',
    source: ocrQuestions.source?.filename,
    relativePath: ocrQuestions.source?.relativePath,
  })
  const score = Math.round((question.averageScore || 0) * 100)
  const hasAnswer = Boolean(displayQuestion.answer)

  return (
    <article className="ocr-card">
      <div className="question-topline">
        <span>2026</span>
        <span>江苏数学</span>
        <span>{question.type}</span>
        <span>置信度 {score}%</span>
      </div>
      <h3>扫描卷 OCR · 第 {question.number} 题</h3>
      <pre className="question-prompt">{displayQuestion.prompt}</pre>
      {hasAnswer && (
        <div className="extract-answer">
          <strong>参考答案</strong>
          <span>{displayQuestion.answer}</span>
        </div>
      )}
      <div className="extract-flags">
        {(displayQuestion.flags || []).map((flag) => (
          <span key={flag}>{flag}</span>
        ))}
      </div>
      <p className="extract-note">
        该题来自 2026 江苏数学 PDF
        扫描识别。题干顺序已按双栏版面整理，公式、根号、上下标和图形信息仍需人工复核。
      </p>
    </article>
  )
}

function SubjectYearCard({ year, cell }) {
  return (
    <article className="subject-year-card">
      <strong>{year}</strong>
      <span>资料 {cell?.total || 0} 份</span>
      <small>
        可抽取 {cell?.byStatus?.extractable || 0} · 需转换{' '}
        {cell?.byStatus?.['needs-conversion'] || 0} · OCR {cell?.byStatus?.['needs-ocr-check'] || 0}
      </small>
    </article>
  )
}

function QuestionLoadControls({ status, pageInfo, error, onLoadMore }) {
  const totalCount = pageInfo?.totalCount ?? pageInfo?.totalLoaded ?? 0
  const loadedCount = pageInfo?.totalLoaded ?? 0
  return (
    <div className="question-load-state">
      <span>
        {status === 'loading'
          ? '正在加载当前批次'
          : `已加载 ${loadedCount}${totalCount ? `/${totalCount}` : ''} 题`}
      </span>
      {error && <span className="question-load-error">接口状态：{error}</span>}
      {pageInfo?.hasMore && (
        <button type="button" onClick={onLoadMore} disabled={status === 'loadingMore'}>
          {status === 'loadingMore' ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  )
}

export default function GaokaoPage() {
  const params = useParams()
  const subjectSlug = (params['*'] || '').replace(/^\/+|\/+$/g, '').split('/')[0]
  const activeSubject = subjects.find((subject) => subject.key === subjectSlug)
  const isSubjectPage = Boolean(subjectSlug)
  const subjectNotFound = isSubjectPage && !activeSubject
  const pageNavLinks = useMemo(() => {
    if (!activeSubject) return navLinks
    const links = [
      {
        id: 'subject-overview',
        label: `${activeSubject.name}概览`,
        keywords: `${activeSubject.name} 高考 概览`,
      },
      { id: 'subject-trend', label: '命题趋势', keywords: `${activeSubject.name} 趋势 高频考点` },
      {
        id: 'subject-knowledge',
        label: '知识图谱',
        keywords: `${activeSubject.name} 知识图谱 薄弱点`,
      },
      { id: 'subject-years', label: '年份资料', keywords: `${activeSubject.name} 年份 资料` },
      { id: 'subject-extracts', label: '真实样本', keywords: `${activeSubject.name} 题干 解析` },
      { id: 'subject-practice', label: '扩展训练', keywords: `${activeSubject.name} 练习 题解` },
      { id: 'subject-advice', label: '复习建议', keywords: `${activeSubject.name} 建议 易错` },
    ]
    if (activeSubject.key === 'math') {
      links.splice(3, 0, {
        id: 'subject-gene',
        label: '数学基因',
        keywords: '数学 出题基因 OCR 迁移',
      })
    }
    return links
  }, [activeSubject])

  const [filters, setFilters] = useState(() =>
    loadJson('gaokao_jiangsu_filters', {
      subject: 'all',
      difficulty: 'all',
    }),
  )
  const requestedQuestionSubject =
    activeSubject?.key || (filters.subject !== 'all' ? filters.subject : '')
  const questionQuery = useMemo(
    () => ({
      subject: requestedQuestionSubject,
      difficulty: filters.difficulty,
    }),
    [filters.difficulty, requestedQuestionSubject],
  )
  const [completed, setCompleted] = useState(() => new Set(loadJson('gaokao_jiangsu_done', [])))
  const [attempts, setAttempts] = useState(() => loadJson('gaokao_knowledge_attempts', {}))
  const [dbQuestionState, setDbQuestionState] = useState({
    status: 'idle',
    questions: [],
    error: null,
    pageInfo: { nextCursor: null, hasMore: false, totalLoaded: 0, totalCount: null },
  })
  const [accountWeaknessState, setAccountWeaknessState] = useState({ userId: null, rows: [] })
  const { user, syncStudyEvent, syncGaokaoAttempt, fetchGaokaoWeaknesses } = useAuth()
  const accountWeaknesses =
    accountWeaknessState.userId === user?.id ? accountWeaknessState.rows : []

  const fetchQuestionBatch = useCallback(
    async ({ cursor, signal } = {}) => {
      const params = new URLSearchParams({ limit: String(QUESTION_BATCH_SIZE) })
      if (questionQuery.subject) params.set('subject', questionQuery.subject)
      if (questionQuery.difficulty !== 'all') params.set('difficulty', questionQuery.difficulty)
      if (cursor) params.set('cursor', cursor)

      const response = await fetch(`${API_BASE}/api/gaokao/questions?${params.toString()}`, {
        credentials: 'include',
        signal,
      })
      if (!response.ok) throw new Error(`request_failed_${response.status}`)
      return response.json()
    },
    [questionQuery],
  )

  const loadMoreQuestions = useCallback(() => {
    const cursor = dbQuestionState.pageInfo?.nextCursor
    if (!cursor || dbQuestionState.status === 'loading' || dbQuestionState.status === 'loadingMore')
      return

    setDbQuestionState((prev) => ({ ...prev, status: 'loadingMore', error: null }))
    fetchQuestionBatch({ cursor })
      .then((data) => {
        const incoming = (data.questions || [])
          .map(normalizeDbQuestion)
          .filter((question) => question.id && question.subject && question.prompt)
        setDbQuestionState((prev) => {
          const merged = new Map(prev.questions.map((question) => [question.id, question]))
          incoming.forEach((question) => merged.set(question.id, question))
          const questions = [...merged.values()]
          const pageInfo = data.pageInfo || {
            nextCursor: null,
            hasMore: false,
            totalLoaded: questions.length,
            totalCount: questions.length,
          }
          writeQuestionIndexCache(questionQuery, questions, pageInfo)
          return { status: 'ready', questions, error: null, pageInfo }
        })
      })
      .catch((error) => {
        setDbQuestionState((prev) => ({ ...prev, status: 'ready', error: error.message }))
      })
  }, [
    dbQuestionState.pageInfo?.nextCursor,
    dbQuestionState.status,
    fetchQuestionBatch,
    questionQuery,
  ])

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
    const controller = new AbortController()
    if (subjectNotFound) {
      return () => controller.abort()
    }

    const loadingTimer = window.setTimeout(() => {
      if (!controller.signal.aborted) {
        setDbQuestionState({
          status: 'loading',
          questions: [],
          error: null,
          pageInfo: { nextCursor: null, hasMore: false, totalLoaded: 0, totalCount: null },
        })
      }
    }, 0)
    fetchQuestionBatch({ signal: controller.signal })
      .then((data) => {
        const questions = (data.questions || [])
          .map(normalizeDbQuestion)
          .filter((question) => question.id && question.subject && question.prompt)
        const pageInfo = data.pageInfo || {
          nextCursor: null,
          hasMore: false,
          totalLoaded: questions.length,
          totalCount: questions.length,
        }
        writeQuestionIndexCache(questionQuery, questions, pageInfo)
        setDbQuestionState({ status: 'ready', questions, error: null, pageInfo })
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setDbQuestionState({
          status: 'fallback',
          questions: [],
          error: error.message,
          pageInfo: { nextCursor: null, hasMore: false, totalLoaded: 0, totalCount: null },
        })
      })
    return () => {
      window.clearTimeout(loadingTimer)
      controller.abort()
    }
  }, [fetchQuestionBatch, questionQuery, subjectNotFound])

  useEffect(() => {
    let cancelled = false
    if (!user) {
      return () => {
        cancelled = true
      }
    }
    fetchGaokaoWeaknesses().then((rows) => {
      if (!cancelled) setAccountWeaknessState({ userId: user.id, rows })
    })
    return () => {
      cancelled = true
    }
  }, [fetchGaokaoWeaknesses, user])

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    sidebar.querySelectorAll('.nav-group').forEach((group) => group.remove())

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

    pageNavLinks.forEach((link) => {
      const item = document.createElement('a')
      item.href = `#${link.id}`
      item.textContent = link.label
      item.dataset.keywords = link.keywords
      item.onclick = (event) => {
        event.preventDefault()
        document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        sidebar.classList.remove('open')
        document.querySelector('.sidebar-overlay')?.classList.remove('show')
      }
      group.appendChild(item)
    })
    sidebar.appendChild(group)

    const navItems = [...group.querySelectorAll('a')]
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          navItems.forEach((item) => item.classList.remove('active'))
          group.querySelector(`a[href="#${entry.target.id}"]`)?.classList.add('active')
        })
      },
      { rootMargin: '-20% 0px -65% 0px' },
    )
    pageNavLinks.forEach((link) => {
      const target = document.getElementById(link.id)
      if (target) observer.observe(target)
    })
    return () => observer.disconnect()
  }, [activeSubject, pageNavLinks])

  const dbQuestions = dbQuestionState.questions
  const usingFallbackQuestions = dbQuestionState.status === 'fallback'
  const questionLibrary = usingFallbackQuestions ? practiceQuestions : dbQuestions
  const questionLibraryLabel = usingFallbackQuestions ? '本地兜底题' : '后端题库'
  const questionPageInfo = dbQuestionState.pageInfo || {
    nextCursor: null,
    hasMore: false,
    totalLoaded: questionLibrary.length,
    totalCount: null,
  }
  const totalQuestionCount = questionPageInfo.totalCount ?? questionLibrary.length
  const answeredQuestionCount = questionLibrary.filter(
    (question) => question.answer && question.answer !== '答案待补全',
  ).length

  const filteredQuestions = useMemo(() => {
    return questionLibrary.filter((question) => {
      if (filters.subject !== 'all' && question.subject !== filters.subject) return false
      if (filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) return false
      return true
    })
  }, [filters, questionLibrary])

  const extractedSamples = useMemo(() => {
    return extractedLibraries
      .flatMap((library) => library.files || [])
      .flatMap((file) => file.questions.map((question) => ({ file, question })))
      .filter((item) => item.question.prompt.length >= 20)
      .sort(
        (left, right) =>
          (extractedQualityOrder[left.question.quality] ?? 9) -
          (extractedQualityOrder[right.question.quality] ?? 9),
      )
  }, [])

  const subjectExtractedSamples = useMemo(() => {
    if (!activeSubject) return []
    return extractedLibraries
      .flatMap((library) => library.files || [])
      .filter((file) => file.subject === activeSubject.key)
      .flatMap((file) => file.questions.map((question) => ({ file, question })))
      .filter((item) => item.question.prompt.length >= 20)
      .sort(
        (left, right) =>
          (extractedQualityOrder[left.question.quality] ?? 9) -
          (extractedQualityOrder[right.question.quality] ?? 9),
      )
  }, [activeSubject])

  const subjectPracticeQuestions = useMemo(() => {
    if (!activeSubject) return []
    return questionLibrary.filter((question) => question.subject === activeSubject.key)
  }, [activeSubject, questionLibrary])

  const subjectYearRows = useMemo(() => {
    if (!activeSubject) return []
    return gaokaoIndex.yearSummaries.map((summary) => ({
      year: summary.year,
      cell: gaokaoIndex.matrix[summary.year][activeSubject.key],
    }))
  }, [activeSubject])

  const completeQuestion = (id) => {
    setCompleted((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const question = questionLibrary.find((item) => item.id === id)
    syncStudyEvent({
      eventType: 'practice_done',
      course: 'gaokao',
      subject: question?.subject || activeSubject?.key || null,
      pagePath: window.location.pathname,
      objectId: id,
      payload: {
        sourceType: question?.sourceType || null,
        difficulty: question?.difficulty || null,
      },
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
    setAttempts((prev) => ({ ...prev, [question.id]: nextAttempt }))
    setCompleted((prev) => {
      const next = new Set(prev)
      next.add(question.id)
      return next
    })
    if (user) {
      setAccountWeaknessState((prev) => ({
        userId: user.id,
        rows: mergeAccountWeaknesses(
          prev.userId === user.id ? prev.rows : [],
          knowledgeIds,
          result,
        ),
      }))
    }
    syncGaokaoAttempt({
      questionKey: question.id,
      subjectKey: question.subject,
      result,
      knowledgeNodes: knowledgeIds,
      promptSnapshot: truncateText(question.prompt, 4000),
      answerSnapshot: truncateText(question.answer, 2000),
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
    files: extractedLibraries.reduce((total, library) => total + (library.summary?.files || 0), 0),
    questions: extractedLibraries.reduce(
      (total, library) => total + (library.summary?.questions || 0),
      0,
    ),
    matchedQuestions: extractedLibraries.reduce(
      (total, library) => total + (library.summary?.matchedQuestions || 0),
      0,
    ),
    reviewQuestions: extractedLibraries.reduce(
      (total, library) => total + (library.summary?.reviewQuestions || 0),
      0,
    ),
    answerOverrides: answerOverrides.summary?.overrides || 0,
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
          <Link className="subject-back-link" to="/courses/gaokao/">
            返回九科总览
          </Link>
        </section>
      </div>
    )
  }

  if (activeSubject) {
    return (
      <div
        className="gaokao-page subject-page"
        style={{ '--subject-accent': activeSubject.accent }}
      >
        <section id="subject-overview" className="gaokao-hero subject-hero">
          <div>
            <span className="eyebrow">高中内容 · 江苏高考 · {activeSubject.name}</span>
            <h1>{activeSubject.name}高考专题</h1>
            <p>{activeSubject.trend}</p>
            <Link className="subject-back-link" to="/courses/gaokao/">
              返回九科总览
            </Link>
          </div>
          <div className="hero-metrics" aria-label={`${activeSubject.name}专题统计`}>
            <div>
              <strong>
                {subjectYearRows.reduce((sum, item) => sum + (item.cell?.total || 0), 0)}
              </strong>
              <span>资料索引</span>
            </div>
            <div>
              <strong>{subjectExtractedSamples.length}</strong>
              <span>真实样本</span>
            </div>
            <div>
              <strong>{subjectPracticeQuestions.length}</strong>
              <span>{questionLibraryLabel}</span>
            </div>
            <div>
              <strong>{activeSubject.highFrequency.length}</strong>
              <span>高频能力点</span>
            </div>
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
                {activeSubject.highFrequency.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
            <article>
              <h3>常见失分点</h3>
              <ul className="compact-list">
                {activeSubject.easyMistakes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section id="subject-knowledge" className="gaokao-section">
          <div className="section-heading">
            <span>Knowledge Graph</span>
            <h2>{activeSubject.name}知识图谱与薄弱点</h2>
          </div>
          <KnowledgeGraph
            activeSubject={activeSubject}
            attempts={attempts}
            accountWeaknesses={accountWeaknesses}
            questions={subjectPracticeQuestions}
          />
          <QuestionTaxonomyPanel
            questions={subjectPracticeQuestions}
            activeSubject={activeSubject}
            attempts={attempts}
            accountWeaknesses={accountWeaknesses}
          />
          <WeaknessPanel
            attempts={attempts}
            questions={subjectPracticeQuestions}
            activeSubject={activeSubject}
            accountWeaknesses={accountWeaknesses}
          />
        </section>

        <section id="subject-years" className="gaokao-section">
          <div className="section-heading">
            <span>Years</span>
            <h2>年份资料</h2>
          </div>
          <div className="subject-year-grid">
            {subjectYearRows.map((item) => (
              <SubjectYearCard key={item.year} year={item.year} cell={item.cell} />
            ))}
          </div>
        </section>

        {activeSubject.key === 'math' && (
          <section id="subject-gene" className="gaokao-section">
            <div className="section-heading">
              <span>Question Gene</span>
              <h2>数学出题基因与 2026 OCR 样本</h2>
            </div>
            <div className="prep-grid">
              {genePatterns
                .filter((block) => block.title.includes('数学'))
                .map((block) => (
                  <article key={block.title}>
                    <h3>{block.title}</h3>
                    <ul>
                      {block.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </article>
                ))}
            </div>
            <div className="ocr-grid subject-ocr-grid">
              {ocrQuestions.questions.slice(0, 6).map((question, index) => (
                <OcrQuestionCard
                  key={questionRenderKey(question, index, 'subject-ocr')}
                  question={question}
                />
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
              {subjectExtractedSamples.map(({ file, question }, index) => (
                <ExtractedQuestionCard
                  key={`${file.year}-${file.subject}-${file.source}-${question.number}-${index}`}
                  file={file}
                  question={question}
                />
              ))}
            </div>
          ) : (
            <p className="extract-intro">
              该科目的可展示 DOCX 样本仍在清洗中；旧 DOC、扫描件或特殊排版会继续标为待转换/待复核。
            </p>
          )}
        </section>

        <section id="subject-practice" className="gaokao-section">
          <div className="section-heading">
            <span>Practice</span>
            <h2>扩展训练</h2>
          </div>
          {subjectPracticeQuestions.length > 0 ? (
            <>
              <QuestionLoadControls
                status={dbQuestionState.status}
                pageInfo={questionPageInfo}
                error={dbQuestionState.error}
                onLoadMore={loadMoreQuestions}
              />
              <div className="question-grid">
                {subjectPracticeQuestions.map((question, index) => (
                  <QuestionCard
                    key={questionRenderKey(question, index, 'subject-practice')}
                    anchorId={practiceAnchorId(question, index, 'subject-practice')}
                    question={question}
                    isDone={completed.has(question.id)}
                    onDone={completeQuestion}
                    attempt={attempts[question.id]}
                    onAttempt={recordAttempt}
                  />
                ))}
              </div>
              <QuestionLoadControls
                status={dbQuestionState.status}
                pageInfo={questionPageInfo}
                error={null}
                onLoadMore={loadMoreQuestions}
              />
            </>
          ) : (
            <>
              <QuestionLoadControls
                status={dbQuestionState.status}
                pageInfo={questionPageInfo}
                error={dbQuestionState.error}
                onLoadMore={loadMoreQuestions}
              />
              <p className="extract-intro">
                该科扩展训练题会按真实题型和教材顺序继续补充；当前先展示趋势、资料和真实样本。
              </p>
            </>
          )}
        </section>

        <section id="subject-advice" className="gaokao-section">
          <div className="section-heading">
            <span>Advice</span>
            <h2>复习建议</h2>
          </div>
          <div className="subject-advice">{activeSubject.advice}</div>
          <p className="extract-intro">
            本学科页面只显示与 {activeSubject.name} 相关的资料与题目；总览页仍保留九科矩阵、全局 OCR
            和来源说明。
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
            本页把江苏近十年高考放在同一条时间线上观察：2017-2020 作为江苏自主命题对照， 2021
            以后按江苏使用的新高考全国Ⅰ卷 / 新课标Ⅰ卷主线分析。页面先呈现严谨可追溯的资料状态、
            九科命题趋势和完整训练题解；扫描件和旧 .doc 文件在 OCR 或转换前不会被标成已完整入库。
          </p>
        </div>
        <div className="hero-metrics" aria-label="专题统计">
          <div>
            <strong>10</strong>
            <span>年份范围</span>
          </div>
          <div>
            <strong>9</strong>
            <span>覆盖科目</span>
          </div>
          <div>
            <strong>{totalQuestionCount}</strong>
            <span>题库题目</span>
          </div>
          <div>
            <strong>{gaokaoIndex.totals.coveredCells}/90</strong>
            <span>资料格覆盖</span>
          </div>
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
          {coverage.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
        <div className="coverage-strip index-strip">
          {indexCoverage.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
        <div className="index-note">
          索引生成时间：{formatGeneratedAt(gaokaoIndex.generatedAt)}
          。脚本只记录文件名和相对路径，不把本地绝对路径写入网页数据。
        </div>
        <div className="index-table-wrap" aria-label="江苏高考资料索引表">
          <table className="index-table">
            <thead>
              <tr>
                <th>年份</th>
                {gaokaoIndex.subjects.map((subject) => (
                  <th key={subject.key}>{subject.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaokaoIndex.yearSummaries.map((summary) => (
                <tr key={summary.year}>
                  <th>
                    <strong>{summary.year}</strong>
                    <span>
                      {summary.coveredSubjects}/{summary.totalSubjects} 科
                    </span>
                  </th>
                  {gaokaoIndex.subjects.map((subject) => {
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
          {years.map((item) => (
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
          {subjects.map((subject) => (
            <article
              key={subject.key}
              className="subject-card"
              style={{ '--subject-accent': subject.accent }}
            >
              <div className="subject-title">
                <div className="subject-icon">
                  <SvgIcon name={subject.icon} />
                </div>
                <h3>{subject.name}</h3>
              </div>
              <p>{subject.trend}</p>
              <h4>高频能力点</h4>
              <div className="tag-cloud">
                {subject.highFrequency.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <h4>常见失分点</h4>
              <ul className="compact-list">
                {subject.easyMistakes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
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
          {genePatterns.map((block) => (
            <article key={block.title}>
              <h3>{block.title}</h3>
              <ul>
                {block.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
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
        <KnowledgeGraph
          attempts={attempts}
          accountWeaknesses={accountWeaknesses}
          questions={questionLibrary}
        />
        <QuestionTaxonomyPanel
          questions={questionLibrary}
          attempts={attempts}
          accountWeaknesses={accountWeaknesses}
        />
        <WeaknessPanel
          attempts={attempts}
          questions={questionLibrary}
          accountWeaknesses={accountWeaknesses}
        />
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
          这部分来自本地 2026 江苏数学扫描 PDF。页面展示的是 OCR
          题干，用于分析题型分布、情境包装和压轴结构；
          涉及公式、图形、选项排版的地方先标记为待复核，不混入正式题解练习。
        </p>
        <div className="ocr-grid">
          {ocrQuestions.questions.map((question, index) => (
            <OcrQuestionCard key={questionRenderKey(question, index, 'ocr')} question={question} />
          ))}
        </div>
      </section>

      <section id="extracts" className="gaokao-section">
        <div className="section-heading">
          <span>Extracted Sources</span>
          <h2>真实题干结构化题库</h2>
        </div>
        <div className="extract-summary">
          <span>来源文件 {combinedExtractSummary.files} 份</span>
          <span>抽取题干 {combinedExtractSummary.questions} 题</span>
          <span>已匹配解析 {combinedExtractSummary.matchedQuestions ?? 0} 题</span>
          <span>本地补答 {combinedExtractSummary.answerOverrides} 题</span>
          <span>需核验 {combinedExtractSummary.reviewQuestions} 题</span>
        </div>
        <p className="extract-intro">
          这一栏来自真实 DOCX 与带文本层 PDF 试卷抽取，已合并 2020-2025 江苏/新高考样本、2026
          审计清单中的 DOCX 和可直接读文本的
          PDF。含公式、图片、复杂表格的题目可能会丢失部分内容，因此带有质量标记；
          已匹配解析的样本会展示答案与解析摘录，但在人工复核前仍不替代正式练习区。
        </p>
        <div className="extract-grid">
          {extractedSamples.map(({ file, question }, index) => (
            <ExtractedQuestionCard
              key={`${file.year}-${file.subject}-${file.source}-${question.number}-${index}`}
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
            <select
              value={filters.subject}
              onChange={(event) => setFilters({ ...filters, subject: event.target.value })}
            >
              <option value="all">全部科目</option>
              {subjects.map((subject) => (
                <option key={subject.key} value={subject.key}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            难度
            <select
              value={filters.difficulty}
              onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}
            >
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setFilters({ subject: 'all', difficulty: 'all' })}>
            重置
          </button>
        </div>
        <div className="question-summary">
          <span>
            {questionLibraryLabel}
            {dbQuestionState.status === 'loading' ? '加载中' : ''}
          </span>
          <span>
            已补答案 {answeredQuestionCount}/{questionLibrary.length}
          </span>
          <span>
            已查看 {completed.size}/{questionLibrary.length}
          </span>
          <span>当前筛选 {filteredQuestions.length} 题</span>
        </div>
        <QuestionLoadControls
          status={dbQuestionState.status}
          pageInfo={questionPageInfo}
          error={dbQuestionState.error}
          onLoadMore={loadMoreQuestions}
        />
        <div className="question-grid">
          {filteredQuestions.map((question, index) => (
            <QuestionCard
              key={questionRenderKey(question, index, 'filtered-practice')}
              anchorId={practiceAnchorId(question, index, 'filtered-practice')}
              question={question}
              isDone={completed.has(question.id)}
              onDone={completeQuestion}
              attempt={attempts[question.id]}
              onAttempt={recordAttempt}
            />
          ))}
        </div>
        <QuestionLoadControls
          status={dbQuestionState.status}
          pageInfo={questionPageInfo}
          error={null}
          onLoadMore={loadMoreQuestions}
        />
      </section>

      <section id="sources" className="gaokao-section sources-section">
        <div className="section-heading">
          <span>Sources</span>
          <h2>来源与处理口径</h2>
        </div>
        <p>
          访问与整理日期：{sourceDate}。本页优先使用本地资料目录作为证据来源； 数学迁移规则使用个人
          Skill gaokao-question-gene。资料索引由 `scripts/build-gaokao-index.mjs`
          从本地目录生成，DOCX 候选题干由 `scripts/extract-gaokao-docx.py`
          抽取；后续逐题入库时，会继续区分“真实原题”“解析摘录”“AI 迁移题”。
        </p>
        <div className="source-list">
          {sources.map((source) => (
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
