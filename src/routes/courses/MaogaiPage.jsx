import CoursePage from './CoursePage'
import html from '../../content/maogai.html?raw'
import { navLinks } from '../../data/maogai-nav'
import '../../styles/courses/calculus.css'

export default function MaogaiPage() {
  return (
    <CoursePage
      courseKey="maogai"
      html={html}
      navLinks={navLinks}
    />
  )
}
