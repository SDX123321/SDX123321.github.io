import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT_DIR, 'src/data')
const PUBLIC_ASSET_DIR = path.join(ROOT_DIR, 'public/gaokao-assets/images')
const MANIFEST_PATH = path.join(DATA_DIR, 'gaokao-question-assets.json')
const DEFAULT_SOURCE_ROOT = path.resolve(ROOT_DIR, '..', '参考资料', '2026高考试卷（更新中）')
const SOURCE_ROOTS = (process.env.GAOKAO_SOURCE_ROOTS || process.env.GAOKAO_SOURCE_ROOT || DEFAULT_SOURCE_ROOT)
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean)

const DATASETS = [
  { filename: 'jiangsu-gaokao-extracted.json', keyPrefix: 'extract_question', shape: 'files' },
  { filename: 'gaokao-2026-docx-extracted.json', keyPrefix: 'extract_question', shape: 'files' },
  { filename: 'gaokao-2026-pdf-text-extracted.json', keyPrefix: 'extract_question', shape: 'files' },
  { filename: 'gaokao-2026-residual-extracted.json', keyPrefix: 'extract_question', shape: 'files' },
  { filename: 'gaokao-2026-ocr-extracted.json', keyPrefix: 'audit_ocr_question', shape: 'files' },
]

const WEB_IMAGE_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
])

const FIGURE_HINT = /图|表|曲线|函数图像|坐标系|示意|装置|实验|电路|流程|流程图|统计|柱状|折线|几何|圆|三角形|四边形|抛物线|双曲线|椭圆|Figure|fig\./iu

function hashKey(prefix, parts) {
  const hash = crypto
    .createHash('sha1')
    .update(parts.filter((part) => part !== undefined && part !== null).join('|'))
    .digest('hex')
    .slice(0, 24)
  return `${prefix}_${hash}`
}

function contentHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}

async function readJson(filename) {
  const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8')
  return JSON.parse(raw)
}

async function readExistingJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function withoutGeneratedAt(value) {
  if (!value || typeof value !== 'object') return value
  const { generatedAt, ...rest } = value
  void generatedAt
  return rest
}

function normalizePathKey(value) {
  return String(value || '')
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase()
}

function normalizeName(value) {
  return path.basename(String(value || '')).replace(/\s+/g, '').toLowerCase()
}

async function walkFiles(root, output = []) {
  let entries = []
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return output
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output)
    } else if (entry.isFile()) {
      output.push(fullPath)
    }
  }
  return output
}

async function buildSourceIndex() {
  const byName = new Map()
  const allFiles = []
  for (const root of SOURCE_ROOTS) {
    const files = await walkFiles(root)
    allFiles.push(...files)
    for (const file of files) {
      const key = normalizeName(file)
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push(file)
    }
  }
  return { allFiles, byName }
}

function resolveSourceFile(file, sourceIndex) {
  const relativePath = file.relativePath || file.source || ''
  const candidates = []
  if (path.isAbsolute(relativePath)) candidates.push(relativePath)
  for (const root of SOURCE_ROOTS) {
    candidates.push(path.join(root, relativePath))
    candidates.push(path.join(root, file.source || ''))
  }
  for (const candidate of candidates) {
    if (candidate && fssync.existsSync(candidate)) return candidate
  }

  const sourceName = normalizeName(file.source || relativePath)
  const relativeKey = normalizePathKey(relativePath)
  const nameMatches = sourceIndex.byName.get(sourceName) || []
  if (nameMatches.length === 1) return nameMatches[0]
  const suffixMatch = nameMatches.find((candidate) => normalizePathKey(candidate).endsWith(relativeKey))
  return suffixMatch || nameMatches[0] || null
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error('ZIP end of central directory not found')
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(buffer, entry) {
  const offset = entry.localOffset
  if (buffer.readUInt32LE(offset) !== 0x04034b50) return null
  const nameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + nameLength + extraLength
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize)
  if (entry.method === 0) return Buffer.from(compressed)
  if (entry.method === 8) return zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
  return null
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractParagraphText(paragraphXml) {
  const pieces = []
  for (const match of paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
    pieces.push(decodeXml(match[1]))
  }
  return pieces.join('').replace(/\s+/g, ' ').trim()
}

function detectQuestionNumber(text) {
  const compact = text.replace(/^\s+/, '')
  const match = compact.match(/^(?:第\s*)?(\d{1,2})\s*(?:题|[\.．、)）]|[\uff0e\uff0c\uff1a])/u)
  if (!match) return null
  const number = Number.parseInt(match[1], 10)
  return Number.isInteger(number) && number > 0 && number <= 100 ? number : null
}

