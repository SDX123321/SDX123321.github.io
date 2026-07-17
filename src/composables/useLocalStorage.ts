/**
 * useLocalStorage — 替代 React 的 hooks/useLocalStorage.js
 * 通用 localStorage 响应式封装，含 JSON 序列化。
 */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [Ref<T>, (value: T | ((prev: T) => T)) => void] {
  const storedValue = ref<T>(
    (() => {
      try {
        const item = localStorage.getItem(key)
        return item ? (JSON.parse(item) as T) : defaultValue
      } catch {
        return defaultValue
      }
    })(),
  ) as Ref<T>

  watch(
    storedValue,
    (val) => {
      try {
        localStorage.setItem(key, JSON.stringify(val))
      } catch {
        /* quota exceeded or private mode */
      }
    },
    { deep: true },
  )

  function setValue(value: T | ((prev: T) => T)) {
    storedValue.value = value instanceof Function ? value(storedValue.value) : value
  }

  return [storedValue, setValue]
}

/** 一次性读取，不具响应性 */
export function readLS<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key)
    return item ? (JSON.parse(item) as T) : defaultValue
  } catch {
    return defaultValue
  }
}

/** 一次性写入 */
export function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded or private mode */
  }
}
