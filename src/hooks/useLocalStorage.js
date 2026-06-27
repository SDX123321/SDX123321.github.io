import { useState, useCallback } from 'react'

/**
 * Generic localStorage hook with JSON serialization.
 * Replaces the duplicated getLS/setLS pattern across 13 modules.
 *
 * @param {string} key - localStorage key
 * @param {*} defaultValue - default value if key doesn't exist
 * @returns {[value, setValue]} - current value and setter
 */
export default function useLocalStorage(key, defaultValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (e) {
      return defaultValue
    }
  })

  const setValue = useCallback((value) => {
    setStoredValue(prev => {
      const next = value instanceof Function ? value(prev) : value
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch (e) {}
      return next
    })
  }, [key])

  return [storedValue, setValue]
}

/**
 * One-shot read from localStorage (no reactivity).
 * For values that are read once on mount and never change.
 */
export function readLS(key, defaultValue) {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (e) {
    return defaultValue
  }
}

/**
 * One-shot write to localStorage.
 */
export function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {}
}
