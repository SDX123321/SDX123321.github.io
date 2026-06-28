import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import CoursePage from './CoursePage'
import html from '../../content/marxism.html?raw'
import '../../styles/courses/marxism.css'
import MarxismStudySystem from '../../courses/marxism/MarxismStudySystem'
import DATA from '../../courses/marxism/marxismData'

// Build sidebar nav links from marxism data
const navLinks = DATA.map(ch => ({
  id: ch.id,
  label: `${ch.icon} ${ch.title}`,
  keywords: '',
}))

export default function MarxismPage() {
  const rootsRef = useRef([])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Mount the study system into the content placeholder
      const contentEl = document.getElementById('content')
      if (contentEl) {
        const mountPoint = document.createElement('div')
        mountPoint.id = 'marxism-study-mount'
        contentEl.appendChild(mountPoint)
        const root = createRoot(mountPoint)
        root.render(<MarxismStudySystem />)
        rootsRef.current.push(root)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      rootsRef.current.forEach(root => { try { root.unmount() } catch (e) {} })
      rootsRef.current = []
    }
  }, [])

  return (
    <CoursePage
      courseKey="marxism"
      html={html}
      navLinks={navLinks}
    />
  )
}
