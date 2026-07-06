import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverage, genePatterns, practiceQuestions, sources, subjects, years } from '../src/data/jiangsu-gaokao.js'
import { ensureSchema, pool, query } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../src/data')
let answerOverrideMap = new Map()

function hashKey(prefix, parts) {
  const hash = crypto
    .createHash('sha1')
    .update(parts.filter(part => part !== undefined && part !== null).join('|'))
    .digest('hex')
    .slice(0, 24)
  return `${prefix}_${hash}`
}

function asJson(value, fallback) {
  return JSON.stringify(value ?? fallback)
}

async function loadJson(filename) {
  const content = await fs.readFile(path.join(DATA_DIR, filename), 'utf8')
  return JSON.parse(content)
}

function loadAnswerOverrides(data) {
  answerOverrideMap = new Map((data.overrides || []).map(override => [override.questionId, override]))
}

function cleanOverrideText(value) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '') : value
}

function applyAnswerOverride(item) {
  if (!item?.id) return item
  const override = answerOverrideMap.get(item.id)
  if (!override?.answer) return item
  if (item.answer && !override.replacesAnswer) return item
  return {
    ...item,
    answer: cleanOverrideText(override.answer),
    solution: Array.isArray(item.solution) && item.solution.length > 0 ? item.solution : (override.solution || []).map(cleanOverrideText),
    flags: [
      ...(item.flags || []),
      'answer_override',
      `answer_override_${override.method}`,
    ],
  }
}

function getQuestionPrompt(item) {
  return typeof item?.prompt === 'string' ? item.prompt : ''
}

function hasQuestionOptions(item) {
  return Array.isArray(item?.options) && item.options.length > 0
}

function isNumericExtractionFragment(item) {
  const compactPrompt = getQuestionPrompt(item).replace(/\s+/g, ' ').trim()
  if (!compactPrompt || hasQuestionOptions(item)) return false
  return /^[\d\s.,，。:：;；\-+*/()（）[\]{}<>《》=≈~～^_\\|√π%°]+$/u.test(compactPrompt)
}

function questionNumberValue(value) {
  const number = typeof value === 'number'
    ? value
    : /^\s*\d+\s*$/u.test(String(value ?? ''))
      ? Number.parseInt(String(value).trim(), 10)
      : Number.NaN
  return Number.isInteger(number) && number >= 1 && number <= 100 ? number : null
}

function hasQuestionNumber(item) {
  return questionNumberValue(item?.number) !== null
}

function isUnnumberedExtractionFragment(item) {
  return !hasQuestionNumber(item)
}

function hasQuestionFlag(item, flag) {
  return Array.isArray(item?.flags) && item.flags.includes(flag)
}

function isPassageOnlyExtractionFragment(item) {
  return hasQuestionFlag(item, 'passage_only')
}

function isAnswerAnalysisExtractionFragment(item) {
  const compactPrompt = getQuestionPrompt(item).replace(/\s+/g, ' ').trim()
  if (!compactPrompt || hasQuestionOptions(item)) return false
  if (/^写作词数应为\s*\d+\s*(?:个)?左右\s*[:：;；。.]?$/u.test(compactPrompt)) return true
  if (compactPrompt.length < 80 && compactPrompt.includes('词数') && compactPrompt.includes('注意')) return true
  if (/^(?:母本筛选|叙事重构|难度适配|留白定向)\s*[:：]/u.test(compactPrompt)) return true
  if (/写作思路指导|高分写作技巧|参考范文/u.test(compactPrompt)) return true
  return /\b(?:Yours|Yours sincerely),?\s+Li Hua\s*$/iu.test(compactPrompt)
}

function shouldImportExtractedQuestion(item) {
  return !isNumericExtractionFragment(item)
    && !isUnnumberedExtractionFragment(item)
    && !isPassageOnlyExtractionFragment(item)
    && !isAnswerAnalysisExtractionFragment(item)
}

