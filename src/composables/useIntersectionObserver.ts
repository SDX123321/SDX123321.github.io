/**
 * useIntersectionObserver — 替代 React 的 hooks/useIntersectionObserver.js
 * 共享 IntersectionObserver，用于掌握度追踪、章节统计和滚动监听。
 */
import { onUnmounted } from 'vue'

export interface IntersectionOptions {
  threshold?: number
  rootMargin?: string
  selector?: string
  [key: string]: unknown
}

export function useIntersectionObserver(
  callback: (entry: IntersectionObserverEntry, observer: IntersectionObserver) => void,
  options: IntersectionOptions = {},
) {
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => callback(entry, observer)),
    {
      threshold: options.threshold ?? 0.5,
      rootMargin: options.rootMargin ?? '0px',
    },
  )

  if (options.selector) {
    document.querySelectorAll(options.selector).forEach((el) => observer.observe(el))
  }

  onUnmounted(() => observer.disconnect())

  return observer
}
