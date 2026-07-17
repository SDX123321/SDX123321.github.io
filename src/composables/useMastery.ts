/**
 * useMastery — 替代 React 的 features/mastery/useMastery.js
 * 管理各章节知识点掌握度追踪。
 */
import { ref } from 'vue'

export interface MasteryItem {
  visits: number
  correct: number
  wrong: number
}

export type MasteryData = Record<string, Record<string, MasteryItem>>

export function useMastery() {
  const data = ref<MasteryData>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem('mastery_data') || '{}') as MasteryData
      } catch {
        return {}
      }
    })(),
  )

  function track(pageId: string, sectionId: string, isCorrect: boolean) {
    if (!data.value[pageId]) data.value[pageId] = {}
    if (!data.value[pageId][sectionId]) {
      data.value[pageId][sectionId] = { visits: 0, correct: 0, wrong: 0 }
    }
    data.value[pageId][sectionId].visits++
    if (isCorrect) data.value[pageId][sectionId].correct++
    else data.value[pageId][sectionId].wrong++

    try {
      localStorage.setItem('mastery_data', JSON.stringify(data.value))
    } catch {
      /* quota exceeded */
    }
  }

  return { data, track }
}
