import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Hook for managing knowledge mastery tracking.
 * Replaces mastery.js tracking logic.
 */
export default function useMastery() {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mastery_data') || '{}') } catch (e) { return {} }
  })

  const track = useCallback((pageId, sectionId, isCorrect) => {
    setData(prev => {
      const next = { ...prev }
      if (!next[pageId]) next[pageId] = {}
      if (!next[pageId][sectionId]) next[pageId][sectionId] = { visits: 0, correct: 0, wrong: 0 }
      next[pageId][sectionId].visits++
      if (isCorrect) next[pageId][sectionId].correct++
      else next[pageId][sectionId].wrong++
      try { localStorage.setItem('mastery_data', JSON.stringify(next)) } catch (e) {}
      return next
    })
  }, [])

  return { data, track }
}
