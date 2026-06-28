import CoursePage from './CoursePage'
import html from '../../content/signals.html?raw'
import { navLinks } from '../../data/signals-nav'
import '../../styles/courses/signals.css'

export default function SignalsPage() {
  return (
    <CoursePage
      courseKey="signals"
      html={html}
      navLinks={navLinks}
      needsMathJax={true}
    />
  )
}
