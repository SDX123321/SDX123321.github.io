import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import pg from 'pg'
import { z } from 'zod'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

export const DEFAULT_OUT_DIR = path.join(projectRoot, 'datasets', 'langsmith', 'gaokao')
export const DATASET_VERSION = 'gaokao-langsmith-v1'

export const subjectOrder = [
  'chinese',
  'math',
  'english',
  'physics',
  'chemistry',
  'biology',
  'politics',
  'history',
  'geography',
]

export const subjectNames = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  politics: '政治',
  history: '历史',
  geography: '地理',
}

const graphPlan = [
  ['loadRows', '从 PostgreSQL 读取 gaokao_questions 和标签，保留数据库为权威源。'],
  ['auditRows', '按 LangSmith 数据集要求过滤缺题干、缺答案、缺题解和软删除题。'],
  [
    'enrichMissingSolutions',
    '可选调用 OpenAI-compatible 本地模型，用 LangChain structured output 生成分步题解。',
  ],
  ['groupBySubject', '按 subject_key 分学科聚合成 LangSmith examples。'],
  ['writeDatasets', '写入 gaokao-*.jsonl、manifest.json 和 skipped.jsonl 审计表。'],
]

const DEFAULT_THREAD_ID = `gaokao-langsmith-${new Date().toISOString().replace(/[:.]/g, '-')}`

export function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    subject: null,
    includeHidden: false,
    includeAnswerOnly: false,
    limit: null,
    minSolutionChars: 1,
    enrichMissingSolutions: false,
    enrichLimit: 25,
    modelUrl: process.env.LOCAL_MODEL_URL || null,
    modelName: process.env.LOCAL_MODEL_NAME || null,
    modelApiKey: process.env.LOCAL_MODEL_API_KEY || process.env.OPENAI_API_KEY || 'local-model',
    threadId: process.env.LANGGRAPH_THREAD_ID || DEFAULT_THREAD_ID,
    printGraphPlan: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[++index]
    if (arg === '--out') options.outDir = path.resolve(projectRoot, next())
    else if (arg === '--subject') options.subject = next()
    else if (arg === '--include-hidden') options.includeHidden = true
    else if (arg === '--include-answer-only') options.includeAnswerOnly = true
    else if (arg === '--limit') options.limit = Number(next())
    else if (arg === '--min-solution-chars') options.minSolutionChars = Number(next())
    else if (arg === '--enrich-missing-solutions') options.enrichMissingSolutions = true
    else if (arg === '--enrich-limit') options.enrichLimit = Number(next())
    else if (arg === '--model-url') options.modelUrl = next()
    else if (arg === '--model-name') options.modelName = next()
    else if (arg === '--thread-id') options.threadId = next()
    else if (arg === '--print-graph-plan') options.printGraphPlan = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive integer')
  }
  if (!Number.isFinite(options.minSolutionChars) || options.minSolutionChars < 0) {
    throw new Error('--min-solution-chars must be a non-negative number')
  }
  if (!Number.isInteger(options.enrichLimit) || options.enrichLimit < 0) {
    throw new Error('--enrich-limit must be a non-negative integer')
  }
  if (options.enrichMissingSolutions && (!options.modelUrl || !options.modelName)) {
    throw new Error(
      '--enrich-missing-solutions requires LOCAL_MODEL_URL and LOCAL_MODEL_NAME, or --model-url and --model-name',
    )
  }
  return options
}

