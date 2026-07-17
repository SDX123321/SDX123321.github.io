/**
 * useWrongBook — 替代 React 的 features/wrong-book/useWrongBook.js
 * 管理错题本的响应式状态。
 */
import { ref } from 'vue'
import { KEYS, getLS, setLS } from '../lib/storage'
import { useAuth } from './useAuth'

export interface WrongEntry {
  question: string
  userAnswer: string
  correctAnswer: string
  page?: string
  time: number
  [key: string]: unknown
}

export function useWrongBook() {
  const { syncStudyEvent } = useAuth()
  const wrongs = ref<WrongEntry[]>(getLS(KEYS.WRONG_ANSWERS, []))

  function addWrong(entry: Omit<WrongEntry, 'time'>) {
    const next: WrongEntry[] = [...wrongs.value, { ...entry, time: Date.now() } as WrongEntry]
    wrongs.value = next
    setLS(KEYS.WRONG_ANSWERS, next)
    void syncStudyEvent({
      eventType: 'wrong_added',
      course: entry.page || null,
      pagePath: window.location.pathname,
      objectId: entry.question || null,
      payload: entry,
    })
  }

  function clearAll() {
    wrongs.value = []
    setLS(KEYS.WRONG_ANSWERS, [])
  }

  function exportAsText() {
    let t = '错题本导出 - ' + new Date().toLocaleDateString() + '\n' + '='.repeat(40) + '\n\n'
    wrongs.value.forEach((w, i) => {
      t += `${i + 1}. [${w.page ?? ''}] ${w.question}\n   你的答案: ${w.userAnswer}\n   正确答案: ${w.correctAnswer}\n\n`
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }))
    a.download = '错题本.txt'
    a.click()
  }

  function grouped(): Record<string, WrongEntry[]> {
    const g: Record<string, WrongEntry[]> = {}
    wrongs.value.forEach((w) => {
      const p = w.page || '未知'
      if (!g[p]) g[p] = []
      g[p].push(w)
    })
    return g
  }

  return { wrongs, addWrong, clearAll, exportAsText, grouped }
}
