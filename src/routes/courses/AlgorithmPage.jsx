import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import CoursePage from './CoursePage'
import html from '../../content/algorithm.html?raw'
import { navLinks } from '../../data/algorithm-nav'
import '../../styles/courses/algorithm.css'
import FlashcardSystem from '../../courses/algorithm/FlashcardSystem'
import QuizRenderer from '../../courses/algorithm/QuizRenderer'

export default function AlgorithmPage() {
  const rootsRef = useRef([])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Mount QuizRenderer into each quiz container
      document.querySelectorAll('.quiz-container[data-quiz]').forEach(el => {
        const quizKey = el.dataset.quiz
        if (quizKey) {
          const root = createRoot(el)
          root.render(<QuizRenderer quizKey={quizKey} />)
          rootsRef.current.push(root)
        }
      })

      // Mount FlashcardSystem into the flashcard grid
      const flashcardGrid = document.getElementById('flashcardGrid')
      if (flashcardGrid) {
        const root = createRoot(flashcardGrid)
        root.render(<FlashcardSystem />)
        rootsRef.current.push(root)
      }
    }, 150)

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
