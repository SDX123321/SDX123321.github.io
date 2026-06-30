import { useState, useEffect, useRef, useCallback } from 'react'
import Turnstile from '../security/Turnstile'

const LS_KEY = 'exam_class_id'
const LS_DELETED = 'exam_deleted'
const LS_TS = 'exam_ts_verified'

function getDeletedExams() {
  try { return JSON.parse(localStorage.getItem(LS_DELETED) || '{}') } catch (e) { return {} }
}
function isDeleted(classId, key) {
  const d = getDeletedExams()
  return d[classId] && d[classId].indexOf(key) !== -1
}
function markDeleted(classId, key) {
  const d = getDeletedExams()
  if (!d[classId]) d[classId] = []
  if (d[classId].indexOf(key) === -1) d[classId].push(key)
  try { localStorage.setItem(LS_DELETED, JSON.stringify(d)) } catch (e) {}
}
function getCourseKey(exam) { return exam.course + '|' + exam.date + '|' + exam.start }

function cleanOldDeleted(classId) {
  const d = getDeletedExams()
  if (!d[classId]) return
  const now = new Date(), kept = []
  d[classId].forEach(k => {
    const parts = k.split('|')
    if (parts.length >= 2 && now - new Date(parts[1]) < 30 * 86400000) kept.push(k)
  })
  if (kept.length === 0) delete d[classId]; else d[classId] = kept
  try { localStorage.setItem(LS_DELETED, JSON.stringify(d)) } catch (e) {}
}

function formatDate(ds) {
  const p = ds.split('-'), m = parseInt(p[1]), d = parseInt(p[2])
  const wd = ['日','一','二','三','四','五','六'][new Date(ds).getDay()]
  return m + '月' + d + '日 周' + wd
}

