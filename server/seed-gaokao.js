import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coverage, genePatterns, practiceQuestions, sources, subjects, years } from '../src/data/jiangsu-gaokao.js'
import { ensureSchema, pool, query } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../src/data')

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

async function seedStaticSources(index, extracted, ocr) {
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
    sourceKey: 'local_gaokao_ocr_2026_jiangsu_math',
    name: ocr.source?.filename || '2026 江苏数学 OCR',
    detail: ocr.source?.note,
    status: ocr.source?.status || 'ocr-needs-review',
    sourceType: 'local-ocr',
    relativePath: ocr.source?.relativePath,
    metadata: { generatedAt: ocr.generatedAt, summary: ocr.summary, pages: ocr.pages },
  })
  return count + 3
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
  for (const file of extracted.files || []) {
    const paperId = await upsertPaper({
      paperKey: hashKey('extract_paper', [file.year, file.subject, file.source, file.relativePath]),
      year: file.year,
      subjectKey: file.subject,
      subjectName: file.subjectName,
      paperName: file.source,
      paperKind: 'real-extracted',
      status: file.questions?.some(question => question.quality === 'matched') ? 'matched' : 'review',
      metadata: {
        relativePath: file.relativePath,
        analysisSource: file.analysisSource,
        analysisRelativePath: file.analysisRelativePath,
      },
    })
    papers += 1

    for (const item of file.questions || []) {
      const questionId = await upsertQuestion({
        questionKey: hashKey('extract_question', [file.year, file.subject, file.source, item.number, item.prompt]),
        paperId,
        year: file.year,
        subjectKey: file.subject,
        subjectName: file.subjectName,
        questionNumber: item.number,
        questionType: null,
        difficulty: null,
        quality: item.quality || 'review',
        prompt: item.prompt,
        answer: item.answer,
        solution: item.solution,
        flags: item.flags,
        sourceType: 'real-docx',
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
  return { papers, questions }
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
  for (const item of ocr.questions || []) {
    const questionId = await upsertQuestion({
      questionKey: hashKey('ocr_question', [source.year, source.province, subject.key, item.number, item.prompt]),
      paperId,
      year: source.year || 2026,
      subjectKey: subject.key,
      subjectName: subject.name,
      questionNumber: item.number,
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
  return { papers: 1, questions }
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
  const ocr = await loadJson('jiangsu-gaokao-ocr.json')

  await ensureSchema()
  await query('BEGIN')
  try {
    await seedSubjectProfiles()
    const sourceCount = await seedStaticSources(index, extracted, ocr)
    const indexPaperCount = await seedIndexPapers(index)
    const overviewPaperCount = await seedYearOverviewPapers()
    const extractedResult = await seedExtractedQuestions(extracted)
    const ocrResult = await seedOcrQuestions(ocr)
    const practiceResult = await seedPracticeQuestions()
    const trendNoteCount = await seedTrendNotes()

    const summary = {
      subjects: subjects.length,
      sources: sourceCount,
      papers: indexPaperCount + overviewPaperCount + extractedResult.papers + ocrResult.papers + practiceResult.papers,
      questions: extractedResult.questions + ocrResult.questions + practiceResult.questions,
      extractedQuestions: extractedResult.questions,
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
