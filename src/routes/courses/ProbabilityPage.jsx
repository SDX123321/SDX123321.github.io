import CoursePage from './CoursePage'
import html from '../../content/probability.html?raw'
import { navLinks } from '../../data/probability-nav'
import '../../styles/courses/probability.css'

export default function ProbabilityPage() {
  return (
    <CoursePage
      courseKey="probability"
      html={html}
      navLinks={navLinks}
      needsKaTeX={true}
    />
  )
}
