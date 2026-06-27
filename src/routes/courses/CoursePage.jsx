import { useEffect, useState } from 'react'
import CourseContent from '../../features/content/CourseContent'
import { loadKaTeX, loadMathJax, loadBusuanzi } from '../../lib/cdnScripts'

/**
 * Generic course page component.
 * Loads the HTML content, CDN scripts, and course-specific CSS.
 *
 * @param {string} courseKey - e.g. 'probability'
 * @param {string} html - raw HTML content string
 * @param {Array} navLinks - sidebar navigation links
 * @param {boolean} needsKaTeX - load KaTeX math renderer
 * @param {boolean} needsMathJax - load MathJax renderer
 * @param {Function} onQuizAnswer - callback for wrong-answer tracking
 */
export default function CoursePage({
  courseKey,
  html,
  navLinks = [],
  needsKaTeX = false,
  needsMathJax = false,
  onQuizAnswer,
}) {
  const [ready, setReady] = useState(!needsKaTeX && !needsMathJax)

  // Load math rendering CDN scripts
  useEffect(() => {
    const promises = []
    if (needsKaTeX) promises.push(loadKaTeX())
    if (needsMathJax) promises.push(loadMathJax())
    promises.push(Promise.resolve(loadBusuanzi()))

    Promise.all(promises).then(() => setReady(true))
  }, [needsKaTeX, needsMathJax])

  // Update sidebar nav links
  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar || !navLinks.length) return

    // Clear existing nav groups (except the "loading" placeholder)
    const existingGroups = sidebar.querySelectorAll('.nav-group')
    existingGroups.forEach(g => g.remove())

    // Group links by prefix (e.g., "ch1-", "ch2-")
    const groups = {}
    navLinks.forEach(link => {
      const match = link.id.match(/^(ch\d+)-/)
      const groupKey = match ? match[1] : 'other'
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push(link)
    })

    // Render nav groups
    Object.entries(groups).forEach(([key, links]) => {
      const group = document.createElement('div')
      group.className = 'nav-group'

      if (key !== 'other') {
        const title = document.createElement('div')
        title.className = 'nav-group-title'
        title.textContent = key.replace('ch', '第') + '章'
        group.appendChild(title)
      }

      links.forEach(link => {
        const a = document.createElement('a')
        a.href = '#' + link.id
        a.textContent = link.label
        a.onclick = (e) => {
          e.preventDefault()
          const target = document.getElementById(link.id)
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          // Close mobile sidebar
          sidebar.classList.remove('open')
        }
        group.appendChild(a)
      })

      sidebar.appendChild(group)
    })

    // Update progress bar on scroll
    const progressFill = document.querySelector('.progress-bar .fill')
    if (progressFill) {
      const handler = () => {
        const h = document.documentElement
        const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100
        progressFill.style.width = pct + '%'
      }
      window.addEventListener('scroll', handler, { passive: true })
      handler()
      return () => window.removeEventListener('scroll', handler)
    }
  }, [navLinks])

  if (!ready) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)' }}>
        <p>加载数学渲染引擎…</p>
      </div>
    )
  }

  return <CourseContent html={html} courseKey={courseKey} onQuizAnswer={onQuizAnswer} />
}