function isOcrAnswerSourceFile(file) {
  if (file?.role !== 'answer-or-analysis') return false
  const sourceText = `${file.source || ''} ${file.relativePath || ''}`
  if (/答案版|解析|教师版/u.test(sourceText)) return true
  return (file.questions || []).some(item => getQuestionPrompt(item).includes('【答案】'))
}

async function deleteQuestionByKey(questionKey) {
  await query('DELETE FROM gaokao_questions WHERE question_key = $1', [questionKey])
}

async function upsertSource(source) {
  const { rows } = await query(`
    INSERT INTO gaokao_sources (source_key, name, detail, status, source_type, relative_path, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (source_key) DO UPDATE SET
      name = EXCLUDED.name,
      detail = EXCLUDED.detail,
      status = EXCLUDED.status,
      source_type = EXCLUDED.source_type,
      relative_path = EXCLUDED.relative_path,
      metadata = EXCLUDED.metadata
    RETURNING id
  `, [
    source.sourceKey,
    source.name,
    source.detail || null,
    source.status || 'active',
    source.sourceType || 'local',
    source.relativePath || null,
    asJson(source.metadata, {}),
  ])
  return rows[0].id
}

async function upsertPaper(paper) {
  const { rows } = await query(`
    INSERT INTO gaokao_papers (
      paper_key, year, subject_key, subject_name, paper_name, paper_kind, status, metadata, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (paper_key) DO UPDATE SET
      year = EXCLUDED.year,
      subject_key = EXCLUDED.subject_key,
      subject_name = EXCLUDED.subject_name,
      paper_name = EXCLUDED.paper_name,
      paper_kind = EXCLUDED.paper_kind,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id
  `, [
    paper.paperKey,
    paper.year || null,
    paper.subjectKey,
    paper.subjectName,
    paper.paperName,
    paper.paperKind || 'exam',
    paper.status || 'indexed',
    asJson(paper.metadata, {}),
  ])
  return rows[0].id
}

async function upsertQuestion(question) {
  const { rows } = await query(`
    INSERT INTO gaokao_questions (
      question_key, paper_id, year, subject_key, subject_name, question_number,
      question_type, difficulty, quality, prompt, answer, solution, flags, source_type, metadata, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
    ON CONFLICT (question_key) DO UPDATE SET
      paper_id = EXCLUDED.paper_id,
      year = EXCLUDED.year,
      subject_key = EXCLUDED.subject_key,
      subject_name = EXCLUDED.subject_name,
      question_number = EXCLUDED.question_number,
      question_type = EXCLUDED.question_type,
      difficulty = EXCLUDED.difficulty,
      quality = EXCLUDED.quality,
      prompt = EXCLUDED.prompt,
      answer = EXCLUDED.answer,
      solution = EXCLUDED.solution,
      flags = EXCLUDED.flags,
      source_type = EXCLUDED.source_type,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id
  `, [
    question.questionKey,
    question.paperId || null,
    question.year || null,
    question.subjectKey,
    question.subjectName,
    question.questionNumber || null,
    question.questionType || null,
    question.difficulty || null,
    question.quality || 'indexed',
    question.prompt,
    question.answer || null,
    asJson(question.solution, []),
    asJson(question.flags, []),
    question.sourceType || 'real',
    asJson(question.metadata, {}),
  ])
  return rows[0].id
}

async function replaceTags(questionId, tags) {
  await query('DELETE FROM gaokao_question_tags WHERE question_id = $1', [questionId])
  for (const tag of tags) {
    if (!tag?.tag) continue
    await query(`
      INSERT INTO gaokao_question_tags (question_id, tag_type, tag)
      VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING
    `, [questionId, tag.tagType || 'topic', tag.tag])
  }
}

