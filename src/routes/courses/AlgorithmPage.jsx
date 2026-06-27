import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import CoursePage from './CoursePage'
import html from '../../content/algorithm.html?raw'
import { navLinks } from '../../data/algorithm-nav'
import '../../styles/courses/algorithm.css'
import FlashcardSystem from '../../courses/algorithm/FlashcardSystem'

export default function AlgorithmPage() {
  const rootsRef = useRef([])

  useEffect(() => {
    // Mount flashcard/quiz system into the quiz placeholder
    const timer = setTimeout(() => {
      const quizContainers = document.querySelectorAll('.quiz-container[data-quiz]')
      if (quizContainers.length > 0) {
        // Find the last quiz container or a dedicated placeholder
        const target = quizContainers[quizContainers.length - 1].parentElement || quizContainers[0].parentElement
        if (target) {
          const mountPoint = document.createElement('div')
          mountPoint.id = 'flashcard-mount'
          target.appendChild(mountPoint)
          const root = createRoot(mountPoint)
          root.render(<FlashcardSystem />)
          rootsRef.current.push(root)
        }
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
      courseKey="algorithm"
      html={html}
      navLinks={navLinks}
      needsKaTeX={true}
    />
  )
}
