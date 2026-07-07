import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import pg from 'pg'
import dotenv from 'dotenv'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true })

const SUPPORTED_EXTENSIONS = new Set(['.json', '.jsonl', '.txt', '.md', '.pdf', '.docx'])
const DEFAULT_ROOTS = ['files', 'src/data', 'courses']
const DEFAULT_THREAD_ID = `gaokao-rag-${new Date().toISOString().replace(/[:.]/g, '-')}`

const examPathPattern =
  /(gaokao|高考|真题|试卷|答案|answer|answers|question|questions|题库|模拟|exam|paper|ocr|extracted)/i

const subjectHints = [
  ['chinese', /(语文|chinese)/i],
  ['math', /(数学|math)/i],
  ['english', /(英语|english)/i],
  ['physics', /(物理|physics|physics2)/i],
  ['chemistry', /(化学|chemistry)/i],
  ['biology', /(生物|biology)/i],
  ['politics', /(政治|politics|marxism|maogai)/i],
  ['history', /(历史|history)/i],
  ['geography', /(地理|geography)/i],
  ['probability', /(概率|probability)/i],
  ['algorithm', /(算法|algorithm)/i],
  ['os', /(操作系统|\bos\b|operating)/i],
  ['signals', /(信号|signals)/i],
  ['dsp', /(数字信号|dsp)/i],
]

export function parseArgs(argv) {
  const options = {
    roots: DEFAULT_ROOTS.map((item) => path.resolve(projectRoot, item)),
    subject: null,
    allSupportedFiles: false,
    clean: false,
    dryRun: false,
    limit: null,
    chunkSize: 1200,
    chunkOverlap: 180,
    threadId: process.env.LANGGRAPH_THREAD_ID || DEFAULT_THREAD_ID,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[++index]
    if (arg === '--root') options.roots.push(path.resolve(projectRoot, next()))
    else if (arg === '--only-root') options.roots = [path.resolve(projectRoot, next())]
    else if (arg === '--subject') options.subject = next()
    else if (arg === '--all') options.allSupportedFiles = true
    else if (arg === '--clean') options.clean = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--limit') options.limit = Number(next())
    else if (arg === '--chunk-size') options.chunkSize = Number(next())
    else if (arg === '--chunk-overlap') options.chunkOverlap = Number(next())
    else if (arg === '--thread-id') options.threadId = next()
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
  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 300) {
    throw new Error('--chunk-size must be an integer >= 300')
  }
  if (!Number.isInteger(options.chunkOverlap) || options.chunkOverlap < 0) {
    throw new Error('--chunk-overlap must be a non-negative integer')
  }
  return options
}

export function printHelp() {
  console.log(`Usage: node scripts/langchain/gaokao-rag-graph.mjs [options]

Build a PostgreSQL-backed RAG index for exam papers, answers, and extracted Gaokao JSON.

Options:
  --root DIR          Add a source root. Defaults: files, src/data, courses
  --only-root DIR     Replace default roots with one source root
  --subject KEY       Force one subject key for imported documents
  --all               Include every supported file extension, not only exam-like paths
  --clean             Clear existing RAG documents/chunks before indexing
  --dry-run           Discover, extract, and split without writing to PostgreSQL
  --limit N           Limit discovered files
  --chunk-size N      LangChain chunk size. Default: 1200
  --chunk-overlap N   LangChain chunk overlap. Default: 180
  --thread-id ID      LangGraph checkpoint thread id
`)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function compactText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function estimateTokens(text) {
  return Math.ceil(compactText(text).length / 1.7)
}

function relativePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/')
}

function inferSubject(filePath, forcedSubject, metadata = {}) {
  if (forcedSubject) return forcedSubject
  if (metadata.subject_key) return String(metadata.subject_key)
  if (metadata.subjectKey) return String(metadata.subjectKey)
  if (metadata.subject) return String(metadata.subject)
  const normalized = relativePath(filePath)
  const hit = subjectHints.find(([, pattern]) => pattern.test(normalized))
  return hit?.[0] || 'general'
}

function inferYear(filePath, metadata = {}) {
  const rawYear = metadata.year ?? metadata.paperYear
  if (Number.isInteger(rawYear)) return rawYear
  const match = relativePath(filePath).match(/(?:19|20)\d{2}/)
  return match ? Number(match[0]) : null
}