async function seedSubjectProfiles() {
  for (const subject of subjects) {
    await query(`
      INSERT INTO gaokao_subject_profiles (
        subject_key, subject_name, accent, icon, route, trend, advice,
        high_frequency, easy_mistakes, metadata, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      ON CONFLICT (subject_key) DO UPDATE SET
        subject_name = EXCLUDED.subject_name,
        accent = EXCLUDED.accent,
        icon = EXCLUDED.icon,
        route = EXCLUDED.route,
        trend = EXCLUDED.trend,
        advice = EXCLUDED.advice,
        high_frequency = EXCLUDED.high_frequency,
        easy_mistakes = EXCLUDED.easy_mistakes,
        metadata = EXCLUDED.metadata,
        updated_at = now()
    `, [
      subject.key,
      subject.name,
      subject.accent || null,
      subject.icon || null,
      subject.route || `/courses/gaokao/${subject.key}/`,
      subject.trend || null,
      subject.advice || null,
      asJson(subject.highFrequency, []),
      asJson(subject.easyMistakes, []),
      asJson({ homeIntro: subject.homeIntro, tags: subject.tags, focus: subject.focus }, {}),
    ])
  }
}

async function seedStaticSources(index, extracted, docx2026, pdfText2026, auditOcr2026, residual2026, answerOverrides, ocr) {
  let count = 0
  for (const source of sources) {
    await upsertSource({
      sourceKey: hashKey('static_source', [source.name, source.detail]),
      name: source.name,
      detail: source.detail,
      status: source.status,
      sourceType: 'reference',
    })
    count += 1
  }

  await upsertSource({
    sourceKey: 'local_gaokao_index',
    name: index.sourceRootLabel || '本地高考资料索引',
    detail: 'src/data/jiangsu-gaokao-index.json',
    status: 'indexed',
    sourceType: 'local-index',
    relativePath: 'src/data/jiangsu-gaokao-index.json',
    metadata: { generatedAt: index.generatedAt, totals: index.totals },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_extracted',
    name: '本地 DOCX 真题抽取结果',
    detail: 'src/data/jiangsu-gaokao-extracted.json',
    status: 'extracted',
    sourceType: 'local-extract',
    relativePath: 'src/data/jiangsu-gaokao-extracted.json',
    metadata: { generatedAt: extracted.generatedAt, summary: extracted.summary, scope: extracted.scope },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_2026_docx_extracted',
    name: '2026 高考 DOCX 审计抽取结果',
    detail: 'src/data/gaokao-2026-docx-extracted.json',
    status: 'extracted-needs-review',
    sourceType: 'local-extract',
    relativePath: 'src/data/gaokao-2026-docx-extracted.json',
    metadata: { generatedAt: docx2026.generatedAt, summary: docx2026.summary, scope: docx2026.scope },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_2026_pdf_text_extracted',
    name: '2026 高考 PDF 文本层抽取结果',
    detail: 'src/data/gaokao-2026-pdf-text-extracted.json',
    status: 'extracted-needs-review',
    sourceType: 'local-extract',
    relativePath: 'src/data/gaokao-2026-pdf-text-extracted.json',
    metadata: { generatedAt: pdfText2026.generatedAt, summary: pdfText2026.summary, scope: pdfText2026.scope },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_2026_ocr_extracted',
    name: '2026 高考扫描件 OCR 抽取结果',
    detail: 'src/data/gaokao-2026-ocr-extracted.json',
    status: 'ocr-needs-review',
    sourceType: 'local-ocr',
    relativePath: 'src/data/gaokao-2026-ocr-extracted.json',
    metadata: { generatedAt: auditOcr2026.generatedAt, summary: auditOcr2026.summary, scope: auditOcr2026.scope },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_2026_residual_extracted',
    name: '2026 高考非标准残余文件抽取结果',
    detail: 'src/data/gaokao-2026-residual-extracted.json',
    status: 'extracted-needs-review',
    sourceType: 'local-extract',
    relativePath: 'src/data/gaokao-2026-residual-extracted.json',
    metadata: { generatedAt: residual2026.generatedAt, summary: residual2026.summary, scope: residual2026.scope, skipped: residual2026.skipped },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_2026_answer_overrides',
    name: '2026 高考本地答案补全覆盖表',
    detail: 'src/data/gaokao-2026-answer-overrides.json',
    status: 'answer-enriched',
    sourceType: 'local-answer-overrides',
    relativePath: 'src/data/gaokao-2026-answer-overrides.json',
    metadata: { generatedAt: answerOverrides.generatedAt, summary: answerOverrides.summary, scope: answerOverrides.scope },
  })
  await upsertSource({
    sourceKey: 'local_gaokao_ocr_2026_jiangsu_math',
    name: ocr.source?.filename || '2026 江苏数学 OCR',
    detail: ocr.source?.note,
    status: ocr.source?.status || 'ocr-needs-review',
    sourceType: 'local-ocr',
    relativePath: ocr.source?.relativePath,
    metadata: { generatedAt: ocr.generatedAt, summary: ocr.summary, pages: ocr.pages },
  })
  return count + 8
}

