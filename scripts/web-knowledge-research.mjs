import crypto from 'node:crypto'
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import pg from 'pg'

const value = (name) => {
  const i = process.argv.indexOf(name)
  return i < 0 ? null : process.argv[i + 1]
}
const runId = value('--run-id'),
  domainId = value('--domain-id'),
  subject = value('--subject')
if (!runId || !domainId || !subject) throw new Error('missing research arguments')
const allowed = [
  'gov.cn',
  'moe.gov.cn',
  'neea.edu.cn',
  'pep.com.cn',
  'wikipedia.org',
  'baike.baidu.com',
  'edu.cn',
]
const chrome =
  process.env.CHROME_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((file) => fs.existsSync(file))
if (!chrome) throw new Error('Chrome or Edge executable was not found')
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
})
const subjectName =
  {
    math: '数学',
    physics: '物理',
    chemistry: '化学',
    biology: '生物',
    chinese: '语文',
    english: '英语',
    history: '历史',
    geography: '地理',
    politics: '思想政治',
  }[subject] || subject
const queries = [
  `${subjectName} 高中 课程标准 知识点`,
  `${subjectName} 基础知识 先修关系`,
  `${subjectName} 核心概念 综合应用 提高`,
]
const browser = await chromium.launch({ headless: true, executablePath: chrome })
let visited = 0,
  evidence = 0
try {
  await pool.query(
    "UPDATE web_research_runs SET status='running',progress=5,query_count=$2,updated_at=now() WHERE id=$1",
    [runId, queries.length],
  )
  const page = await browser.newPage({ userAgent: 'ExamReviewKnowledgeResearch/1.0' })
  for (let qi = 0; qi < queries.length; qi++) {
    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(queries[qi])}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    const links = await page
      .locator('li.b_algo h2 a')
      .evaluateAll((as) => as.slice(0, 8).map((a) => ({ url: a.href, title: a.textContent || '' })))
    for (const link of links) {
      let host
      try {
        host = new URL(link.url).hostname.toLowerCase()
      } catch {
        continue
      }
      if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) continue
      try {
        await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        visited++
        const text = (await page.locator('main,article,body').first().innerText({ timeout: 5000 }))
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 6000)
        if (text.length < 200) continue
        const excerpt = text.slice(0, 700),
          hash = crypto.createHash('sha256').update(text).digest('hex')
        const response = await fetch(
          `${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/chat`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: process.env.CHAT_MODEL || 'qwen3:4b',
              stream: false,
              think: false,
              format: 'json',
              messages: [
                {
                  role: 'user',
                  content: `从以下${subjectName}权威资料提炼一个规范知识点及其关系。仅返回JSON：{"concept":"","relation":"prerequisite|part_of|related|derived_from|contrasts_with|applies_to","targetConcept":"","confidence":0到1}。资料：${excerpt}`,
                },
              ],
            }),
          },
        )
        const data = await response.json()
        let concept = {}
        try {
          concept = JSON.parse(data.message?.content || '{}')
        } catch {}
        const confidence = Number(concept.confidence) || 0,
          status = 'candidate'
        await pool.query(
          `INSERT INTO web_knowledge_evidence(run_id,domain_id,subject,url,title,host,excerpt,content_hash,concept,relation,target_concept,confidence,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
          [
            runId,
            domainId,
            subject,
            link.url,
            link.title.slice(0, 300),
            host,
            excerpt,
            hash,
            concept.concept || null,
            concept.relation || null,
            concept.targetConcept || null,
            confidence,
            status,
          ],
        )
        evidence++
        await pool.query(
          `UPDATE web_knowledge_evidence e SET status='accepted'
           WHERE e.run_id=$1 AND e.concept=$2 AND e.confidence>=.86 AND
             (e.host LIKE '%.gov.cn' OR e.host='gov.cn' OR e.host LIKE '%.moe.gov.cn' OR
              (SELECT COUNT(DISTINCT x.host) FROM web_knowledge_evidence x WHERE x.run_id=e.run_id AND x.concept=e.concept AND x.confidence>=.86)>=2)`,
          [runId, concept.concept || null],
        )
      } catch {}
      await new Promise((r) => setTimeout(r, 800))
    }
    await pool.query(
      'UPDATE web_research_runs SET progress=$2,visited_count=$3,evidence_count=$4,updated_at=now() WHERE id=$1',
      [runId, 20 + Math.round(((qi + 1) / queries.length) * 75), visited, evidence],
    )
  }
  await pool.query(
    "UPDATE web_research_runs SET status='completed',progress=100,visited_count=$2,evidence_count=$3,updated_at=now() WHERE id=$1",
    [runId, visited, evidence],
  )
} finally {
  await browser.close()
  await pool.end()
}
