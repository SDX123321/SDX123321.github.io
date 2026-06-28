import CoursePage from './CoursePage'
import html from '../../content/calculus.html?raw'
import { navLinks } from '../../data/calculus-nav'
import '../../styles/courses/calculus.css'

export default function CalculusPage() {
  return (
    <CoursePage
      courseKey="calculus"
      html={html}
      navLinks={navLinks}
      needsKaTeX={true}
    />
  )
}