async function seedIndexPapers(index) {
  let count = 0
  for (const [yearText, subjectCells] of Object.entries(index.matrix || {})) {
    const year = Number(yearText)
    for (const subject of subjects) {
      const cell = subjectCells[subject.key]
      if (!cell) continue
      await upsertPaper({
        paperKey: `index:${year}:${subject.key}`,
        year,
        subjectKey: subject.key,
        subjectName: subject.name,
        paperName: `${year} 江苏/新高考资料索引 - ${subject.name}`,
        paperKind: cell.samples?.[0]?.paperKind || 'index',
        status: cell.total > 0 ? 'indexed' : 'missing',
        metadata: cell,
      })
      count += 1
    }
  }
  return count
}

async function seedYearOverviewPapers() {
  let count = 0
  for (const year of years) {
    for (const subject of subjects) {
      await upsertPaper({
        paperKey: `overview:${year.year}:${subject.key}`,
        year: year.year,
        subjectKey: subject.key,
        subjectName: subject.name,
        paperName: `${year.year} ${year.paper} - ${subject.name}`,
        paperKind: 'overview',
        status: year.status || 'partial',
        metadata: {
          note: year.note,
          subjects: year.subjects,
          status: year.status,
        },
      })
      count += 1
    }
  }
  return count
}

async function seedExtractedQuestions(extracted) {
  let papers = 0
  let questions = 0
  let skippedFragments = 0
  for (const file of extracted.files || []) {
    const paperId = await upsertPaper({
      paperKey: hashKey('extract_paper', [file.year, file.subject, file.source, file.relativePath]),
      year: file.year,
      subjectKey: file.subject,
      subjectName: file.subjectName,
      paperName: file.source,
      paperKind: file.relativePath?.toLowerCase().endsWith('.pdf') ? 'real-pdf-text' : 'real-extracted',
      status: file.questions?.some(question => question.quality === 'matched') ? 'matched' : 'review',
      metadata: {
        relativePath: file.relativePath,
        analysisSource: file.analysisSource,
        analysisRelativePath: file.analysisRelativePath,
      },
    })
    papers += 1

    for (const rawItem of file.questions || []) {
      const questionKey = hashKey('extract_question', [file.year, file.subject, file.source, rawItem.number, rawItem.prompt])
      if (!shouldImportExtractedQuestion(rawItem)) {
        await deleteQuestionByKey(questionKey)
        skippedFragments += 1
        continue
      }
      const item = applyAnswerOverride(rawItem)
      const sourceType = file.sourceType || (file.relativePath?.toLowerCase().endsWith('.pdf') ? 'real-pdf-text' : 'real-docx')
      const questionId = await upsertQuestion({
        questionKey,
        paperId,
        year: file.year,
        subjectKey: file.subject,
        subjectName: file.subjectName,
        questionNumber: questionNumberValue(item.number),
        questionType: item.questionType || null,
        difficulty: null,
        quality: item.quality || 'review',
        prompt: item.prompt,
        answer: item.answer,
        solution: item.solution,
        flags: item.flags,
        sourceType,
        metadata: {
          source: file.source,
          relativePath: file.relativePath,
          analysisSource: file.analysisSource,
          analysisRelativePath: file.analysisRelativePath,
        },
      })
      await replaceTags(questionId, [
        { tagType: 'quality', tag: item.quality || 'review' },
        ...(item.flags || []).map(flag => ({ tagType: 'flag', tag: flag })),
      ])
      questions += 1
    }
  }
  return { papers, questions, skippedFragments }
}

