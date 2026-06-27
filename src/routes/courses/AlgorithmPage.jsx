import CoursePage from './CoursePage'
import html from '../../content/algorithm.html?raw'
import { navLinks } from '../../data/algorithm-nav'
import '../../styles/courses/algorithm.css'

export default function AlgorithmPage() {
  return (
    <CoursePage
      courseKey="algorithm"
      html={html}
      navLinks={navLinks}
      needsKaTeX={true}
    />
  )
}
