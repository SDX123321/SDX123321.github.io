import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const { Pool } = pg
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true })

const SUPPORTED = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.mp3',
  '.wav',
  '.jpg',
  '.jpeg',
  '.png',
  '.zip',
  '.html',
])
const TEXT_EXTENSIONS = new Set(['.doc', '.docx', '.pdf', '.html'])
const DOMAIN_CLEANUP_SQL = `DELETE FROM material_paths p USING materials m
         WHERE p.material_id=m.id AND m.domain_id=$2 AND p.last_seen_run IS DISTINCT FROM $1`

function materialPaths(domain, sourceRelativePath) {
  return { identityPath: `${domain}/${sourceRelativePath}`, storagePath: sourceRelativePath }
}
const SUBJECTS = [
  ['chinese', /语文/],
  ['math', /数学/],
  ['english', /英语|听力/],
  ['physics', /物理/],
  ['chemistry', /化学/],
  ['biology', /生物/],
  ['politics', /政治|思想政治/],
  ['history', /历史/],
  ['geography', /地理/],
]
const REGIONS = [
  '南京',
  '苏州',
  '无锡',
  '常州',
  '南通',
  '扬州',
  '镇江',
  '泰州',
  '盐城',
  '淮安',
  '宿迁',
  '徐州',
  '连云港',
  '江苏',
  '北京',
  '上海',
  '天津',
  '重庆',
  '浙江',
  '山东',
  '广东',
  '福建',
  '安徽',
  '湖北',
  '湖南',
  '河北',
  '河南',
  '四川',
  '陕西',
  '山西',
  '江西',
  '辽宁',
  '吉林',
  '黑龙江',
  '广西',
  '贵州',
  '云南',
  '甘肃',
  '青海',
  '宁夏',
  '新疆',
  '西藏',
  '海南',
  '内蒙古',
]

function parseArgs(argv) {
  const out = {
    root: process.env.MATERIAL_ROOT || 'C:\\Users\\zzz\\Desktop\\参考资料',
    runId: null,
    dryRun: false,
    catalogOnly: false,
    limit: null,
    retryFailed: false,
    rebuild: false,
    missingOnly: false,
    file: null,
    domain: 'high-school',
    course: null,
    subject: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--root') out.root = argv[++i]
    else if (arg === '--run-id') out.runId = argv[++i]
    else if (arg === '--limit') out.limit = Number(argv[++i])
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--catalog-only') out.catalogOnly = true
    else if (arg === '--retry-failed') out.retryFailed = true
    else if (arg === '--rebuild') out.rebuild = true
    else if (arg === '--missing-only') out.missingOnly = true
    else if (arg === '--file') out.file = argv[++i]
    else if (arg === '--domain') out.domain = argv[++i]
    else if (arg === '--course') out.course = argv[++i]
    else if (arg === '--subject') out.subject = argv[++i]
    else if (arg === '--help') {
      console.log(
        'Usage: node scripts/index-materials.mjs [--domain high-school|university] [--root DIR] [--file FILE] [--course KEY] [--subject KEY] [--dry-run] [--catalog-only] [--limit N] [--retry-failed] [--rebuild] [--missing-only] [--run-id UUID]',
      )
      process.exit(0)
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return out
}

async function walk(root, output = [], limit = null) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) await walk(full, output, limit)
    else if (entry.isFile() && SUPPORTED.has(path.extname(entry.name).toLowerCase()))
      output.push(full)
    if (limit && output.length >= limit) break
  }
  return output
}

