import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Renders course HTML content with post-mount processing:
 * - Math rendering (KaTeX for probability, MathJax for DSP)
 * - Quiz event delegation (checkQuiz)
 * - Collapsible section toggling
 * - Scroll spy for sidebar nav highlighting
 */
export default function CourseContent({ html, courseKey, onQuizAnswer }) {
  const containerRef = useRef(null)
  const location = useLocation()

  // ── Math rendering ──
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    // KaTeX (probability, algorithm, calculus)
    if (courseKey === 'probability' || courseKey === 'algorithm' || courseKey === 'calculus') {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(el, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
              { left: '$', right: '$', display: false },
            ],
            throwOnError: false,
          })
        } catch (e) { console.warn('KaTeX error:', e) }
      }
    }

    // MathJax (DSP, Signals)
    if (courseKey === 'dsp' || courseKey === 'signals') {
      if (window.MathJax && window.MathJax.typesetPromise) {
        try {
          window.MathJax.typesetPromise([el]).catch(() => {})
        } catch (e) {}
      }
    }
  }, [html, courseKey])

  // ── Quiz checkQuiz delegation ──
  useEffect(() => {
    // Expose checkQuiz on window for inline onclick handlers in the HTML
    window.checkQuiz = function(btn) {
      if (!btn) return
      const c = btn.closest('.quiz-container')
      if (!c) return
      const correct = parseInt(c.dataset.correct)
      const sel = c.querySelector('input:checked')
      const res = c.querySelector('.quiz-result')
      if (!sel) {
        if (res) { res.textContent = '请先选择答案'; res.className = 'quiz-result quiz-wrong'; res.style.display = 'block' }
        return
      }
      const chosen = parseInt(sel.value)
      if (chosen === correct) {
        if (res) { res.textContent = '✓ 正确！'; res.className = 'quiz-result quiz-correct'; res.style.display = 'block' }
      } else {
        const labels = c.querySelectorAll('.quiz-options label')
        if (res) {
          res.textContent = '✗ 错误，正确答案是 ' + (labels[correct] ? labels[correct].textContent.trim() : '')
          res.className = 'quiz-result quiz-wrong'
          res.style.display = 'block'
        }
      }
      // Notify parent (for wrong-book tracking)
      if (onQuizAnswer) {
        onQuizAnswer({ correct, chosen, container: c })
      }
    }

    // Also handle DSP-style checkQuiz (btn.parentElement instead of btn.closest)
    const origCheckQuiz = window.checkQuiz
    window.checkQuiz = function(btn) {
      origCheckQuiz(btn)
      // DSP uses btn.parentElement as container
      if (btn && !btn.closest('.quiz-container')) {
        const c = btn.parentElement
        if (c && c.dataset.correct !== undefined) {
          const correct = parseInt(c.dataset.correct)
          const sel = c.querySelector('input:checked')
          const res = c.querySelector('.quiz-result')
          if (sel && res) {
            const chosen = parseInt(sel.value)
            if (res.textContent === '') {
              if (chosen === correct) {
                res.textContent = '✓ 正确！'; res.className = 'quiz-result quiz-correct'
              } else {
                const labels = c.querySelectorAll('label')
                res.textContent = '✗ 错误，正确答案是 ' + (labels[correct] ? labels[correct].textContent.trim() : '')
                res.className = 'quiz-result quiz-wrong'
              }
              res.style.display = 'block'
            }
          }
        }
      }
    }

    return () => { delete window.checkQuiz }
  }, [onQuizAnswer])

  // ── Collapsible section toggling ──
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    function handleClick(e) {
      const header = e.target.closest('.section-header, h3.collapsible, h4.collapsible, .chapter-header, .card-header')
      if (!header) return
      e.preventDefault()

      // Toggle collapsed class on parent section
      const section = header.closest('.section')
      if (section) {
        section.classList.toggle('collapsed')
        return
      }

      // Toggle chapter open/close
      if (header.classList.contains('chapter-header')) {
        const chapter = header.closest('.chapter')
        if (chapter) {
          chapter.classList.toggle('open')
          return
        }
      }

      // Toggle card open/close
      if (header.classList.contains('card-header')) {
        const card = header.closest('.card')
        if (card) {
          card.classList.toggle('open')
          return
        }
      }

      // Toggle collapsible content (DSP/algorithm pattern)
      header.classList.toggle('open')
      const content = header.nextElementSibling
      if (content && content.classList.contains('collapsible-content')) {
        content.classList.toggle('show')
      }
    }

    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [html])

  // ── Scroll spy: highlight active nav link ──
  const updateNavHighlight = useCallback(() => {
    if (!containerRef.current) return
    const ids = containerRef.current.querySelectorAll('[id]')
    let currentId = ''
    const offset = 100

    ids.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.top <= offset + 10) currentId = el.id
    })

    document.querySelectorAll('.sidebar a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + currentId)
    })
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', updateNavHighlight, { passive: true })
    updateNavHighlight()
    return () => window.removeEventListener('scroll', updateNavHighlight)
  }, [updateNavHighlight])

  // ── Back to top visibility ──
  useEffect(() => {
    const btn = document.getElementById('backTop')
    if (!btn) return
    const handler = () => {
      btn.style.display = window.scrollY > 300 ? 'flex' : 'none'
    }
    window.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div
      ref={containerRef}
      className="course-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
