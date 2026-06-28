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

    // Group links by prefix (e.g., "ch1-", "pde-", "int-")
    const GROUP_NAMES = {
      ch1: '第1章', ch2: '第2章', ch3: '第3章', ch4: '第4章', ch5: '第5章', ch6: '第6章', ch7: '第7章', ch8: '第8章',
      ode: '常微分方程 ~5分', pde: '多元微分 ~20分', int: '多元积分 ~38分', complex: '复变函数 ~12分',
      quiz: '自测', exam: '考试范围',
    }
    const groups = {}
    const groupOrder = []
    navLinks.forEach(link => {
      const match = link.id.match(/^((?:ch\d+|ode|pde|int|complex|exam)[\w]*)-/)
      const singleMatch = !match ? link.id.match(/^(ch\d+|ode|pde|int|complex|quiz|exam)/) : null
      const groupKey = match ? match[1] : (singleMatch ? singleMatch[1] : 'other')
      if (!groups[groupKey]) { groups[groupKey] = []; groupOrder.push(groupKey) }
      groups[groupKey].push(link)
    })

    // Render nav groups
    groupOrder.forEach(key => {
      const links = groups[key]
      const group = document.createElement('div')
      group.className = 'nav-group'

      if (key !== 'other') {
        const title = document.createElement('div')
        title.className = 'nav-group-title'
        title.textContent = GROUP_NAMES[key] || key
        group.appendChild(title)
      }

      links.forEach(link => {
        const a = document.createElement('a')
        a.href = '#' + link.id
        // Use innerHTML to preserve HTML tags in labels (e.g. <span class="tag tag-L">必考</span>)
        a.innerHTML = link.label
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
