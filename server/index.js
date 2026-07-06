import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { ensureSchema, pool, query } from './db.js'

const app = express()
const PORT = Number(process.env.API_PORT || 8787)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:4173'
const SESSION_COOKIE = 'exam_review_session'
const SESSION_DAYS = 30

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const authSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/),
  password: z.string().min(6).max(100),
})

const importSchema = z.object({
  importId: z.string().min(8).max(128),
  snapshot: z.object({
    totalStudySeconds: z.number().int().min(0).default(0),
    chapterDoneCount: z.number().int().min(0).default(0),
    wrongCount: z.number().int().min(0).default(0),
    practiceDoneCount: z.number().int().min(0).default(0),
    masteryItemCount: z.number().int().min(0).default(0),
    scrollPositionCount: z.number().int().min(0).default(0),
    recentPaths: z.array(z.string()).default([]),
  }),
})

const eventSchema = z.object({
  eventType: z.string().min(2).max(64),
  course: z.string().max(64).optional().nullable(),
  subject: z.string().max(64).optional().nullable(),
  pagePath: z.string().max(240).optional().nullable(),
  objectId: z.string().max(160).optional().nullable(),
  payload: z.record(z.any()).default({}),
})

const questionQuerySchema = z.object({
  subject: z.string().max(64).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  quality: z.string().max(64).optional(),
  sourceType: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function sessionExpiry() {
  const expires = new Date()
  expires.setDate(expires.getDate() + SESSION_DAYS)
  return expires
}

function setSessionCookie(res, token, expires) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/',
  })
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = sessionExpiry()
  await query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), expires],
  )
  setSessionCookie(res, token, expires)
}

async function authUser(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (!token) return res.status(401).json({ error: 'not_authenticated' })
  const { rows } = await query(`
    SELECT users.id, users.username, users.created_at, users.last_login_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > now()
  `, [hashToken(token)])
  if (!rows[0]) return res.status(401).json({ error: 'not_authenticated' })
  req.user = rows[0]
  next()
}

async function getStats(userId) {
  const { rows } = await query(`
    SELECT
      total_study_seconds AS "totalStudySeconds",
      chapter_done_count AS "chapterDoneCount",
      wrong_count AS "wrongCount",
      practice_done_count AS "practiceDoneCount",
      mastery_item_count AS "masteryItemCount",
      scroll_position_count AS "scrollPositionCount",
      recent_paths AS "recentPaths",
      current_streak_days AS "currentStreakDays",
      last_activity_at AS "lastActivityAt",
      updated_at AS "updatedAt"
    FROM study_snapshots
    WHERE user_id = $1
  `, [userId])
  return rows[0] || {
    totalStudySeconds: 0,
    chapterDoneCount: 0,
    wrongCount: 0,
    practiceDoneCount: 0,
    masteryItemCount: 0,
    scrollPositionCount: 0,
    recentPaths: [],
    currentStreakDays: 0,
    lastActivityAt: null,
    updatedAt: null,
  }
}

function mergeRecentPaths(existing, incoming) {
  const all = [...incoming, ...existing].filter(Boolean)
  return [...new Set(all)].slice(0, 10)
}

async function upsertSnapshot(userId, snapshot, mode = 'max') {
  const current = await getStats(userId)
  const next = {
    totalStudySeconds: mode === 'add'
      ? current.totalStudySeconds + snapshot.totalStudySeconds
      : Math.max(current.totalStudySeconds, snapshot.totalStudySeconds),
    chapterDoneCount: Math.max(current.chapterDoneCount, snapshot.chapterDoneCount),
    wrongCount: Math.max(current.wrongCount, snapshot.wrongCount),
    practiceDoneCount: Math.max(current.practiceDoneCount, snapshot.practiceDoneCount),
    masteryItemCount: Math.max(current.masteryItemCount, snapshot.masteryItemCount),
    scrollPositionCount: Math.max(current.scrollPositionCount, snapshot.scrollPositionCount),
    recentPaths: mergeRecentPaths(current.recentPaths || [], snapshot.recentPaths || []),
  }
  await query(`
    INSERT INTO study_snapshots (
      user_id, total_study_seconds, chapter_done_count, wrong_count,
      practice_done_count, mastery_item_count, scroll_position_count,
      recent_paths, current_streak_days, last_activity_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,now(),now())
    ON CONFLICT (user_id) DO UPDATE SET
      total_study_seconds = EXCLUDED.total_study_seconds,
      chapter_done_count = EXCLUDED.chapter_done_count,
      wrong_count = EXCLUDED.wrong_count,
      practice_done_count = EXCLUDED.practice_done_count,
      mastery_item_count = EXCLUDED.mastery_item_count,
      scroll_position_count = EXCLUDED.scroll_position_count,
      recent_paths = EXCLUDED.recent_paths,
      current_streak_days = GREATEST(study_snapshots.current_streak_days, 1),
      last_activity_at = now(),
      updated_at = now()
  `, [
    userId,
    next.totalStudySeconds,
    next.chapterDoneCount,
    next.wrongCount,
    next.practiceDoneCount,
    next.masteryItemCount,
    next.scrollPositionCount,
    JSON.stringify(next.recentPaths),
  ])
}

