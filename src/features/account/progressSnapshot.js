function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function countTruthyValues(value) {
  if (!value || typeof value !== 'object') return 0
  return Object.values(value).filter(Boolean).length
}

function sumDwellSeconds() {
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('dwell_')) continue
    const value = readJson(key, {})
    if (typeof value === 'number') total += value
    if (value && typeof value === 'object') {
      Object.values(value).forEach(item => {
        if (typeof item === 'number') total += item
      })
    }
  }
  return Math.max(0, Math.round(total))
}

function countPrefixDone(prefix) {
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(prefix)) continue
    total += countTruthyValues(readJson(key, {}))
  }
  return total
}

function countScrollPositions() {
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith('scroll_')) total += 1
  }
  return total
}

function collectRecentPaths() {
  const paths = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith('scroll_')) continue
    paths.push(key.replace(/^scroll_/, '/').replace(/_/g, '/'))
  }
  return paths.slice(-10).reverse()
}

function countMasteryItems() {
  const data = readJson('mastery_data', {})
  let total = 0
  Object.values(data).forEach(page => {
    if (page && typeof page === 'object') total += Object.keys(page).length
  })
  return total
}

export function collectLocalProgressSnapshot() {
  const wrongAnswers = readJson('wrong_answers', [])
  const gaokaoDone = readJson('gaokao_jiangsu_done', [])
  const snapshot = {
    totalStudySeconds: sumDwellSeconds(),
    chapterDoneCount: countPrefixDone('chapter_done_'),
    wrongCount: Array.isArray(wrongAnswers) ? wrongAnswers.length : 0,
    practiceDoneCount: Array.isArray(gaokaoDone) ? gaokaoDone.length : 0,
    masteryItemCount: countMasteryItems(),
    scrollPositionCount: countScrollPositions(),
    recentPaths: collectRecentPaths(),
  }

  const importId = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))
    .replace(/=+$/g, '')
    .slice(0, 96)

  return { importId: `local-${importId}`, snapshot }
}

export function formatStudyTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}