function inferDocKind(filePath) {
  const rel = relativePath(filePath)
  if (/答案|answer|解析|solution/i.test(rel)) return 'answer'
  if (/试卷|真题|paper|exam|question/i.test(rel)) return 'paper'
  if (/ocr/i.test(rel)) return 'ocr_extract'
  if (/extracted/i.test(rel)) return 'structured_extract'
  return 'reference'
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function walk(root, options, output = []) {
  if (!(await pathExists(root))) return output
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'target', '.pnpm-store', '__pycache__'].includes(entry.name)) {
        continue
      }
      await walk(fullPath, options, output)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue
    if (!options.allSupportedFiles && !examPathPattern.test(relativePath(fullPath))) continue
    output.push(fullPath)
    if (options.limit && output.length >= options.limit) return output
  }
  return output
}

async function extractPdf(filePath) {
  const data = await fs.readFile(filePath)
  const parser = new PDFParse({ data })
  try {
    const result = await parser.getText()
    return compactText(result.text)
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  return compactText(result.value)
}

async function extractTextFile(filePath) {
  return compactText(await fs.readFile(filePath, 'utf8'))
}

function jsonTextFromQuestion(question, filePath, parent = {}) {
  const parts = []
  const number = question.number ?? question.questionNumber ?? question.index ?? parent.number
  const subject = question.subjectName || parent.subjectName || question.subject || parent.subject
  if (subject) parts.push(`学科：${subject}`)
  if (parent.source || parent.paperName) parts.push(`来源：${parent.source || parent.paperName}`)
  if (number !== undefined && number !== null) parts.push(`题号：${number}`)
  if (question.prompt || question.stem || question.question) {
    parts.push(`题目：${question.prompt || question.stem || question.question}`)
  }
  if (question.answer) parts.push(`答案：${question.answer}`)
  const solution = Array.isArray(question.solution) ? question.solution.join('\n') : question.solution
  if (solution) parts.push(`题解：${solution}`)
  return compactText(parts.join('\n\n')) || compactText(JSON.stringify(question))
}

function documentsFromStructuredJson(data, filePath, options) {
  const docs = []
  const fileName = path.basename(filePath)
  const relPath = relativePath(filePath)
  if (Array.isArray(data.files)) {
    data.files.forEach((file, fileIndex) => {
      ;(file.questions || []).forEach((question, questionIndex) => {
        const text = jsonTextFromQuestion(question, filePath, file)
        if (!text) return
        docs.push(
          new Document({
            pageContent: text,
            metadata: {
              sourcePath: `${relPath}#files[${fileIndex}].questions[${questionIndex}]`,
              physicalSourcePath: relPath,
              fileName,
              subject_key: inferSubject(filePath, options.subject, file),
              year: inferYear(filePath, file),
              docKind: inferDocKind(filePath),
              source: file.source || file.paperName || fileName,
              questionNumber: question.number ?? question.questionNumber ?? null,
              questionId: question.id || question.questionKey || null,
              format: 'json-question',
            },
          }),
        )
      })
    })
  }
  if (Array.isArray(data.questions)) {
    data.questions.forEach((question, questionIndex) => {
      const text = jsonTextFromQuestion(question, filePath, data.source || data.summary || {})
      if (!text) return
      docs.push(
        new Document({
          pageContent: text,
          metadata: {
            sourcePath: `${relPath}#questions[${questionIndex}]`,
            physicalSourcePath: relPath,
            fileName,
            subject_key: inferSubject(filePath, options.subject, question),
            year: inferYear(filePath, question),
            docKind: inferDocKind(filePath),
            source: data.source?.filename || fileName,
            questionNumber: question.number ?? question.questionNumber ?? null,
            questionId: question.id || question.questionKey || null,
            format: 'json-question',
          },
        }),
      )
    })
  }
  if (Array.isArray(data.overrides)) {
    data.overrides.forEach((override, overrideIndex) => {
      const text = compactText(
        [`来源：${override.source || override.answerSource || fileName}`, `答案：${override.answer}`, `题解：${(override.solution || []).join('\n')}`]
          .filter(Boolean)
          .join('\n\n'),
      )
      if (!text) return
      docs.push(
        new Document({
          pageContent: text,
          metadata: {
            sourcePath: `${relPath}#overrides[${overrideIndex}]`,
            physicalSourcePath: relPath,
            fileName,
            subject_key: inferSubject(filePath, options.subject, override),
            year: inferYear(filePath, override),
            docKind: 'answer',
            source: override.answerSource || override.source || fileName,
            questionId: override.questionId || null,
            format: 'json-answer-override',
          },
        }),
      )
    })
  }
  return docs
}

async function extractJson(filePath, options) {
  const ext = path.extname(filePath).toLowerCase()
  const raw = await extractTextFile(filePath)
  if (ext === '.jsonl') {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parsed = JSON.parse(line)
        const text = compactText(JSON.stringify(parsed, null, 2))
        return new Document({
          pageContent: text,
          metadata: {
            sourcePath: `${relativePath(filePath)}#line[${index + 1}]`,
            physicalSourcePath: relativePath(filePath),
            fileName: path.basename(filePath),
            subject_key: inferSubject(filePath, options.subject, parsed.metadata || parsed),
            year: inferYear(filePath, parsed.metadata || parsed),
            docKind: inferDocKind(filePath),
            rowIndex: index,
            format: 'jsonl',
          },
        })
      })
  }
  const parsed = JSON.parse(raw)
  const structured = documentsFromStructuredJson(parsed, filePath, options)
  if (structured.length > 0) return structured
  return [
    new Document({
      pageContent: compactText(JSON.stringify(parsed, null, 2)),
      metadata: {
        sourcePath: relativePath(filePath),
        fileName: path.basename(filePath),
        subject_key: inferSubject(filePath, options.subject, parsed.metadata || parsed),
        year: inferYear(filePath, parsed.metadata || parsed),
        docKind: inferDocKind(filePath),
        format: 'json',
      },
    }),
  ]
}