async function incrementSnapshot(userId, field, recentPath) {
  const current = await getStats(userId)
  const recentPaths = mergeRecentPaths(current.recentPaths || [], recentPath ? [recentPath] : [])
  const allowed = new Map([
    ['practice_done_count', 'practice_done_count'],
    ['chapter_done_count', 'chapter_done_count'],
    ['wrong_count', 'wrong_count'],
    ['mastery_item_count', 'mastery_item_count'],
  ])
  const column = allowed.get(field)
  if (!column) return
  await query(`
    INSERT INTO study_snapshots (
      user_id, ${column}, recent_paths, current_streak_days, last_activity_at, updated_at
    )
    VALUES ($1,1,$2,1,now(),now())
    ON CONFLICT (user_id) DO UPDATE SET
      ${column} = study_snapshots.${column} + 1,
      recent_paths = EXCLUDED.recent_paths,
      current_streak_days = GREATEST(study_snapshots.current_streak_days, 1),
      last_activity_at = now(),
      updated_at = now()
  `, [userId, JSON.stringify(recentPaths)])
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/api/gaokao/summary', async (req, res) => {
  const [profiles, papers, questions, bySource, byQuality, lastImport] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM gaokao_subject_profiles'),
    query('SELECT COUNT(*)::int AS count FROM gaokao_papers'),
    query('SELECT COUNT(*)::int AS count FROM gaokao_questions'),
    query(`
      SELECT source_type AS "sourceType", COUNT(*)::int AS count
      FROM gaokao_questions
      GROUP BY source_type
      ORDER BY source_type
    `),
    query(`
      SELECT quality, COUNT(*)::int AS count
      FROM gaokao_questions
      GROUP BY quality
      ORDER BY quality
    `),
    query(`
      SELECT import_key AS "importKey", summary, created_at AS "createdAt"
      FROM gaokao_import_runs
      ORDER BY created_at DESC
      LIMIT 1
    `),
  ])
  res.json({
    subjects: profiles.rows[0]?.count || 0,
    papers: papers.rows[0]?.count || 0,
    questions: questions.rows[0]?.count || 0,
    bySource: bySource.rows,
    byQuality: byQuality.rows,
    lastImport: lastImport.rows[0] || null,
  })
})

app.get('/api/gaokao/subjects', async (req, res) => {
  const { rows } = await query(`
    SELECT
      profile.subject_key AS "subjectKey",
      profile.subject_name AS "subjectName",
      profile.accent,
      profile.icon,
      profile.route,
      profile.trend,
      profile.advice,
      profile.high_frequency AS "highFrequency",
      profile.easy_mistakes AS "easyMistakes",
      COALESCE(paper_counts.count, 0)::int AS "paperCount",
      COALESCE(question_counts.count, 0)::int AS "questionCount"
    FROM gaokao_subject_profiles profile
    LEFT JOIN (
      SELECT subject_key, COUNT(*) AS count
      FROM gaokao_papers
      GROUP BY subject_key
    ) paper_counts ON paper_counts.subject_key = profile.subject_key
    LEFT JOIN (
      SELECT subject_key, COUNT(*) AS count
      FROM gaokao_questions
      GROUP BY subject_key
    ) question_counts ON question_counts.subject_key = profile.subject_key
    ORDER BY profile.subject_key
  `)
  res.json({ subjects: rows })
})

