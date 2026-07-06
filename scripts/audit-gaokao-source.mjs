import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const defaultSourceRoot = 'C:\\Users\\zzz\\Desktop\\参考资料\\2026高考试卷（更新中）'
const sourceRoot = process.env.GAOKAO_SOURCE_DIR || defaultSourceRoot
const outFile = path.join(repoRoot, 'src', 'data', 'gaokao-processing-audit.json')

const SUBJECTS = [
  { key: 'chinese', name: '语文', terms: ['语文'] },
  { key: 'math', name: '数学', terms: ['数学'] },
  { key: 'english', name: '英语', terms: ['英语', '外语'] },
  { key: 'physics', name: '物理', terms: ['物理'] },
  { key: 'chemistry', name: '化学', terms: ['化学'] },
  { key: 'biology', name: '生物', terms: ['生物'] },
  { key: 'politics', name: '政治', terms: ['政治', '思想政治'] },
  { key: 'history', name: '历史', terms: ['历史'] },
  { key: 'geography', name: '地理', terms: ['地理'] },
]

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.doc', '.pdf', '.jpg', '.jpeg', '.png', '.mp3'])
const ANALYSIS_RE = /(解析|答案|详解|教师版|解答|参考|读后续写|作文|翻译)/u
const ORIGINAL_RE = /(原卷|空白卷|试卷|试题|真题|卷|回忆)/u

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, acc)
    else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) acc.push(fullPath)
  }
  return acc
}

function isIn2026Scope(relativePath, fileName) {
  const text = `${relativePath} ${fileName}`
  if (/1990-2025/u.test(text)) return false
  return /2026/u.test(text)
}

function detectSubject(text) {
  return SUBJECTS.find(subject => subject.terms.some(term => text.includes(term))) || null
}

function detectRole(text) {
  if (/(原卷版|原卷|空白卷)/u.test(text)) return 'original'
  if (ANALYSIS_RE.test(text)) return 'answer-or-analysis'
  if (ORIGINAL_RE.test(text)) return 'original'
  return 'unknown'
}

function detectStatus(ext, role, matchedExtracted) {
  if (matchedExtracted) return 'structured'
  if (ext === '.doc') return 'needs-doc-conversion'
  if (ext === '.docx' && role === 'answer-or-analysis') return 'answer-source'
  if (ext === '.docx') return 'needs-docx-extraction'
  if (ext === '.pdf' && role === 'answer-or-analysis') return 'answer-pdf-needs-linking'
  if (ext === '.pdf') return 'needs-pdf-ocr'
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return 'needs-image-review'
  if (ext === '.mp3') return 'audio-source'
  return 'unknown'
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1
}

const extracted = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'data', 'jiangsu-gaokao-extracted.json'), 'utf8'))
const extractedNames = new Set(extracted.files.map(file => file.source))
const files = walk(sourceRoot)
  .map(file => {
    const fileName = path.basename(file)
    const relativePath = path.relative(sourceRoot, file)
    if (!isIn2026Scope(relativePath, fileName)) return null
    const ext = path.extname(fileName).toLowerCase()
    const searchableText = `${fileName} ${relativePath}`
    const subject = detectSubject(searchableText)
    const role = detectRole(searchableText)
    const matchedExtracted = extractedNames.has(fileName)
    return {
      name: fileName,
      relativePath,
      ext,
      subjectKey: subject?.key || 'unknown',
      subjectName: subject?.name || '未知',
      role,
      status: detectStatus(ext, role, matchedExtracted),
    }
  })
  .filter(Boolean)
  .sort((left, right) => (
    left.subjectKey.localeCompare(right.subjectKey) ||
    left.status.localeCompare(right.status) ||
    left.relativePath.localeCompare(right.relativePath)
  ))

const byStatus = {}
const bySubject = {}
for (const file of files) {
  increment(byStatus, file.status)
  if (!bySubject[file.subjectKey]) bySubject[file.subjectKey] = { subjectName: file.subjectName, total: 0, byStatus: {} }
  bySubject[file.subjectKey].total += 1
  increment(bySubject[file.subjectKey].byStatus, file.status)
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceRootLabel: '本地 2026 高考试卷资料目录',
  scope: '包含路径或文件名带 2026 的资料；排除 1990-2025 历史合集，避免父目录年份误判。',
  totals: {
    files: files.length,
    byStatus,
    bySubject,
  },
  files,
}

fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(`Audited ${files.length} files`)
console.log(`Wrote ${path.relative(repoRoot, outFile)}`)