function classify(relativePath, ext) {
  const text = relativePath.replaceAll('\\', '/')
  const grade = /高一/.test(text)
    ? 'grade-1'
    : /高二/.test(text)
      ? 'grade-2'
      : /高三|高考/.test(text)
        ? 'grade-3'
        : 'other'
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(text))?.[0] || 'other'
  const maxYear = (value) => {
    const years = (value.match(/(?:19|20)\d{2}/g) || [])
      .map(Number)
      .filter((item) => item <= new Date().getFullYear() + 1)
    return years.length ? Math.max(...years) : null
  }
  let year = maxYear(path.basename(text))
  if (!year) {
    for (const segment of text.split('/').reverse().slice(1)) {
      year = maxYear(segment)
      if (year) break
    }
  }
  const region =
    REGIONS.find((item) => text.includes(item)) || (/全国/.test(text) ? '全国' : 'other')
  let kind = 'other'
  if (/答案|解析|详解/.test(text)) kind = 'answer'
  else if (/答题卡|答卷纸/.test(text)) kind = 'answer-sheet'
  else if (/听力/.test(text) || ['.mp3', '.wav'].includes(ext)) kind = 'audio'
  else if (/试卷|试题|真题|模拟|联考|月考|期中|期末|高考/.test(text)) kind = 'paper'
  else if (['.jpg', '.jpeg', '.png'].includes(ext)) kind = 'image'
  else if (ext === '.zip') kind = 'archive'
  return { grade, subject, year: Number.isFinite(year) ? year : null, region, kind }
}

function mimeFor(ext) {
  return (
    {
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.zip': 'application/zip',
      '.html': 'text/html',
    }[ext] || 'application/octet-stream'
  )
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

function compact(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
function chunks(text, size = 1000, overlap = 150) {
  const out = []
  for (let start = 0; start < text.length; start += size - overlap) {
    const value = compact(text.slice(start, start + size))
    if (value) out.push(value)
    if (start + size >= text.length) break
  }
  return out
}

function needsTextExtraction({ ext, catalogOnly, unchanged, retryFailed, status }) {
  const settled = ['indexed', 'text_ready', 'no_text'].includes(status)
  return (
    TEXT_EXTENSIONS.has(ext) &&
    !catalogOnly &&
    (!unchanged || (!settled && (status !== 'failed' || retryFailed)))
  )
}

async function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.on('error', () => {})
    return
  }
  child.kill('SIGKILL')
}