async function seedOcrQuestions(ocr) {
  const source = ocr.source || {}
  const subject = subjects.find(item => item.key === source.subject) || { key: source.subject || 'math', name: source.subjectName || '数学' }
  const paperId = await upsertPaper({
    paperKey: 'ocr:2026:jiangsu:math',
    year: source.year || 2026,
    subjectKey: subject.key,
    subjectName: subject.name,
    paperName: source.filename || '2026 江苏数学 OCR',
    paperKind: 'real-ocr',
    status: source.status || 'ocr-needs-review',
    metadata: {
      province: source.province,
      relativePath: source.relativePath,
      note: source.note,
      summary: ocr.summary,
      pages: ocr.pages,
    },
  })

  let questions = 0
  let skippedFragments = 0
  for (const rawItem of ocr.questions || []) {
    const questionKey = hashKey('ocr_question', [source.year, source.province, subject.key, rawItem.number, rawItem.prompt])
    if (!shouldImportExtractedQuestion(rawItem)) {
      await deleteQuestionByKey(questionKey)
      skippedFragments += 1
      continue
    }
    const item = applyAnswerOverride(rawItem)
    const questionId = await upsertQuestion({
      questionKey,
      paperId,
      year: source.year || 2026,
      subjectKey: subject.key,
      subjectName: subject.name,
      questionNumber: questionNumberValue(item.number),
      questionType: item.type,
      difficulty: null,
      quality: 'review',
      prompt: item.prompt,
      answer: null,
      solution: [],
      flags: item.flags,
      sourceType: 'real-ocr',
      metadata: {
        averageScore: item.averageScore,
        lines: item.lines,
      },
    })
    await replaceTags(questionId, [
      { tagType: 'quality', tag: 'review' },
      { tagType: 'question_type', tag: item.type },
      ...(item.flags || []).map(flag => ({ tagType: 'flag', tag: flag })),
    ])
    questions += 1
  }
  return { papers: 1, questions, skippedFragments }
}

async function seedAuditOcrQuestions(auditOcr) {
  let papers = 0
  let questions = 0
  let skippedFragments = 0
  let skippedAnswerSources = 0
  for (const file of auditOcr.files || []) {
    if (isOcrAnswerSourceFile(file)) {
      for (const rawItem of file.questions || []) {
        const questionKey = rawItem.id || hashKey('audit_ocr_question', [file.year, file.subject, file.source, rawItem.number, rawItem.prompt])
        await deleteQuestionByKey(questionKey)
        skippedAnswerSources += 1
      }
      continue
    }

    const paperId = await upsertPaper({
      paperKey: hashKey('audit_ocr_paper', [file.year, file.subject, file.source, file.relativePath]),
      year: file.year || 2026,
      subjectKey: file.subject,
      subjectName: file.subjectName,
      paperName: file.source,
      paperKind: 'real-ocr',
      status: 'ocr-needs-review',
      metadata: {
        relativePath: file.relativePath,
        role: file.role,
        pages: file.pages,
        lines: file.lines,
      },
    })
    papers += 1

    for (const rawItem of file.questions || []) {
      const questionKey = rawItem.id || hashKey('audit_ocr_question', [file.year, file.subject, file.source, rawItem.number, rawItem.prompt])
      if (!shouldImportExtractedQuestion(rawItem)) {
        await deleteQuestionByKey(questionKey)
        skippedFragments += 1
        continue
      }
      const item = applyAnswerOverride(rawItem)
      const questionId = await upsertQuestion({
        questionKey,
        paperId,
        year: file.year || 2026,
        subjectKey: file.subject,
        subjectName: file.subjectName,
        questionNumber: questionNumberValue(item.number),
        questionType: item.questionType || null,
        difficulty: null,
        quality: 'review',
        prompt: item.prompt,
        answer: item.answer || null,
        solution: item.solution || [],
        flags: item.flags || [],
        sourceType: 'real-ocr',
        metadata: {
          source: file.source,
          relativePath: file.relativePath,
          averageScore: item.averageScore,
        },
      })
      await replaceTags(questionId, [
        { tagType: 'quality', tag: 'review' },
        item.questionType ? { tagType: 'question_type', tag: item.questionType } : null,
        ...(item.flags || []).map(flag => ({ tagType: 'flag', tag: flag })),
      ])
      questions += 1
    }
  }
  return { papers, questions, skippedFragments, skippedAnswerSources }
}

