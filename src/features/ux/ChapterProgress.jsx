import { useEffect, useState } from 'react'
import { useAuth } from '../account/AuthContext'

export default function ChapterProgress() {
  const { syncStudyEvent } = useAuth()
  const [pageId] = useState(() => {
    const p = window.location.pathname
    return p.replace(/[^a-zA-Z0-9一-鿿]/g, '_').substring(0, 30)
  })

  useEffect(() => {
    const DONE_KEY = 'chapter_done_' + pageId
    const headings = document.querySelectorAll('.main h2, .section h2, main h2')
    if (headings.length < 2) return

    const getDone = () => {
      try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') } catch (e) { return {} }
    }
    const saveDone = (s) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(s)) } catch (e) {} }

    headings.forEach((h2, i) => {
      const key = 'h' + i
      const chk = document.createElement('label')
      chk.className = 'ux-chapter-check'
      chk.innerHTML = '<input type="checkbox" style="width:14px;height:14px;accent-color:var(--success,#2ecc71);cursor:pointer">'
      h2.appendChild(chk)

      const state = getDone()
      chk.querySelector('input').checked = !!state[key]
      if (state[key]) h2.style.opacity = '.5'

      chk.querySelector('input').addEventListener('change', () => {
        const s = getDone()
        s[key] = chk.querySelector('input').checked
        saveDone(s)
        h2.style.opacity = s[key] ? '.5' : '1'
        if (s[key]) {
          syncStudyEvent({
            eventType: 'chapter_done',
            course: pageId,
            pagePath: window.location.pathname,
            objectId: key,
            payload: { heading: h2.textContent.replace(/\s+/g, ' ').trim() },
          })
        }
        updateProgress()
      })
    })

    // Progress bar
    const bar = document.createElement('div')
    bar.className = 'ux-progress-bar'
    bar.innerHTML = '<div class="ux-progress-fill" id="ux-progress-fill" style="width:0%"></div>'
    const label = document.createElement('div')
    label.className = 'ux-progress-label'
    label.id = 'ux-progress-label'
    label.textContent = '0%'
    document.body.appendChild(bar)
    document.body.appendChild(label)

    const updateProgress = () => {
      const s = getDone()
      const total = headings.length
      const done = Object.values(s).filter(Boolean).length
      const pct = Math.round(done / total * 100)
      const fill = document.getElementById('ux-progress-fill')
      const lbl = document.getElementById('ux-progress-label')
      if (fill) fill.style.width = pct + '%'
      if (lbl) lbl.textContent = '📖 ' + done + '/' + total + ' (' + pct + '%)'
    }
    updateProgress()

    return () => {
      bar.remove(); label.remove()
    }
  }, [pageId, syncStudyEvent])

  return null
}