async function extractDocumentsFromFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json' || ext === '.jsonl') return extractJson(filePath, options)

  let text = ''
  if (ext === '.pdf') text = await extractPdf(filePath)
  else if (ext === '.docx') text = await extractDocx(filePath)
  else text = await extractTextFile(filePath)

  if (!text) return []
  return [
    new Document({
      pageContent: text,
      metadata: {
        sourcePath: relativePath(filePath),
        fileName: path.basename(filePath),
        subject_key: inferSubject(filePath, options.subject),
        year: inferYear(filePath),
        docKind: inferDocKind(filePath),
        format: ext.replace(/^\./, ''),
      },
    }),
  ]
}

async function ensureRagSchema(pool) {
  const statements = [
    'CREATE EXTENSION IF NOT EXISTS pgcrypto',
    `CREATE TABLE IF NOT EXISTS gaokao_import_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      import_key TEXT NOT NULL UNIQUE,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS gaokao_rag_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doc_key TEXT NOT NULL UNIQUE,
      source_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      file_ext TEXT NOT NULL,
      subject_key TEXT NOT NULL DEFAULT 'general',
      year INTEGER,
      doc_kind TEXT NOT NULL DEFAULT 'reference',
      content_hash TEXT NOT NULL,
      text_length INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS gaokao_rag_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES gaokao_rag_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (document_id, chunk_index)
    )`,
    `CREATE TABLE IF NOT EXISTS gaokao_rag_imports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
      source_path TEXT NOT NULL,
      subject_key TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    'CREATE INDEX IF NOT EXISTS idx_gaokao_rag_documents_subject ON gaokao_rag_documents(subject_key, year)',
    'CREATE INDEX IF NOT EXISTS idx_gaokao_rag_documents_kind ON gaokao_rag_documents(doc_kind)',
    'CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_document ON gaokao_rag_chunks(document_id, chunk_index)',
    'CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_text_trgm ON gaokao_rag_chunks USING gin (chunk_text gin_trgm_ops)',
  ]
  for (const statement of statements) {
    try {
      await pool.query(statement)
    } catch (error) {
      if (statement.includes('gin_trgm_ops')) {
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        await pool.query(statement)
      } else {
        throw error
      }
    }
  }
}

async function upsertDocument(pool, sourceDoc, chunks) {
  const metadata = sourceDoc.metadata || {}
  const sourcePath = metadata.sourcePath
  const fullText = compactText(sourceDoc.pageContent)
  const docKey = sha256(sourcePath)
  const contentHash = sha256(fullText)
  const result = await pool.query(
    `INSERT INTO gaokao_rag_documents
       (doc_key, source_path, file_name, file_ext, subject_key, year, doc_kind, content_hash, text_length, metadata, indexed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
     ON CONFLICT (source_path) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       file_ext = EXCLUDED.file_ext,
       subject_key = EXCLUDED.subject_key,
       year = EXCLUDED.year,
       doc_kind = EXCLUDED.doc_kind,
       content_hash = EXCLUDED.content_hash,
       text_length = EXCLUDED.text_length,
       metadata = EXCLUDED.metadata,
       indexed_at = now(),
       updated_at = now()
     RETURNING id`,
    [
      docKey,
      sourcePath,
      metadata.fileName || path.basename(sourcePath),
      path.extname(sourcePath).replace(/^\./, '') || metadata.format || 'text',
      metadata.subject_key || 'general',
      metadata.year || null,
      metadata.docKind || 'reference',
      contentHash,
      fullText.length,
      metadata,
    ],
  )
  const documentId = result.rows[0].id
  await pool.query('DELETE FROM gaokao_rag_chunks WHERE document_id = $1', [documentId])
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const chunkText = compactText(chunk.pageContent)
    if (!chunkText) continue
    await pool.query(
      `INSERT INTO gaokao_rag_chunks
         (document_id, chunk_index, chunk_text, content_hash, token_estimate, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [documentId, index, chunkText, sha256(chunkText), estimateTokens(chunkText), chunk.metadata || {}],
    )
  }
}

const RagState = Annotation.Root({
  options: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  startedAt: Annotation({ reducer: (_left, right) => right, default: () => new Date().toISOString() }),
  files: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  documents: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  chunksByDocument: Annotation({ reducer: (_left, right) => right, default: () => [] }),
  errors: Annotation({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  summary: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
})

async function discoverFiles(state) {
  const seen = new Set()
  const files = []
  for (const root of state.options.roots) {
    const found = await walk(root, state.options)
    for (const file of found) {
      if (seen.has(file)) continue
      seen.add(file)
      files.push(file)
      if (state.options.limit && files.length >= state.options.limit) break
    }
    if (state.options.limit && files.length >= state.options.limit) break
  }
  return { files }
}

async function extractDocuments(state) {
  const documents = []
  const errors = []
  for (const file of state.files) {
    try {
      const extracted = await extractDocumentsFromFile(file, state.options)
      documents.push(...extracted.filter((doc) => compactText(doc.pageContent).length >= 20))
    } catch (error) {
      errors.push({ file: relativePath(file), stage: 'extract', error: error.message })
    }
  }
  return { documents, errors }
}

async function splitDocuments(state) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: state.options.chunkSize,
    chunkOverlap: state.options.chunkOverlap,
    separators: ['\n\n', '\n', '。', '；', '，', ' ', ''],
  })
  const chunksByDocument = []
  const errors = []
  for (const document of state.documents) {
    try {
      const chunks = await splitter.splitDocuments([document])
      chunksByDocument.push({ document, chunks })
    } catch (error) {
      errors.push({ file: document.metadata?.sourcePath, stage: 'split', error: error.message })
    }
  }
  return { chunksByDocument, errors }
}

