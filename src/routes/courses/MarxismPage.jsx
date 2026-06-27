import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import CoursePage from './CoursePage'
import html from '../../content/marxism.html?raw'
import '../../styles/courses/marxism.css'
import MarxismStudySystem from '../../courses/marxism/MarxismStudySystem'

export default function MarxismPage() {
  const rootsRef = useRef([])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Mount the study system into the main content area
      const main = document.querySelector('.main') || document.querySelector('main')
      if (main) {
        const mountPoint = document.createElement('div')
        mountPoint.id = 'marxism-study-mount'
        main.appendChild(mountPoint)
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
      navLinks={[]}
    />
  )
}