export function printHelp() {
  console.log(`Usage: node scripts/langchain/gaokao-dataset-graph.mjs [options]

Run the Gaokao LangSmith dataset workflow through LangGraph.

Options:
  --out DIR                    Output directory. Default: datasets/langsmith/gaokao
  --subject KEY                Export one subject only, e.g. math or chinese
  --include-answer-only        Include active questions that have an answer but no solution steps
  --include-hidden             Include questions marked metadata.cleanup.status=soft_deleted
  --limit N                    Limit total loaded rows before filtering
  --min-solution-chars N       Minimum joined solution character count. Default: 1
  --enrich-missing-solutions   Use a local OpenAI-compatible model to fill missing solution steps
  --enrich-limit N             Max rows to enrich in one run. Default: 25
  --model-url URL              OpenAI-compatible base URL. Defaults to LOCAL_MODEL_URL
  --model-name NAME            Chat model name. Defaults to LOCAL_MODEL_NAME
  --thread-id ID               LangGraph checkpoint thread id
  --print-graph-plan           Print the graph design and exit
  -h, --help                   Show this help

Each JSONL row uses LangSmith-compatible keys: inputs, outputs, metadata.
`)
}

export function printGraphPlan() {
  console.log(
    JSON.stringify(
      {
        graph: 'gaokao-langsmith-dataset',
        runtime: 'LangGraph StateGraph + LangChain structured output',
        nodes: graphPlan.map(([id, purpose]) => ({ id, purpose })),
        highLeverageFeatures: [
          'StateGraph nodes expose clear checkpoints for data loading, auditing, optional enrichment, grouping, and writing.',
          'MemorySaver checkpointing makes a run addressable by thread_id for local debugging and future durable checkpoint backends.',
          'LangChain structured output keeps generated solution steps schema-stable when enrichment is enabled.',
          'LangSmith tracing can be enabled with LANGSMITH_TRACING=true without changing the graph code.',
        ],
      },
      null,
      2,
    ),
  )
}

function normalizeList(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item) return ''
        if (typeof item === 'object') return item.tag || item.value || item.name || ''
        return item
      })
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') return [value.trim()].filter(Boolean)
  return []
}

function normalizeSolution(solution) {
  if (Array.isArray(solution)) return solution.map((item) => compactText(item)).filter(Boolean)
  if (typeof solution === 'string') return [compactText(solution)].filter(Boolean)
  return []
}

function compactText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function hasUsableAnswer(answer) {
  const text = compactText(answer)
  return Boolean(text) && text !== '答案待补全'
}

function cleanupStatus(row) {
  return row.metadata?.cleanup?.status || null
}

function reasonForSkip(row, solutionSteps, options) {
  if (!options.includeHidden && cleanupStatus(row) === 'soft_deleted') return 'soft_deleted'
  if (!compactText(row.prompt)) return 'missing_prompt'
  if (!hasUsableAnswer(row.answer)) return 'missing_answer'
  const solutionLength = solutionSteps.join('\n').length
  if (!options.includeAnswerOnly && solutionSteps.length === 0) return 'missing_solution'
  if (!options.includeAnswerOnly && solutionLength < options.minSolutionChars)
    return 'short_solution'
  return null
}

function canAttemptEnrichment(row, reason, options) {
  if (!options.enrichMissingSolutions) return false
  if (reason !== 'missing_solution' && reason !== 'short_solution') return false
  if (!compactText(row.prompt) || !hasUsableAnswer(row.answer)) return false
  if (!options.includeHidden && cleanupStatus(row) === 'soft_deleted') return false
  const prompt = compactText(row.prompt)
  const metadata = row.metadata || {}
  const sourceType = String(row.source_type || '').toLowerCase()
  const flags = normalizeList(row.flags).map((flag) => flag.toLowerCase())
  if (sourceType.includes('ocr') && prompt.length < 40) return false
  if (flags.some((flag) => flag.includes('incomplete') || flag.includes('missing'))) return false
  if (/作文|写作/.test(prompt)) return false
  if (metadata?.cleanup?.reason === 'incomplete') return false
  return true
}

function inferQuestionType(row) {
  if (row.question_type) return row.question_type
  const prompt = compactText(row.prompt)
  if (/作文|写作|续写/.test(prompt)) return '作文'
  if (/阅读|文本|材料|文章/.test(prompt) && row.subject_key === 'chinese') return '阅读理解'
  if (/\n?A[.．。]/.test(prompt) && /\n?B[.．。]/.test(prompt)) return '选择题'
  if (/填空|横线|空格|____|___/.test(prompt)) return '填空题'
  if (/证明|求证|解答|计算|分析|说明|论述/.test(prompt)) return '解答题'
  return '综合题'
}

