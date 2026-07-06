import { useState, useCallback } from 'react'
import { KEYS, getLS, setLS } from '../../lib/storage'
import { useAuth } from '../account/AuthContext'

/**
 * Hook for managing wrong quiz answers.
 * Replaces wrong-book.js tracking logic.
 */
export default function useWrongBook() {
  const { syncStudyEvent } = useAuth()
  const [wrongs, setWrongs] = useState(() => getLS(KEYS.WRONG_ANSWERS, []))

  const addWrong = useCallback((entry) => {
    setWrongs(prev => {
      const next = [...prev, { ...entry, time: Date.now() }]
      setLS(KEYS.WRONG_ANSWERS, next)
      return next
    })
    syncStudyEvent({
      eventType: 'wrong_added',
      course: entry.page || null,
      pagePath: window.location.pathname,
      objectId: entry.question || null,
      payload: entry,
    })
  }, [syncStudyEvent])

  const clearAll = useCallback(() => {
    setWrongs([])
    setLS(KEYS.WRONG_ANSWERS, [])
  }, [])

  const exportAsText = useCallback(() => {
    let t = '错题本导出 - ' + new Date().toLocaleDateString() + '\n' + '='.repeat(40) + '\n\n'
    wrongs.forEach((w, i) => {
      t += (i + 1) + '. [' + w.page + '] ' + w.question + '\n   你的答案: ' + w.userAnswer + '\n   正确答案: ' + w.correctAnswer + '\n\n'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }))
    a.download = '错题本.txt'
    a.click()
  }, [wrongs])

  const grouped = useCallback(() => {
    const g = {}
    wrongs.forEach(w => {
      const p = w.page || '未知'
      if (!g[p]) g[p] = []
      g[p].push(w)
    })
    return g
  }, [wrongs])

  return { wrongs, addWrong, clearAll, exportAsText, grouped }
}