app.get('/api/gaokao/questions', authUser, async (req, res) => {
  const parsed = questionQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const filters = parsed.data
  const where = []
  const params = []
  function addFilter(sql, value) {
    params.push(value)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (filters.subject) addFilter('subject_key = ?', filters.subject)
  if (filters.year) addFilter('year = ?', filters.year)
  if (filters.quality) addFilter('quality = ?', filters.quality)
  if (filters.sourceType) addFilter('source_type = ?', filters.sourceType)
  params.push(filters.limit)
  const limitParam = `$${params.length}`
  const { rows } = await query(`
    SELECT
      id,
      question_key AS "questionKey",
      year,
      subject_key AS "subjectKey",
      subject_name AS "subjectName",
      question_number AS "questionNumber",
      question_type AS "questionType",
      difficulty,
      quality,
      prompt,
      answer,
      solution,
      flags,
      source_type AS "sourceType",
      metadata,
      updated_at AS "updatedAt"
    FROM gaokao_questions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY year NULLS LAST, subject_key, question_number NULLS LAST, updated_at DESC
    LIMIT ${limitParam}
  `, params)
  res.json({ questions: rows })
})

app.post('/api/auth/register', async (req, res) => {
  const parsed = authSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const { username, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const { rows } = await query(
      'INSERT INTO users (username, password_hash, last_login_at) VALUES ($1, $2, now()) RETURNING id, username, created_at, last_login_at',
      [username, passwordHash],
    )
    await createSession(rows[0].id, res)
    res.status(201).json({ user: rows[0] })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'username_exists' })
    throw error
  }
})

app.post('/api/auth/login', async (req, res) => {
  const parsed = authSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const { username, password } = parsed.data
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [username])
  const user = rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
  await createSession(user.id, res)
  res.json({ user: { id: user.id, username: user.username, created_at: user.created_at, last_login_at: new Date() } })
})

app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

app.get('/api/me', authUser, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/me/stats', authUser, async (req, res) => {
  res.json({ stats: await getStats(req.user.id) })
})

app.post('/api/me/import-local', authUser, async (req, res) => {
  const parsed = importSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const { importId, snapshot } = parsed.data
  try {
    await query(
      'INSERT INTO local_imports (user_id, import_hash, summary) VALUES ($1, $2, $3)',
      [req.user.id, importId, JSON.stringify(snapshot)],
    )
  } catch (error) {
    if (error.code === '23505') {
      return res.json({ imported: false, stats: await getStats(req.user.id) })
    }
    throw error
  }
  await query(
    'INSERT INTO study_events (user_id, event_type, payload) VALUES ($1, $2, $3)',
    [req.user.id, 'local_import', JSON.stringify(snapshot)],
  )
  await upsertSnapshot(req.user.id, snapshot)
  res.json({ imported: true, stats: await getStats(req.user.id) })
})

app.post('/api/study/event', authUser, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const event = parsed.data
  await query(`
    INSERT INTO study_events (user_id, event_type, course, subject, page_path, object_id, payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    req.user.id,
    event.eventType,
    event.course || null,
    event.subject || null,
    event.pagePath || null,
    event.objectId || null,
    JSON.stringify(event.payload),
  ])
  if (event.eventType === 'page_dwell') {
    await upsertSnapshot(req.user.id, {
      totalStudySeconds: Number(event.payload.seconds || 0),
      chapterDoneCount: 0,
      wrongCount: 0,
      practiceDoneCount: 0,
      masteryItemCount: 0,
      scrollPositionCount: 0,
      recentPaths: event.pagePath ? [event.pagePath] : [],
    }, 'add')
  } else if (event.eventType === 'practice_done') {
    await incrementSnapshot(req.user.id, 'practice_done_count', event.pagePath)
  } else if (event.eventType === 'chapter_done') {
    await incrementSnapshot(req.user.id, 'chapter_done_count', event.pagePath)
  } else if (event.eventType === 'wrong_added') {
    await incrementSnapshot(req.user.id, 'wrong_count', event.pagePath)
  }
  res.json({ ok: true })
})

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).json({ error: 'server_error' })
})

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Account API listening on http://127.0.0.1:${PORT}`)
    })
  })
  .catch(error => {
    console.error('Failed to start API:', error)
    process.exit(1)
  })

process.on('SIGINT', async () => {
  await pool.end()
  process.exit(0)
})