function makeExample(row, solutionSteps, extraMetadata = {}) {
  const questionType = inferQuestionType(row)
  const source = row.metadata?.source || row.metadata?.paper || row.source_type || null
  const relativePath = row.metadata?.relativePath || row.metadata?.relative_path || null
  const analysisSource = row.metadata?.analysisSource || row.metadata?.analysis_source || null
  const imageUrls = normalizeList(row.metadata?.imageUrls || row.metadata?.image_urls)
  const tags = normalizeList(row.tags)
  const flags = normalizeList(row.flags)
  const solutionText = solutionSteps.join('\n')

  return {
    inputs: {
      question: compactText(row.prompt),
      subject: row.subject_name || subjectNames[row.subject_key] || row.subject_key,
      question_type: questionType,
      year: row.year,
    },
    outputs: {
      answer: compactText(row.answer),
      solution: solutionSteps,
      solution_text: solutionText,
    },
    metadata: {
      dataset_version: DATASET_VERSION,
      question_key: row.question_key,
      subject_key: row.subject_key,
      subject_name: row.subject_name || subjectNames[row.subject_key] || row.subject_key,
      question_number: row.question_number,
      question_type: questionType,
      difficulty: row.difficulty,
      quality: row.quality,
      source_type: row.source_type,
      source,
      relative_path: relativePath,
      analysis_source: analysisSource,
      tags,
      flags,
      image_urls: imageUrls,
      solution_enrichment: row.metadata?.solutionEnrichment || null,
      cleanup_status: cleanupStatus(row),
      updated_at: row.updated_at,
      ...extraMetadata,
    },
  }
}

function safeName(value) {
  return String(value || 'unknown')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase()
}

async function loadRowsFromPostgres(options) {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
  })

  try {
    const clauses = []
    const params = []
    if (options.subject) {
      params.push(options.subject)
      clauses.push(`q.subject_key = $${params.length}`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limitSql = options.limit ? `LIMIT ${Number(options.limit)}` : ''

    const { rows } = await pool.query(
      `
        SELECT
          q.id,
          q.question_key,
          q.year,
          q.subject_key,
          q.subject_name,
          q.question_number,
          q.question_type,
          q.difficulty,
          q.quality,
          q.prompt,
          q.answer,
          q.solution,
          q.flags,
          q.source_type,
          q.metadata,
          q.updated_at,
          COALESCE(
            jsonb_agg(
              jsonb_build_object('type', t.tag_type, 'tag', t.tag)
              ORDER BY t.tag_type, t.tag
            ) FILTER (WHERE t.tag IS NOT NULL),
            '[]'::jsonb
          ) AS tags
        FROM gaokao_questions q
        LEFT JOIN gaokao_question_tags t ON t.question_id = q.id
        ${where}
        GROUP BY q.id
        ORDER BY
          array_position($${params.length + 1}::text[], q.subject_key) NULLS LAST,
          q.subject_key,
          q.year NULLS LAST,
          q.question_number NULLS LAST,
          q.question_key
        ${limitSql}
      `,
      [...params, subjectOrder],
    )
    return rows
  } finally {
    await pool.end()
  }
}

function buildSolutionEnrichmentChain(options) {
  const model = new ChatOpenAI({
    model: options.modelName,
    apiKey: options.modelApiKey,
    configuration: {
      baseURL: options.modelUrl,
    },
    temperature: 0.2,
  })

  const schema = z.object({
    status: z.enum(['generated', 'needs_review', 'failed']),
    solution_steps: z.array(z.string()).describe('中文分步骤题解。若无法可靠解析，返回空数组。'),
    reason: z.string().describe('说明生成、需复核或失败的原因。'),
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      '你是高考题解整理助手。只基于题干、标准答案和已有元数据生成中文分步骤解答。不要虚构图片、表格或材料中不存在的信息。开放题、作文、OCR不完整题应标记 needs_review。',
    ],
    [
      'human',
      '学科：{subject}\n题型：{questionType}\n题干：\n{prompt}\n标准答案：\n{answer}\n来源：{source}\n请输出可核验的分步骤题解。',
    ],
  ])

  return prompt.pipe(model.withStructuredOutput(schema))
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const body = rows.map((row) => `${JSON.stringify(row)}\n`).join('')
  fs.writeFileSync(filePath, body, 'utf8')
}