function getCountdown(iso) {
  const diff = new Date(iso) - new Date()
  if (diff <= 0) return ''
  const days = Math.floor(diff / 86400000), hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时`
  return Math.floor((diff % 3600000) / 60000) + ' 分钟'
}

export default function ExamQuery() {
  const [data, setData] = useState(null)
  const [classId, setClassId] = useState('')
  const [queryId, setQueryId] = useState('')
  const [exams, setExams] = useState([])
  const [deletedCount, setDeletedCount] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [msg, setMsg] = useState(null)
  const [deletedMap, setDeletedMap] = useState(getDeletedExams)
  const [loading, setLoading] = useState(false)
  const [tsVerified, setTsVerified] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_TS)
      if (!raw) return false
      const { exp } = JSON.parse(raw)
      return exp > Date.now()
    } catch { return false }
  })
  const refreshRef = useRef(null)
  const loadedRef = useRef(false)

  const handleTsVerify = useCallback((token) => {
    setTsVerified(true)
    try { localStorage.setItem(LS_TS, JSON.stringify({ exp: Date.now() + 3600000 })) } catch {}
  }, [])
  const handleTsExpire = useCallback(() => { setTsVerified(false) }, [])
  const handleTsError = useCallback(() => { setTsVerified(false) }, [])

  const loadData = useCallback(() => {
    return new Promise(resolve => {
      if (loadedRef.current && data) { resolve(data); return }
      if (window.EXAM_SCHEDULE_DATA && typeof window.EXAM_SCHEDULE_DATA === 'object') {
        loadedRef.current = true; setData(window.EXAM_SCHEDULE_DATA); resolve(window.EXAM_SCHEDULE_DATA); return
      }
      fetch('/files/exam-schedule.json')
        .then(r => r.json()).then(j => { loadedRef.current = true; setData(j); resolve(j) })
        .catch(() => {
          const script = document.createElement('script')
          script.src = '/files/exam-schedule-data.js'
          script.onload = () => { loadedRef.current = true; setData(window.EXAM_SCHEDULE_DATA); resolve(window.EXAM_SCHEDULE_DATA) }
          document.head.appendChild(script)
        })
    })
  }, [data])

  const doQuery = useCallback(async (id) => {
    if (!id || !id.trim()) return
    if (!tsVerified) { setMsg({ text: '请先完成人机验证。', type: 'warn' }); return }
    setLoading(true)
    try {
      const d = await loadData()
      if (!d) { setMsg({ text: '加载考试数据失败，请稍后再试。', type: 'error' }); setLoading(false); return }
      id = id.trim().toUpperCase()

    let targetId = id, examsArr = d[id]
    if (!examsArr) {
      const matches = Object.keys(d).filter(k => k.indexOf(id) !== -1)
      if (matches.length === 1) { targetId = matches[0]; examsArr = d[targetId] }
      else if (matches.length > 1) { setMsg({ text: '多个匹配：' + matches.slice(0, 8).join('、') + '，请输入完整 ID.', type: 'warn' }); return }
      else { setMsg({ text: '未找到班级「' + id + '」的考试安排。', type: 'warn' }); return }
    }

    setQueryId(targetId)
    try { localStorage.setItem(LS_KEY, targetId) } catch (e) {}
    cleanOldDeleted(targetId)

    const now = new Date()
    let delCnt = 0
    const visible = examsArr.filter(e => {
      if (new Date(e.iso) < now) return false
      if (isDeleted(targetId, getCourseKey(e))) { delCnt++; return false }
      return true
    })

    setExams(visible)
    setDeletedCount(delCnt)
    setShowResult(true)
    setMsg(null)
    setDeletedMap(getDeletedExams())

    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => { doQuery(targetId) }, 3600000)
    } catch (e) {
      setMsg({ text: '查询出错：' + (e.message || '未知错误'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [loadData, tsVerified])

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) setClassId(saved)
    else loadData()
    return () => clearInterval(refreshRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-query saved class after Turnstile verification completes
  const autoQueryRef = useRef(false)
  useEffect(() => {
    if (tsVerified && classId && !autoQueryRef.current) {
      autoQueryRef.current = true
      doQuery(classId)
    }
  }, [tsVerified, classId, doQuery])

  const removeExam = (exam, btn) => {
    const card = btn.closest('.exam-card')
    if (!card) return
    const key = getCourseKey(exam)
    markDeleted(queryId, key)
    card.style.transition = 'opacity .25s, transform .25s'
    card.style.opacity = '0'; card.style.transform = 'scale(0.9)'
    setTimeout(() => {
      card.remove()
      const rem = document.querySelectorAll('.exam-card').length
      const countEl = document.querySelector('.exam-count')
      if (countEl) countEl.textContent = rem + ' 门'
      if (rem === 0) { setShowResult(false); setMsg({ text: '所有考试已结束或已清除，切换班级可重新查询。', type: 'warn' }) }
    }, 280)
  }

  const clearQuery = () => {
    try { localStorage.removeItem(LS_KEY) } catch (e) {}
    clearInterval(refreshRef.current)
    setQueryId(''); setExams([]); setShowResult(false); setMsg(null); setClassId('')
    setTimeout(() => document.getElementById('examClassInput')?.focus(), 50)
  }

  const resetDeleted = () => {
    const d = getDeletedExams()
    delete d[queryId]
    try { localStorage.setItem(LS_DELETED, JSON.stringify(d)) } catch (e) {}
    setDeletedMap(d)
    doQuery(queryId)
  }

  return (
    <div className="exam-section">
      <div id="examInput" className="exam-input-wrap" style={{ display: showResult ? 'none' : undefined }}>
        <div className="exam-input-title">📅 查询考试安排</div>
        <div className="exam-input-row">
          <input id="examClassInput" type="text" placeholder="输入班级 ID（如 B220207）"
            value={classId} onChange={e => setClassId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doQuery(classId) }}
            autoComplete="off" spellCheck="false" />
          <button onClick={() => doQuery(classId)} disabled={loading}>
            {loading ? '加载中…' : '查询'}
          </button>
        </div>
        <div className="exam-input-hint">输入班级 ID 即可查看该班所有考试时间、教室和教师信息</div>
        {!tsVerified && (
          <div style={{ marginTop: 12, marginBottom: 4 }}>
            <div style={{ fontSize: '.78rem', color: 'var(--text3)', marginBottom: 6 }}>请先完成安全验证：</div>
            <Turnstile onVerify={handleTsVerify} onError={handleTsError} onExpire={handleTsExpire} />
          </div>
        )}
        {msg && <div className={`exam-msg exam-msg-${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
      </div>

      {showResult && (
        <div className="exam-result">
          <div className="exam-header">
            <div className="exam-title">
              <span className="exam-class-badge">{queryId}</span>
              考试安排
              <span className="exam-count">{exams.length} 门</span>
            </div>
            <div className="exam-header-btns">
              {deletedCount > 0 && <button className="exam-reset" onClick={resetDeleted}>恢复 {deletedCount} 门</button>}
              <button className="exam-switch" onClick={clearQuery}>切换班级</button>
            </div>
          </div>
          {exams.length === 0 ? (
            <div className="exam-msg exam-msg-warn">所有考试已结束或已清除，切换班级可重新查询。</div>
          ) : (
            <>
              <div className="exam-scroll-window">
                <div className="exam-list">
                  {exams.map((ev, j) => {
                    const cd = getCountdown(ev.iso)
                    return (
                      <div className="exam-card" key={j}>
                        <button className="exam-del" onClick={(e) => removeExam(ev, e.target)} title="移除">&times;</button>
                        <div className="exam-card-top">
                          <div className="exam-course">{ev.course}</div>
                          <span className={`exam-type-tag exam-type-${ev.type}`}>{ev.type === 'school' ? '校考' : '院考'}</span>
                        </div>
                        <div className="exam-card-grid">
                          <div className="exam-info"><span className="exam-label">日期</span><span className="exam-value">{formatDate(ev.date)}</span></div>
                          <div className="exam-info"><span className="exam-label">时间</span><span className="exam-value">{ev.start} - {ev.end}</span></div>
                          <div className="exam-info"><span className="exam-label">教室</span><span className="exam-value">{ev.room}</span></div>
                          <div className="exam-info"><span className="exam-label">教师</span><span className="exam-value">{ev.teacher}</span></div>
                        </div>
                        {cd && <div className="exam-countdown">距考试还有 {cd}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