async function seedPracticeQuestions() {
  const paperIds = new Map()
  let questions = 0
  for (const item of practiceQuestions) {
    const subject = subjects.find(candidate => candidate.key === item.subject) || { key: item.subject, name: item.subject }
    if (!paperIds.has(subject.key)) {
      paperIds.set(subject.key, await upsertPaper({
        paperKey: `practice:${subject.key}`,
        year: item.year || null,
        subjectKey: subject.key,
        subjectName: subject.name,
        paperName: `${subject.name} 扩展训练与 AI 迁移题`,
        paperKind: 'practice',
        status: 'generated',
        metadata: { sourceType: 'AI 出题基因迁移题' },
      }))
    }
    const questionId = await upsertQuestion({
      questionKey: item.id || hashKey('practice_question', [item.subject, item.title, item.prompt]),
      paperId: paperIds.get(subject.key),
      year: item.year || null,
      subjectKey: subject.key,
      subjectName: subject.name,
      questionNumber: null,
      questionType: item.title,
      difficulty: item.difficulty,
      quality: 'generated',
      prompt: item.prompt,
      answer: item.answer,
      solution: item.solution,
      flags: [],
      sourceType: 'ai-practice',
      metadata: {
        sourceType: item.sourceType,
        title: item.title,
      },
    })
    await replaceTags(questionId, [
      { tagType: 'difficulty', tag: item.difficulty },
      { tagType: 'source_type', tag: item.sourceType },
    ])
    questions += 1
  }
  return { papers: paperIds.size, questions }
}

async function seedTrendNotes() {
  await query('DELETE FROM gaokao_trend_notes')
  let count = 0
  for (const subject of subjects) {
    await query(`
      INSERT INTO gaokao_trend_notes (subject_key, title, body, source_name, metadata)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      subject.key,
      `${subject.name}命题趋势`,
      subject.trend || '',
      'src/data/jiangsu-gaokao.js',
      asJson({ advice: subject.advice, highFrequency: subject.highFrequency, easyMistakes: subject.easyMistakes }, {}),
    ])
    count += 1
  }
  for (const pattern of genePatterns) {
    await query(`
      INSERT INTO gaokao_trend_notes (subject_key, title, body, source_name, metadata)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      pattern.title?.includes('数学') ? 'math' : null,
      pattern.title,
      (pattern.points || []).join('\n'),
      'gaokao-question-gene',
      asJson(pattern, {}),
    ])
    count += 1
  }
  for (const item of coverage) {
    await query(`
      INSERT INTO gaokao_trend_notes (title, body, source_name, metadata)
      VALUES ($1,$2,$3,$4)
    `, [
      item.label,
      item.value,
      '本地资料覆盖摘要',
      asJson(item, {}),
    ])
    count += 1
  }
  return count
}