function parseRelationships(xml) {
  const relationships = new Map()
  if (!xml) return relationships
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\/>/g)) {
    const attrs = match[1]
    const id = attrs.match(/\bId="([^"]+)"/)?.[1]
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1]
    if (!id || !target) continue
    relationships.set(id, target.replace(/^\.\.\//, 'word/').replace(/^media\//, 'word/media/'))
  }
  return relationships
}

function parseDocxImageRefs(entries, zipBuffer) {
  const documentEntry = entries.get('word/document.xml')
  const relsEntry = entries.get('word/_rels/document.xml.rels')
  if (!documentEntry) return { byQuestion: new Map(), unmatched: [] }
  const documentXml = readZipEntry(zipBuffer, documentEntry)?.toString('utf8') || ''
  const relsXml = relsEntry ? readZipEntry(zipBuffer, relsEntry)?.toString('utf8') || '' : ''
  const relationships = parseRelationships(relsXml)
  const byQuestion = new Map()
  const unmatched = []
  let currentQuestion = null
  let paragraphIndex = 0

  for (const paragraphMatch of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    paragraphIndex += 1
    const paragraphXml = paragraphMatch[0]
    const text = extractParagraphText(paragraphXml)
    const detected = detectQuestionNumber(text)
    if (detected) currentQuestion = detected
    const relationIds = [...paragraphXml.matchAll(/r:(?:embed|link)="([^"]+)"/g)].map((match) => match[1])
    const mediaRefs = relationIds
      .map((id) => ({ id, target: relationships.get(id) }))
      .filter((item) => item.target && item.target.startsWith('word/media/'))
    for (const ref of mediaRefs) {
      const payload = { ...ref, paragraphIndex, textHint: text.slice(0, 120) }
      if (currentQuestion) {
        if (!byQuestion.has(currentQuestion)) byQuestion.set(currentQuestion, [])
        byQuestion.get(currentQuestion).push(payload)
      } else {
        unmatched.push(payload)
      }
    }
  }
  return { byQuestion, unmatched }
}

