import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const defaultSourceRoot = 'C:\\Users\\zzz\\Desktop\\参考资料\\2026高考试卷（更新中）'
const sourceRoot = process.env.GAOKAO_SOURCE_DIR || defaultSourceRoot
const outFile = path.join(repoRoot, 'src', 'data', 'jiangsu-gaokao-index.json')

const YEARS = Array.from({ length: 10 }, (_, index) => 2017 + index)

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

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.doc', '.pdf', '.mp3'])
const NEW_GAOKAO_I_RE = /新高考[ⅠI1一]卷?/u
const NEW_CURRICULUM_I_RE = /新课标[ⅠI1一]卷?/u
const NATIONAL_I_RE = /(全国[一1ⅠI]卷?|全国[一1ⅠI])/u
const JIANGSU_RE = /江苏/u
const ANALYSIS_RE = /(解析|答案|详解|参考|精校|精品)/u
const ORIGINAL_RE = /(原卷|空白卷|试卷|真题|卷)/u

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, acc)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SUPPORTED_EXTENSIONS.has(ext)) acc.push(fullPath)
    }
  }
  return acc
}

function detectYear(fileName) {
  const match = fileName.match(/20(1[7-9]|2[0-6])/u)
  return match ? Number(match[0]) : null
}

function detectSubject(text) {
  return SUBJECTS.find(subject => subject.terms.some(term => text.includes(term))) || null
}

function detectPaperKind(year, text) {
  if (JIANGSU_RE.test(text)) return 'jiangsu'
  if ((year === 2021 || year === 2022) && NEW_GAOKAO_I_RE.test(text)) return 'common-i'
  if (year >= 2023 && year <= 2025 && (NEW_GAOKAO_I_RE.test(text) || NEW_CURRICULUM_I_RE.test(text))) return 'common-i'
  if (year === 2026 && (NATIONAL_I_RE.test(text) || NEW_CURRICULUM_I_RE.test(text))) return 'common-i'
  return 'other'
}

function detectFileStatus(ext) {
  if (ext === '.docx') return 'extractable'
  if (ext === '.doc') return 'needs-conversion'
  if (ext === '.pdf') return 'needs-ocr-check'
  if (ext === '.mp3') return 'audio'
  return 'unknown'
}

function detectRole(text) {
  if (ANALYSIS_RE.test(text)) return 'analysis'
  if (ORIGINAL_RE.test(text)) return 'original'
  return 'unknown'
}

function createEmptyMatrix() {
  const matrix = {}
  for (const year of YEARS) {
    matrix[year] = {}
    for (const subject of SUBJECTS) {
      matrix[year][subject.key] = {
        subject: subject.name,
        total: 0,
        byStatus: {
          extractable: 0,
          'needs-conversion': 0,
          'needs-ocr-check': 0,
          audio: 0,
          unknown: 0,
        },
        samples: [],
      }
    }
  }
  return matrix
}

function shouldInclude(year, paperKind, relativePath) {
  if (year <= 2020) return paperKind === 'jiangsu'
  if (paperKind === 'jiangsu' || paperKind === 'common-i') return true
  if (year === 2026 && relativePath.includes(`${path.sep}一卷${path.sep}`)) return true
  return false
}

function summarize(matrix) {
  const totals = {
    files: 0,
    extractable: 0,
    needsConversion: 0,
    needsOcrCheck: 0,
    audio: 0,
    coveredCells: 0,
  }
  const yearSummaries = YEARS.map(year => {
    let files = 0
    let coveredSubjects = 0
    for (const subject of SUBJECTS) {
      const cell = matrix[year][subject.key]
      files += cell.total
      if (cell.total > 0) coveredSubjects += 1
      totals.extractable += cell.byStatus.extractable
      totals.needsConversion += cell.byStatus['needs-conversion']
      totals.needsOcrCheck += cell.byStatus['needs-ocr-check']
      totals.audio += cell.byStatus.audio
    }
    totals.files += files
    totals.coveredCells += coveredSubjects
    return { year, files, coveredSubjects, totalSubjects: SUBJECTS.length }
  })
  return { totals, yearSummaries }
}

const matrix = createEmptyMatrix()
const allFiles = walk(sourceRoot)

for (const file of allFiles) {
  const fileName = path.basename(file)
  const year = detectYear(fileName)
  if (!year || !YEARS.includes(year)) continue

  const relativePath = path.relative(sourceRoot, file)
  const searchableText = `${fileName} ${relativePath}`
  const subject = detectSubject(searchableText)
  if (!subject) continue

  const paperKind = detectPaperKind(year, searchableText)
  if (!shouldInclude(year, paperKind, relativePath)) continue

  const ext = path.extname(fileName).toLowerCase()
  const status = detectFileStatus(ext)
  const role = detectRole(searchableText)
  const cell = matrix[year][subject.key]
  cell.total += 1
  cell.byStatus[status] += 1
  if (cell.samples.length < 4) {
    cell.samples.push({
      name: fileName,
      relativePath,
      ext,
      status,
      role,
      paperKind,
    })
  }
}

const summary = summarize(matrix)
const output = {
  generatedAt: new Date().toISOString(),
  sourceRootLabel: '本地高考资料目录',
  years: YEARS,
  subjects: SUBJECTS.map(({ key, name }) => ({ key, name })),
  ...summary,
  matrix,
}

fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

console.log(`Indexed ${summary.totals.files} candidate files`)
console.log(`Wrote ${path.relative(repoRoot, outFile)}`)