function orderedSubjectKeys(subjectKeys) {
  return [...subjectKeys].sort((a, b) => {
    const left = subjectOrder.indexOf(a)
    const right = subjectOrder.indexOf(b)
    if (left !== -1 || right !== -1)
      return (left === -1 ? 999 : left) - (right === -1 ? 999 : right)
    return a.localeCompare(b)
  })
}

function publicOptions(options) {
  const { modelApiKey: _modelApiKey, ...safeOptions } = options
  return safeOptions
}

const GaokaoDatasetState = Annotation.Root({
  options: Annotation({
    reducer: (_left, right) => right,
    default: () => ({}),
  }),
  startedAt: Annotation({
    reducer: (_left, right) => right,
    default: () => new Date().toISOString(),
  }),
  rows: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  exportable: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  enrichmentCandidates: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  enrichedExamples: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  skipped: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  exportedBySubject: Annotation({
    reducer: (_left, right) => right,
    default: () => ({}),
  }),
  manifest: Annotation({
    reducer: (_left, right) => right,
    default: () => null,
  }),
})

export function buildGaokaoDatasetGraph() {
  async function loadRows(state) {
    const rows = await loadRowsFromPostgres(state.options)
    return { rows }
  }

  async function auditRows(state) {
    const exportable = []
    const skipped = []
    const enrichmentCandidates = []

    for (const row of state.rows) {
      const solutionSteps = normalizeSolution(row.solution)
      const skipReason = reasonForSkip(row, solutionSteps, state.options)
      if (skipReason) {
        const auditRow = {
          question_key: row.question_key,
          subject_key: row.subject_key,
          subject_name: row.subject_name || subjectNames[row.subject_key] || row.subject_key,
          year: row.year,
          question_number: row.question_number,
          reason: skipReason,
          cleanup_status: cleanupStatus(row),
          source_type: row.source_type,
          source: row.metadata?.source || null,
        }
        skipped.push(auditRow)
        if (canAttemptEnrichment(row, skipReason, state.options)) enrichmentCandidates.push(row)
        continue
      }

      exportable.push(makeExample(row, solutionSteps))
    }

    return { exportable, skipped, enrichmentCandidates }
  }

  async function enrichMissingSolutions(state) {
    if (!state.options.enrichMissingSolutions || state.enrichmentCandidates.length === 0) {
      return { enrichedExamples: [] }
    }

    const chain = buildSolutionEnrichmentChain(state.options)
    const enrichedExamples = []
    const promotedKeys = new Set()

    for (const row of state.enrichmentCandidates.slice(0, state.options.enrichLimit)) {
      const result = await chain.invoke({
        subject: row.subject_name || subjectNames[row.subject_key] || row.subject_key,
        questionType: inferQuestionType(row),
        prompt: compactText(row.prompt),
        answer: compactText(row.answer),
        source: row.metadata?.source || row.source_type || 'unknown',
      })

      const steps = normalizeSolution(result.solution_steps)
      if (result.status === 'generated' && steps.length > 0) {
        promotedKeys.add(row.question_key)
        enrichedExamples.push(
          makeExample(
            {
              ...row,
              solution: steps,
              metadata: {
                ...(row.metadata || {}),
                solutionEnrichment: {
                  status: 'generated',
                  model: state.options.modelName,
                  version: 'langgraph-v1',
                  generatedAt: new Date().toISOString(),
                  basis: ['prompt', 'answer', 'metadata'],
                  reason: result.reason,
                },
              },
            },
            steps,
            { generated_by_graph: true },
          ),
        )
      }
    }

    const skipped = state.skipped.filter((row) => !promotedKeys.has(row.question_key))
    return { enrichedExamples, skipped }
  }

  async function groupBySubject(state) {
    const exportedBySubject = {}
    for (const example of [...state.exportable, ...state.enrichedExamples]) {
      const subjectKey = example.metadata.subject_key
      if (!exportedBySubject[subjectKey]) exportedBySubject[subjectKey] = []
      exportedBySubject[subjectKey].push(example)
    }
    return { exportedBySubject }
  }

  async function writeDatasets(state) {
    fs.mkdirSync(state.options.outDir, { recursive: true })
    const manifestSubjects = []
    for (const subjectKey of orderedSubjectKeys(Object.keys(state.exportedBySubject))) {
      const examples = state.exportedBySubject[subjectKey]
      const fileName = `gaokao-${safeName(subjectKey)}.jsonl`
      writeJsonl(path.join(state.options.outDir, fileName), examples)
      manifestSubjects.push({
        subjectKey,
        subjectName: examples[0]?.metadata?.subject_name || subjectNames[subjectKey] || subjectKey,
        file: fileName,
        examples: examples.length,
      })
    }

    writeJsonl(path.join(state.options.outDir, 'skipped.jsonl'), state.skipped)
    const manifest = {
      datasetVersion: DATASET_VERSION,
      format: 'jsonl',
      langsmithShape: ['inputs', 'outputs', 'metadata'],
      generatedAt: new Date().toISOString(),
      startedAt: state.startedAt,
      runtime: {
        orchestrator: 'langgraph',
        langchain: true,
        graph: graphPlan.map(([id]) => id),
        threadId: state.options.threadId,
        enrichmentEnabled: state.options.enrichMissingSolutions,
      },
      options: publicOptions(state.options),
      totals: {
        scanned: state.rows.length,
        exported: manifestSubjects.reduce((sum, item) => sum + item.examples, 0),
        skipped: state.skipped.length,
        enriched: state.enrichedExamples.length,
      },
      subjects: manifestSubjects,
      skippedFile: 'skipped.jsonl',
    }
    fs.writeFileSync(
      path.join(state.options.outDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    return { manifest }
  }

  return new StateGraph(GaokaoDatasetState)
    .addNode('loadRows', loadRows)
    .addNode('auditRows', auditRows)
    .addNode('enrichMissingSolutions', enrichMissingSolutions)
    .addNode('groupBySubject', groupBySubject)
    .addNode('writeDatasets', writeDatasets)
    .addEdge(START, 'loadRows')
    .addEdge('loadRows', 'auditRows')
    .addEdge('auditRows', 'enrichMissingSolutions')
    .addEdge('enrichMissingSolutions', 'groupBySubject')
    .addEdge('groupBySubject', 'writeDatasets')
    .addEdge('writeDatasets', END)
}

export async function runGaokaoDatasetGraph(options) {
  const graph = buildGaokaoDatasetGraph().compile({ checkpointer: new MemorySaver() })
  const state = await graph.invoke(
    {
      options,
      startedAt: new Date().toISOString(),
    },
    {
      configurable: { thread_id: options.threadId },
      tags: ['gaokao', 'langsmith-dataset', 'langgraph'],
      metadata: {
        subject: options.subject || 'all',
        datasetVersion: DATASET_VERSION,
      },
    },
  )
  return state.manifest
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.printGraphPlan) {
    printGraphPlan()
    return
  }
  const manifest = await runGaokaoDatasetGraph(options)
  console.log(JSON.stringify(manifest, null, 2))
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