async function main() {
  const index = await loadJson('jiangsu-gaokao-index.json')
  const extracted = await loadJson('jiangsu-gaokao-extracted.json')
  const docx2026 = await loadJson('gaokao-2026-docx-extracted.json')
  const pdfText2026 = await loadJson('gaokao-2026-pdf-text-extracted.json')
  const auditOcr2026 = await loadJson('gaokao-2026-ocr-extracted.json')
  const residual2026 = await loadJson('gaokao-2026-residual-extracted.json')
  const answerOverrides = await loadJson('gaokao-2026-answer-overrides.json')
  const ocr = await loadJson('jiangsu-gaokao-ocr.json')
  loadAnswerOverrides(answerOverrides)

  await ensureSchema()
  await query('BEGIN')
  try {
    await seedSubjectProfiles()
    const sourceCount = await seedStaticSources(index, extracted, docx2026, pdfText2026, auditOcr2026, residual2026, answerOverrides, ocr)
    const indexPaperCount = await seedIndexPapers(index)
    const overviewPaperCount = await seedYearOverviewPapers()
    const extractedResult = await seedExtractedQuestions(extracted)
    const docx2026Result = await seedExtractedQuestions(docx2026)
    const pdfText2026Result = await seedExtractedQuestions(pdfText2026)
    const auditOcr2026Result = await seedAuditOcrQuestions(auditOcr2026)
    const residual2026Result = await seedExtractedQuestions(residual2026)
    const ocrResult = await seedOcrQuestions(ocr)
    const practiceResult = await seedPracticeQuestions()
    const trendNoteCount = await seedTrendNotes()

    const summary = {
      subjects: subjects.length,
      sources: sourceCount,
      papers: indexPaperCount + overviewPaperCount + extractedResult.papers + docx2026Result.papers + pdfText2026Result.papers + auditOcr2026Result.papers + residual2026Result.papers + ocrResult.papers + practiceResult.papers,
      questions: extractedResult.questions + docx2026Result.questions + pdfText2026Result.questions + auditOcr2026Result.questions + residual2026Result.questions + ocrResult.questions + practiceResult.questions,
      extractedQuestions: extractedResult.questions,
      docx2026Questions: docx2026Result.questions,
      pdfText2026Questions: pdfText2026Result.questions,
      auditOcr2026Questions: auditOcr2026Result.questions,
      residual2026Questions: residual2026Result.questions,
      skippedExtractionFragments: (extractedResult.skippedFragments || 0) + (docx2026Result.skippedFragments || 0) + (pdfText2026Result.skippedFragments || 0) + (auditOcr2026Result.skippedFragments || 0) + (residual2026Result.skippedFragments || 0) + (ocrResult.skippedFragments || 0),
      docx2026SkippedFragments: docx2026Result.skippedFragments || 0,
      pdfText2026SkippedFragments: pdfText2026Result.skippedFragments || 0,
      auditOcr2026SkippedFragments: auditOcr2026Result.skippedFragments || 0,
      auditOcr2026SkippedAnswerSources: auditOcr2026Result.skippedAnswerSources || 0,
      residual2026SkippedFragments: residual2026Result.skippedFragments || 0,
      ocrSkippedFragments: ocrResult.skippedFragments || 0,
      answerOverrides: answerOverrides.summary?.overrides || 0,
      missingAfterAnswerOverrides: answerOverrides.summary?.missingAfterOverrides ?? null,
      ocrQuestions: ocrResult.questions,
      practiceQuestions: practiceResult.questions,
      trendNotes: trendNoteCount,
      indexTotals: index.totals,
      importedAt: new Date().toISOString(),
    }
    await query(`
      INSERT INTO gaokao_import_runs (import_key, summary)
      VALUES ($1,$2)
      ON CONFLICT (import_key) DO UPDATE SET
        summary = EXCLUDED.summary,
        created_at = now()
    `, ['gaokao-local-seed-v1', asJson(summary, {})])
    await query('COMMIT')
    console.log(`Gaokao database seeded: ${JSON.stringify(summary)}`)
  } catch (error) {
    await query('ROLLBACK')
    throw error
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  console.error('Failed to seed Gaokao database:', error)
  process.exit(1)
})