async function command(executable, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stderr = ''
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => {
      void terminateProcessTree(child)
      finish(new Error(`${executable} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) =>
      code === 0 ? finish() : finish(new Error(stderr || `${executable} exited ${code}`)),
    )
  })
}

async function extractDoc(filePath, cacheRoot) {
  const dir = await fs.mkdtemp(path.join(cacheRoot, 'doc-'))
  const profileDir = await fs.mkdtemp(path.join(cacheRoot, 'lo-profile-'))
  try {
    const soffice = process.env.LIBREOFFICE_PATH || 'soffice'
    const timeoutMs = Number(process.env.LIBREOFFICE_TIMEOUT_MS) || 30_000
    await command(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        '--headless',
        '--convert-to',
        'docx',
        '--outdir',
        dir,
        filePath,
      ],
      { timeoutMs },
    )
    const converted = path.join(dir, `${path.basename(filePath, path.extname(filePath))}.docx`)
    return compact((await mammoth.extractRawText({ path: converted })).value)
  } finally {
    await Promise.allSettled([
      fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }),
      fs.rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }),
    ])
  }
}

async function extractText(filePath, ext, cacheRoot) {
  if (ext === '.html') {
    const html = await fs.readFile(filePath, 'utf8')
    return compact(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&'),
    )
  }
  if (ext === '.docx') return compact((await mammoth.extractRawText({ path: filePath })).value)
  if (ext === '.doc') return extractDoc(filePath, cacheRoot)
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: await fs.readFile(filePath) })
    try {
      return compact((await parser.getText()).text)
    } finally {
      await parser.destroy()
    }
  }
  return ''
}

async function ollamaEmbeddings(texts) {
  const url = `${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/embed`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || 'bge-m3', input: texts }),
  })
  if (!response.ok) throw new Error(`Ollama embed failed: ${response.status}`)
  const data = await response.json()
  const expectedDimensions = Number(process.env.EMBEDDING_DIMENSIONS || 0)
  if (
    !Array.isArray(data.embeddings) ||
    !data.embeddings.length ||
    data.embeddings.some((item) => !Array.isArray(item))
  )
    throw new Error('Unexpected embedding dimensions')
  if (expectedDimensions && data.embeddings.some((item) => item.length !== expectedDimensions))
    throw new Error(
      `Expected ${expectedDimensions} embedding dimensions, received ${data.embeddings[0].length}`,
    )
  return data.embeddings
}

async function updateRun(pool, runId, stats, status = 'running', summary = {}) {
  if (!runId) return
  await pool.query(
    `UPDATE material_index_runs SET status=$2,discovered=$3,deduplicated=$4,extracted=$5,embedded=$6,failed=$7,remaining=$8,summary=$9,
    started_at=COALESCE(started_at,now()),finished_at=CASE WHEN $2 IN ('completed','failed') THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
    [
      runId,
      status,
      stats.discovered,
      stats.deduplicated,
      stats.extracted,
      stats.embedded,
      stats.failed,
      Math.max(0, stats.discovered - stats.processed),
      summary,
    ],
  )
}

async function rebuildGeneration(pool, runId, domain, options) {
  const model = process.env.EMBEDDING_MODEL || 'bge-m3'
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || 0)
  const total = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int count FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE m.domain_id=$1`,
        [domain.id],
      )
    ).rows[0].count,
  )
  const generation = (
    await pool.query(
      `INSERT INTO embedding_generations(domain_id,model,dimensions,total_chunks,status)
     VALUES($1,$2,$3,$4,'building') RETURNING id`,
      [domain.id, model, dimensions, total],
    )
  ).rows[0]
  await pool.query(
    `UPDATE material_index_runs SET generation_id=$2,status='running',discovered=$3,remaining=$3,
     started_at=COALESCE(started_at,now()),updated_at=now(),summary=$4 WHERE id=$1`,
    [
      runId,
      generation.id,
      total,
      { phase: 'embedding', model, dimensions, domain: options.domain },
    ],
  )

  let embedded = 0
  let failed = 0
  const started = Date.now()
  while (true) {
    let runStatus = (
      await pool.query('SELECT status FROM material_index_runs WHERE id=$1', [runId])
    ).rows[0]?.status
    while (runStatus === 'paused') {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      runStatus = (await pool.query('SELECT status FROM material_index_runs WHERE id=$1', [runId]))
        .rows[0]?.status
    }
    if (runStatus === 'cancelled') throw new Error('index_cancelled')
    const rows = (
      await pool.query(
        `SELECT c.id,c.chunk_text,m.file_name FROM material_chunks c JOIN materials m ON m.id=c.material_id
       WHERE m.domain_id=$1 AND NOT EXISTS(
         SELECT 1 FROM material_chunk_embeddings e WHERE e.generation_id=$2 AND e.chunk_id=c.id)
       ORDER BY c.id LIMIT 8`,
        [domain.id, generation.id],
      )
    ).rows
    if (!rows.length) break
    try {
      const vectors = await ollamaEmbeddings(rows.map((row) => row.chunk_text))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (let index = 0; index < rows.length; index += 1) {
          await client.query(
            `INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding)
             VALUES($1,$2,$3::vector) ON CONFLICT DO NOTHING`,
            [generation.id, rows[index].id, `[${vectors[index].join(',')}]`],
          )
        }
        await client.query('COMMIT')
        embedded += rows.length
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      failed += rows.length
      await pool.query(
        `INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding)
         SELECT $1,id,embedding FROM material_chunks WHERE id=ANY($2::uuid[]) AND embedding IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [generation.id, rows.map((row) => row.id)],
      )
      await pool.query(`UPDATE embedding_generations SET error=$2,updated_at=now() WHERE id=$1`, [
        generation.id,
        String(error.message || error).slice(0, 1000),
      ])
      if (failed / Math.max(total, 1) > 0.005) throw error
    }
    const processed = embedded + failed
    const elapsedSeconds = Math.max(1, (Date.now() - started) / 1000)
    const rate = embedded / elapsedSeconds
    const etaSeconds = rate > 0 ? Math.ceil((total - processed) / rate) : null
    await pool.query(
      `UPDATE embedding_generations SET embedded_chunks=$2,failed_chunks=$3,updated_at=now() WHERE id=$1`,
      [generation.id, embedded, failed],
    )
    await pool.query(
      `UPDATE material_index_runs SET embedded=$2,failed=$3,remaining=$4,updated_at=now(),summary=$5 WHERE id=$1`,
      [
        runId,
        embedded,
        failed,
        Math.max(0, total - processed),
        {
          phase: 'embedding',
          model,
          dimensions,
          domain: options.domain,
          currentFile: rows.at(-1)?.file_name,
          chunksPerSecond: Number(rate.toFixed(2)),
          etaSeconds,
        },
      ],
    )
  }

  const coverage = total ? embedded / total : 1
  if (coverage < 0.995)
    throw new Error(`Embedding coverage ${(coverage * 100).toFixed(2)}% is below 99.5%`)
  const activation = await pool.connect()
  try {
    await activation.query('BEGIN')
    await activation.query(
      `UPDATE embedding_generations SET status='superseded',is_active=false WHERE domain_id=$1 AND is_active`,
      [domain.id],
    )
    await activation.query(
      `UPDATE embedding_generations SET status='active',is_active=true,embedded_chunks=$2,failed_chunks=$3,
       activated_at=now(),updated_at=now() WHERE id=$1`,
      [generation.id, embedded, failed],
    )
    await activation.query(
      `UPDATE material_index_runs SET status='completed',embedded=$2,failed=$3,remaining=0,finished_at=now(),updated_at=now(),
       summary=$4 WHERE id=$1`,
      [
        runId,
        embedded,
        failed,
        { phase: 'completed', model, dimensions, domain: options.domain, coverage },
      ],
    )
    await activation.query('COMMIT')
  } catch (error) {
    await activation.query('ROLLBACK')
    throw error
  } finally {
    activation.release()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = path.resolve(options.root)
  const requestedFile = options.file ? path.resolve(options.file) : null
  if (requestedFile) {
    const requestedRelative = path.relative(root, requestedFile)
    if (requestedRelative.startsWith('..') || path.isAbsolute(requestedRelative))
      throw new Error('--file must be inside MATERIAL_ROOT')
  }
  const files = options.rebuild
    ? []
    : requestedFile
      ? [requestedFile]
      : await walk(root, [], options.limit)
  const extCounts = Object.fromEntries([...SUPPORTED].map((ext) => [ext, 0]))
  for (const file of files) extCounts[path.extname(file).toLowerCase()] += 1
  console.log(
    JSON.stringify(
      {
        root,
        discovered: files.length,
        extensions: extCounts,
        mode: options.dryRun ? 'dry-run' : options.catalogOnly ? 'catalog-only' : 'full',
      },
      null,
      2,
    ),
  )
  if (options.dryRun) return

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
    max: 4,
  })
  const domain = (
    await pool.query(
      `INSERT INTO content_domains(domain_key,name,description) VALUES($1,$2,$3)
       ON CONFLICT(domain_key) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [
        options.domain,
        options.domain === 'university' ? '大学' : '高中',
        `${options.domain} materials`,
      ],
    )
  ).rows[0]
  const subjectKey = options.subject || null
  const subjectId = subjectKey
    ? (
        await pool.query(
          `INSERT INTO knowledge_subjects(domain_id,subject_key,name) VALUES($1,$2,$2)
           ON CONFLICT(domain_id,subject_key) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [domain.id, subjectKey],
        )
      ).rows[0].id
    : null
  const courseId = options.course
    ? (
        await pool.query(
          `INSERT INTO knowledge_courses(domain_id,subject_id,course_key,name) VALUES($1,$2,$3,$3)
           ON CONFLICT(domain_id,course_key) DO UPDATE SET subject_id=COALESCE(EXCLUDED.subject_id,knowledge_courses.subject_id) RETURNING id`,
          [domain.id, subjectId, options.course],
        )
      ).rows[0].id
    : null
  const cacheRoot = path.resolve(
    process.env.MATERIAL_CACHE_DIR || path.join(os.tmpdir(), 'exam-review-materials'),
  )
  await fs.mkdir(cacheRoot, { recursive: true })
  const staleMinutes = Math.max(5, Number(process.env.MATERIAL_RUN_STALE_MINUTES) || 5)
  await pool.query(
    `UPDATE material_index_runs
     SET status='interrupted',finished_at=now(),updated_at=now(),
         summary=summary||jsonb_build_object('reason','stale heartbeat recovered')
     WHERE status IN ('queued','running')
       AND updated_at < now() - ($1::int * interval '1 minute')`,
    [staleMinutes],
  )
  let runId = options.runId
  if (!runId)
    runId = (
      await pool.query(
        "INSERT INTO material_index_runs(source_root,status) VALUES($1,'running') RETURNING id",
        [root],
      )
    ).rows[0].id
  const stats = {
    discovered: files.length,
    processed: 0,
    deduplicated: 0,
    extracted: 0,
    embedded: 0,
    failed: 0,
  }
  await updateRun(pool, runId, stats)
  const vectorEnabled = (await pool.query("SELECT to_regtype('vector') IS NOT NULL AS enabled"))
    .rows[0].enabled
  const targetGeneration = vectorEnabled
    ? (
        await pool.query(
          `SELECT id FROM embedding_generations WHERE domain_id=$1 AND status IN ('active','building')
         ORDER BY is_active DESC,created_at DESC LIMIT 1`,
          [domain.id],
        )
      ).rows[0]?.id
    : null
  if (options.rebuild) {
    try {
      if (!vectorEnabled) throw new Error('pgvector is unavailable')
      await rebuildGeneration(pool, runId, domain, options)
    } catch (error) {
      await pool.query(
        `UPDATE embedding_generations SET status='failed',error=$2,updated_at=now() WHERE id=(SELECT generation_id FROM material_index_runs WHERE id=$1)`,
        [runId, String(error.message || error).slice(0, 1000)],
      )
      await pool.query(
        `UPDATE material_index_runs SET status='failed',failed=failed+1,finished_at=now(),updated_at=now(),
         summary=summary||jsonb_build_object('error',$2) WHERE id=$1`,
        [runId, String(error.message || error).slice(0, 1000)],
      )
      throw error
    } finally {
      await pool.end()
    }
    return
  }
  let heartbeatAt = Date.now()

  try {
    for (const filePath of files) {
      if (Date.now() - heartbeatAt >= 30_000) {
        await pool.query('UPDATE material_index_runs SET updated_at=now() WHERE id=$1', [runId])
        heartbeatAt = Date.now()
      }
      const stat = await fs.stat(filePath)
      const sourceRelativePath = path.relative(root, filePath).replaceAll('\\', '/')
      const { identityPath: relativePath, storagePath } = materialPaths(
        options.domain,
        sourceRelativePath,
      )
      const ext = path.extname(filePath).toLowerCase()
      const previous = await pool.query(
        `SELECT p.material_id,p.size_bytes,p.modified_at,m.content_hash,m.rag_status,
          EXISTS(SELECT 1 FROM material_chunks c WHERE c.material_id=m.id AND length(trim(c.chunk_text))>=20) has_chunks
         FROM material_paths p JOIN materials m ON m.id=p.material_id WHERE p.relative_path=$1`,
        [relativePath],
      )
      if (options.missingOnly && previous.rowCount && previous.rows[0].has_chunks) {
        stats.processed += 1
        if (stats.processed % 100 === 0)
          await updateRun(pool, runId, stats, 'running', {
            phase: 'discovering-missing',
            currentFile: path.basename(filePath),
          })
        continue
      }
      const unchanged =
        previous.rowCount &&
        Number(previous.rows[0].size_bytes) === stat.size &&
        previous.rows[0].modified_at &&
        new Date(previous.rows[0].modified_at).getTime() === stat.mtime.getTime()
      let hash = unchanged ? previous.rows[0].content_hash : await sha256(filePath)
      if (options.domain !== 'high-school')
        hash = crypto.createHash('sha256').update(`${options.domain}:${hash}`).digest('hex')
      const category = classify(sourceRelativePath, ext)
      if (options.subject) category.subject = options.subject
      const existingHash = await pool.query(
        'SELECT id,rag_status FROM materials WHERE content_hash=$1',
        [hash],
      )
      if (existingHash.rowCount) stats.deduplicated += 1
      const material = await pool.query(
        `INSERT INTO materials(content_hash,file_name,file_ext,mime_type,size_bytes,grade,subject,year,region,kind,metadata,domain_id,subject_id,course_id,downloadable)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(content_hash) DO UPDATE SET domain_id=$12,subject_id=COALESCE($13,materials.subject_id),course_id=COALESCE($14,materials.course_id),updated_at=now()
        RETURNING id,rag_status`,
        [
          hash,
          path.basename(filePath),
          ext,
          mimeFor(ext),
          stat.size,
          category.grade,
          category.subject,
          category.year,
          category.region,
          category.kind,
          { source: 'local', domain: options.domain, course: options.course, sourceRelativePath },
          domain.id,
          subjectId,
          courseId,
          ext !== '.html',
        ],
      )
      const materialId = material.rows[0].id
      await pool.query(
        `INSERT INTO material_paths(material_id,relative_path,storage_path,is_canonical,size_bytes,modified_at,last_seen_run)
        VALUES($1,$2,$3,NOT EXISTS(SELECT 1 FROM material_paths WHERE material_id=$1),$4,$5,$6)
        ON CONFLICT(relative_path) DO UPDATE SET material_id=$1,storage_path=$3,size_bytes=$4,modified_at=$5,last_seen_run=$6,updated_at=now()`,
        [materialId, relativePath, storagePath, stat.size, stat.mtime, runId],
      )
      await pool.query(
        `UPDATE materials SET file_name=$2,file_ext=$3,mime_type=$4,size_bytes=$5,grade=$6,subject=$7,year=$8,region=$9,kind=$10,updated_at=now()
        WHERE id=$1 AND EXISTS(SELECT 1 FROM material_paths WHERE material_id=$1 AND relative_path=$11 AND is_canonical=true)`,
        [
          materialId,
          path.basename(filePath),
          ext,
          mimeFor(ext),
          stat.size,
          category.grade,
          category.subject,
          category.year,
          category.region,
          category.kind,
          relativePath,
        ],
      )

      const status = material.rows[0].rag_status
      const shouldExtract = needsTextExtraction({
        ext,
        catalogOnly: options.catalogOnly,
        unchanged,
        retryFailed: options.retryFailed,
        status,
      })
      if (shouldExtract) {
        try {
          const text = await extractText(filePath, ext, cacheRoot)
          if (text.length < 20) {
            await pool.query(
              "UPDATE materials SET rag_status='no_text',text_length=$2,metadata=metadata-'extractionError'-'embeddingError',updated_at=now() WHERE id=$1",
              [materialId, text.length],
            )
          } else {
            const parts = chunks(text)
            await pool.query('DELETE FROM material_chunks WHERE material_id=$1', [materialId])
            for (let index = 0; index < parts.length; index += 1) {
              await pool.query(
                `INSERT INTO material_chunks(material_id,chunk_index,chunk_text,content_hash,token_estimate,metadata) VALUES($1,$2,$3,$4,$5,$6)`,
                [
                  materialId,
                  index,
                  parts[index],
                  crypto.createHash('sha256').update(parts[index]).digest('hex'),
                  Math.ceil(parts[index].length / 1.7),
                  { relativePath },
                ],
              )
            }
            await pool.query(
              "UPDATE materials SET rag_status='text_ready',text_length=$2,metadata=metadata-'extractionError'-'embeddingError',updated_at=now() WHERE id=$1",
              [materialId, text.length],
            )
            stats.extracted += 1
          }
        } catch (error) {
          stats.failed += 1
          await pool.query(
            "UPDATE materials SET rag_status='failed',metadata=metadata||$2::jsonb,updated_at=now() WHERE id=$1",
            [
              materialId,
              JSON.stringify({ extractionError: String(error.message || error).slice(0, 500) }),
            ],
          )
        }
      }

      if (vectorEnabled && !options.catalogOnly && TEXT_EXTENSIONS.has(ext)) {
        const pending = await pool.query(
          'SELECT id,chunk_text FROM material_chunks WHERE material_id=$1 AND embedding IS NULL ORDER BY chunk_index',
          [materialId],
        )
        try {
          for (let start = 0; start < pending.rows.length; start += 16) {
            const batch = pending.rows.slice(start, start + 16)
            const vectors = await ollamaEmbeddings(batch.map((item) => item.chunk_text))
            for (let i = 0; i < batch.length; i += 1) {
              await pool.query('UPDATE material_chunks SET embedding=$2::vector WHERE id=$1', [
                batch[i].id,
                `[${vectors[i].join(',')}]`,
              ])
              if (targetGeneration)
                await pool.query(
                  `INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding) VALUES($1,$2,$3::vector)
                   ON CONFLICT(generation_id,chunk_id) DO UPDATE SET embedding=EXCLUDED.embedding`,
                  [targetGeneration, batch[i].id, `[${vectors[i].join(',')}]`],
                )
            }
          }
          if (pending.rowCount) stats.embedded += 1
          const remaining = await pool.query(
            'SELECT COUNT(*)::int AS count FROM material_chunks WHERE material_id=$1 AND embedding IS NULL',
            [materialId],
          )
          if (remaining.rows[0].count === 0 && pending.rowCount)
            await pool.query(
              "UPDATE materials SET rag_status='indexed',metadata=metadata-'embeddingError'-'extractionError',updated_at=now() WHERE id=$1",
              [materialId],
            )
          else if (remaining.rows[0].count === 0)
            await pool.query(
              "UPDATE materials SET metadata=metadata-'embeddingError' WHERE id=$1",
              [materialId],
            )
        } catch (error) {
          await pool.query('UPDATE materials SET metadata=metadata||$2::jsonb WHERE id=$1', [
            materialId,
            JSON.stringify({ embeddingError: String(error.message || error).slice(0, 500) }),
          ])
        }
      }
      stats.processed += 1
      await updateRun(pool, runId, stats, 'running', {
        phase: 'embedding',
        rebuild: options.rebuild,
        currentFile: path.basename(filePath),
      })
      heartbeatAt = Date.now()
      if (stats.processed % 25 === 0) {
        console.log(`${stats.processed}/${stats.discovered}`)
      }
    }
    if (!options.limit && !options.file) {
      await pool.query(DOMAIN_CLEANUP_SQL, [runId, domain.id])
      await pool.query(
        'DELETE FROM materials m WHERE NOT EXISTS(SELECT 1 FROM material_paths p WHERE p.material_id=m.id)',
      )
    }
    await updateRun(pool, runId, stats, 'completed', {
      extensions: extCounts,
      vectorEnabled,
      rebuild: options.rebuild,
      phase: 'completed',
    })
    console.log(JSON.stringify(stats, null, 2))
  } catch (error) {
    await updateRun(pool, runId, stats, 'failed', { error: String(error.message || error) })
    throw error
  } finally {
    await pool.end()
  }
}

export {
  DOMAIN_CLEANUP_SQL,
  classify,
  chunks,
  command,
  extractText,
  materialPaths,
  needsTextExtraction,
  parseArgs,
  main,
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