async function writeIndex(state) {
  const totalChunks = state.chunksByDocument.reduce((total, item) => total + item.chunks.length, 0)
  if (state.options.dryRun) {
    return {
      summary: {
        dryRun: true,
        files: state.files.length,
        documents: state.documents.length,
        chunks: totalChunks,
        errors: state.errors.length,
      },
    }
  }

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
  })
  try {
    await ensureRagSchema(pool)
    if (state.options.clean) {
      await pool.query('DELETE FROM gaokao_rag_documents')
    }
    for (const item of state.chunksByDocument) {
      await upsertDocument(pool, item.document, item.chunks)
    }
    await pool.query(
      `INSERT INTO gaokao_import_runs (import_key, summary)
       VALUES ($1,$2)
       ON CONFLICT (import_key) DO UPDATE SET summary = EXCLUDED.summary, created_at = now()`,
      [
        `rag-${state.startedAt}`,
        {
          kind: 'rag-index',
          files: state.files.length,
          documents: state.documents.length,
          chunks: totalChunks,
          errors: state.errors,
          roots: state.options.roots.map((root) => relativePath(root)),
        },
      ],
    )
  } finally {
    await pool.end()
  }

  return {
    summary: {
      dryRun: false,
      files: state.files.length,
      documents: state.documents.length,
      chunks: totalChunks,
      errors: state.errors.length,
    },
  }
}

export function buildGaokaoRagGraph() {
  return new StateGraph(RagState)
    .addNode('discoverFiles', discoverFiles)
    .addNode('extractDocuments', extractDocuments)
    .addNode('splitDocuments', splitDocuments)
    .addNode('writeIndex', writeIndex)
    .addEdge(START, 'discoverFiles')
    .addEdge('discoverFiles', 'extractDocuments')
    .addEdge('extractDocuments', 'splitDocuments')
    .addEdge('splitDocuments', 'writeIndex')
    .addEdge('writeIndex', END)
}

export async function runGaokaoRagGraph(options) {
  const graph = buildGaokaoRagGraph().compile({ checkpointer: new MemorySaver() })
  return graph.invoke(
    { options, startedAt: new Date().toISOString() },
    { configurable: { thread_id: options.threadId }, tags: ['gaokao', 'rag', 'langgraph'] },
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  runGaokaoRagGraph(options)
    .then((state) => {
      console.log(JSON.stringify({ summary: state.summary, errors: state.errors.slice(0, 20) }, null, 2))
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
