import { useEffect, useRef } from 'react'

/**
 * Shared IntersectionObserver hook.
 * Used by mastery tracking, chapter stats, and scroll spy.
 *
 * @param {Function} callback - receives (entry, observer) for each intersecting entry
 * @param {Object} options - IntersectionObserver options
 * @param {Element|null} root - root element (default: viewport)
 */
export default function useIntersectionObserver(callback, options = {}) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => callbackRef.current(entry, observer))
      },
      {
        threshold: options.threshold || 0.5,
        rootMargin: options.rootMargin || '0px',
        ...options,
      }
    )

    // Observe elements specified by selector
    if (options.selector) {
      document.querySelectorAll(options.selector).forEach(el => observer.observe(el))
    }

    return () => observer.disconnect()
  }, [options.selector, options.threshold, options.rootMargin]) // eslint-disable-line react-hooks/exhaustive-deps
}