async function copyAsset(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase()
  const contentType = WEB_IMAGE_TYPES.get(ext)
  if (!contentType) return null
  const hash = contentHash(buffer)
  const filename = `${hash.slice(0, 20)}${ext === '.jpeg' ? '.jpg' : ext}`
  const outputPath = path.join(PUBLIC_ASSET_DIR, filename)
  await fs.mkdir(PUBLIC_ASSET_DIR, { recursive: true })
  try {
    await fs.writeFile(outputPath, buffer, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  return {
    url: `/gaokao-assets/images/${filename}`,
    hash,
    contentType,
    bytes: buffer.length,
  }
}

function buildExtractQuestionKey(dataset, file, question) {
  if (dataset.keyPrefix === 'audit_ocr_question') {
    return question.id || hashKey('audit_ocr_question', [file.year, file.subject, file.source, question.number, question.prompt])
  }
  return hashKey('extract_question', [file.year, file.subject, file.source, question.number, question.prompt])
}

async function extractDocxAssets(dataset, file, sourcePath, summary) {
  const zipBuffer = await fs.readFile(sourcePath)
  const entries = readZipEntries(zipBuffer)
  const { byQuestion, unmatched } = parseDocxImageRefs(entries, zipBuffer)
  const output = []

  for (const [number, refs] of byQuestion.entries()) {
    const matchingQuestions = (file.questions || []).filter((question) => Number(question.number) === Number(number))
    if (matchingQuestions.length === 0) {
      summary.unmatchedImages += refs.length
      continue
    }
    for (const ref of refs) {
      const entry = entries.get(ref.target)
      if (!entry) {
        summary.missingMedia += 1
        continue
      }
      const mediaBuffer = readZipEntry(zipBuffer, entry)
      if (!mediaBuffer) {
        summary.unsupportedZipEntries += 1
        continue
      }
      const copied = await copyAsset(mediaBuffer, ref.target)
      if (!copied) {
        summary.unsupportedImages += 1
        continue
      }
      for (const question of matchingQuestions) {
        output.push({
          questionKey: buildExtractQuestionKey(dataset, file, question),
          dataset: dataset.filename,
          source: file.source,
          relativePath: file.relativePath || '',
          number: question.number,
          image: {
            ...copied,
            kind: 'docx-media',
            scope: 'question',
            sourceFile: file.source,
            sourceRelativePath: file.relativePath || '',
            mediaPath: ref.target,
            relationId: ref.id,
            paragraphIndex: ref.paragraphIndex,
            caption: `题目配图 ${output.length + 1}`,
            needsReview: false,
          },
        })
      }
    }
  }
  summary.unmatchedImages += unmatched.length
  return output
}

async function copyOcrPageAssets(dataset, file, summary) {
  const pages = Array.isArray(file.pages) ? file.pages : []
  if (pages.length === 0) return []
  const figureQuestions = (file.questions || []).filter((question) => FIGURE_HINT.test(question.prompt || ''))
  if (figureQuestions.length === 0) return []
  const copiedPages = []
  for (const page of pages.slice(0, 6)) {
    const pageImage = page.image || page.path
    if (!pageImage || !fssync.existsSync(pageImage)) continue
    const buffer = await fs.readFile(pageImage)
    const copied = await copyAsset(buffer, pageImage)
    if (!copied) {
      summary.unsupportedImages += 1
      continue
    }
    copiedPages.push({ page, copied })
  }
  const output = []
  for (const question of figureQuestions) {
    for (const { page, copied } of copiedPages) {
      output.push({
        questionKey: buildExtractQuestionKey(dataset, file, question),
        dataset: dataset.filename,
        source: file.source,
        relativePath: file.relativePath || '',
        number: question.number,
        image: {
          ...copied,
          kind: 'ocr-page',
          scope: 'source-page',
          sourceFile: file.source,
          sourceRelativePath: file.relativePath || '',
          page: page.page || page.pdfPage || null,
          caption: `OCR 页面图 ${page.page || page.pdfPage || ''}`.trim(),
          needsReview: true,
        },
      })
    }
  }
  summary.ocrPageAssets += output.length
  return output
}

async function extractJiangsuOcrPageAssets(summary) {
  let data
  try {
    data = await readJson('jiangsu-gaokao-ocr.json')
  } catch {
    return []
  }
  const source = data.source || {}
  const pages = Array.isArray(data.pages) ? data.pages : []
  const figureQuestions = (data.questions || []).filter((question) => FIGURE_HINT.test(question.prompt || ''))
  if (pages.length === 0 || figureQuestions.length === 0) return []
  const copiedPages = []
  for (const page of pages.slice(0, 6)) {
    const imagePath = path.resolve(ROOT_DIR, page.image || '')
    if (!fssync.existsSync(imagePath)) continue
    const buffer = await fs.readFile(imagePath)
    const copied = await copyAsset(buffer, imagePath)
    if (copied) copiedPages.push({ page, copied })
  }
  const output = []
  for (const question of figureQuestions) {
    for (const { page, copied } of copiedPages) {
      output.push({
        questionKey: hashKey('ocr_question', [source.year, source.province, source.subject || 'math', question.number, question.prompt]),
        dataset: 'jiangsu-gaokao-ocr.json',
        source: source.filename,
        relativePath: source.relativePath || '',
        number: question.number,
        image: {
          ...copied,
          kind: 'ocr-page',
          scope: 'source-page',
          sourceFile: source.filename,
          sourceRelativePath: source.relativePath || '',
          page: page.pdfPage || page.page || null,
          caption: `OCR 页面图 ${page.pdfPage || page.page || ''}`.trim(),
          needsReview: true,
        },
      })
    }
  }
  summary.ocrPageAssets += output.length
  return output
}

function groupByQuestion(records) {
  const byQuestion = new Map()
  for (const record of records) {
    if (!record.questionKey) continue
    if (!byQuestion.has(record.questionKey)) {
      byQuestion.set(record.questionKey, {
        questionKey: record.questionKey,
        dataset: record.dataset,
        source: record.source,
        relativePath: record.relativePath || '',
        number: record.number,
        images: [],
      })
    }
    const target = byQuestion.get(record.questionKey)
    const identity = `${record.image.hash}:${record.image.mediaPath || record.image.page || record.image.url}`
    if (!target.images.some((image) => `${image.hash}:${image.mediaPath || image.page || image.url}` === identity)) {
      target.images.push(record.image)
    }
  }
  return [...byQuestion.values()].sort((left, right) => left.questionKey.localeCompare(right.questionKey))
}

async function main() {
  const sourceIndex = await buildSourceIndex()
  const records = []
  const summary = {
    sourceFilesIndexed: sourceIndex.allFiles.length,
    datasets: 0,
    filesScanned: 0,
    docxFilesScanned: 0,
    filesMissing: 0,
    imagesExtracted: 0,
    questionsWithImages: 0,
    unmatchedImages: 0,
    missingMedia: 0,
    unsupportedImages: 0,
    unsupportedZipEntries: 0,
    ocrPageAssets: 0,
  }

  for (const dataset of DATASETS) {
    let data
    try {
      data = await readJson(dataset.filename)
    } catch {
      continue
    }
    summary.datasets += 1
    for (const file of data.files || []) {
      summary.filesScanned += 1
      const ext = path.extname(file.relativePath || file.source || '').toLowerCase()
      if (ext === '.docx') {
        const sourcePath = resolveSourceFile(file, sourceIndex)
        if (!sourcePath) {
          summary.filesMissing += 1
          continue
        }
        summary.docxFilesScanned += 1
        records.push(...(await extractDocxAssets(dataset, file, sourcePath, summary)))
      } else if (dataset.keyPrefix === 'audit_ocr_question') {
        records.push(...(await copyOcrPageAssets(dataset, file, summary)))
      }
    }
  }

  records.push(...(await extractJiangsuOcrPageAssets(summary)))

  const questions = groupByQuestion(records)
  summary.imagesExtracted = questions.reduce((total, item) => total + item.images.length, 0)
  summary.questionsWithImages = questions.length

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoots: SOURCE_ROOTS,
    assetBaseUrl: '/gaokao-assets/images/',
    summary,
    questions,
  }
  const existingManifest = await readExistingJson(MANIFEST_PATH)
  if (
    existingManifest &&
    JSON.stringify(withoutGeneratedAt(existingManifest)) === JSON.stringify(withoutGeneratedAt(manifest))
  ) {
    manifest.generatedAt = existingManifest.generatedAt || manifest.generatedAt
  }
  const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`
  if (existingManifest && nextManifest === `${JSON.stringify(existingManifest, null, 2)}\n`) {
    console.log(JSON.stringify(summary, null, 2))
    console.log(`Unchanged ${path.relative(ROOT_DIR, MANIFEST_PATH)}`)
    return
  }
  await fs.writeFile(MANIFEST_PATH, nextManifest, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Wrote ${path.relative(ROOT_DIR, MANIFEST_PATH)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
