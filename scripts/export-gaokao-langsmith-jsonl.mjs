import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const DEFAULT_OUT_DIR = path.join(projectRoot, 'datasets', 'langsmith', 'gaokao')
const DATASET_VERSION = 'gaokao-langsmith-v1'

const subjectOrder = [
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

const subjectNames = {
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

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    subject: null,
    includeHidden: false,
    includeAnswerOnly: false,
    limit: null,
    minSolutionChars: 1,
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
  return options
}

function printHelp() {
  console.log(`Usage: node scripts/export-gaokao-langsmith-jsonl.mjs [options]

Export gaokao_questions into LangSmith JSONL examples, split by subject.

Options:
  --out DIR                 Output directory. Default: datasets/langsmith/gaokao
  --subject KEY             Export one subject only, e.g. math or chinese
  --include-answer-only     Include active questions that have an answer but no solution steps
  --include-hidden          Include questions marked metadata.cleanup.status=soft_deleted
  --limit N                 Limit total exported rows after filtering
  --min-solution-chars N    Minimum joined solution character count. Default: 1
  -h, --help                Show this help

Each JSONL row uses LangSmith-compatible keys: inputs, outputs, metadata.
`)
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
  if (Array.isArray(solution))
    return solution.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof solution === 'string') return [solution.trim()].filter(Boolean)
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

function inferQuestionType(row) {
  if (row.question_type) return row.question_type
  const prompt = compactText(row.prompt)
  if (/作文|写作|续写/.test(prompt)) return '作文'
  if (/阅读|文本|材料|文章/.test(prompt) && row.subject_key === 'chinese') return '阅读理解'
  if (/^[\s\S]*\b[A-D][.．、]/.test(prompt) || /\nA[.．、]/.test(prompt)) return '选择题'
  if (/填空|横线|空格|____|___/.test(prompt)) return '填空题'
  if (/证明|求证|解答|计算|分析|说明|论述/.test(prompt)) return '解答题'
  return '综合题'
}

function extractImageUrls(metadata) {
  return normalizeList(metadata?.assets?.images?.map?.((image) => image?.url))
}

function makeExample(row, solutionSteps) {
  const subjectName = row.subject_name || subjectNames[row.subject_key] || row.subject_key
  const questionType = inferQuestionType(row)
  const tags = normalizeList(row.tags)
  const flags = normalizeList(row.flags)
  const source = row.metadata?.source || null
  const relativePath = row.metadata?.relativePath || null
  const analysisSource = row.metadata?.analysisSource || null
  const imageUrls = extractImageUrls(row.metadata || {})
  const solutionText = solutionSteps.join('\n')

  return {
    inputs: {
      question: compactText(row.prompt),
      subject: subjectName,
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
      subject_name: subjectName,
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
    },
  }
}

function safeName(value) {
  return String(value || 'unknown')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase()
}

async function loadRows(pool, options) {
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
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const body = rows.map((row) => `${JSON.stringify(row)}\n`).join('')
  fs.writeFileSync(filePath, body, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
  })

  const exportedBySubject = new Map()
  const skipped = []
  const startedAt = new Date().toISOString()

  try {
    const rows = await loadRows(pool, options)
    for (const row of rows) {
      const solutionSteps = normalizeSolution(row.solution)
      const skipReason = reasonForSkip(row, solutionSteps, options)
      if (skipReason) {
        skipped.push({
          question_key: row.question_key,
          subject_key: row.subject_key,
          subject_name: row.subject_name || subjectNames[row.subject_key] || row.subject_key,
          year: row.year,
          question_number: row.question_number,
          reason: skipReason,
          cleanup_status: cleanupStatus(row),
          source_type: row.source_type,
          source: row.metadata?.source || null,
        })
        continue
      }

      if (!exportedBySubject.has(row.subject_key)) exportedBySubject.set(row.subject_key, [])
      exportedBySubject.get(row.subject_key).push(makeExample(row, solutionSteps))
    }

    fs.mkdirSync(options.outDir, { recursive: true })
    const manifestSubjects = []
    for (const subjectKey of [...exportedBySubject.keys()].sort((a, b) => {
      const left = subjectOrder.indexOf(a)
      const right = subjectOrder.indexOf(b)
      if (left !== -1 || right !== -1)
        return (left === -1 ? 999 : left) - (right === -1 ? 999 : right)
      return a.localeCompare(b)
    })) {
      const examples = exportedBySubject.get(subjectKey)
      const fileName = `gaokao-${safeName(subjectKey)}.jsonl`
      writeJsonl(path.join(options.outDir, fileName), examples)
      manifestSubjects.push({
        subjectKey,
        subjectName: examples[0]?.metadata?.subject_name || subjectNames[subjectKey] || subjectKey,
        file: fileName,
        examples: examples.length,
      })
    }

    writeJsonl(path.join(options.outDir, 'skipped.jsonl'), skipped)
    const manifest = {
      datasetVersion: DATASET_VERSION,
      format: 'jsonl',
      langsmithShape: ['inputs', 'outputs', 'metadata'],
      generatedAt: new Date().toISOString(),
      startedAt,
      options,
      totals: {
        scanned: rows.length,
        exported: manifestSubjects.reduce((sum, item) => sum + item.examples, 0),
        skipped: skipped.length,
      },
      subjects: manifestSubjects,
      skippedFile: 'skipped.jsonl',
    }
    fs.writeFileSync(
      path.join(options.outDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    console.log(JSON.stringify(manifest, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
