import CoursePage from './CoursePage'
import html from '../../content/os.html?raw'
import { navLinks } from '../../data/os-nav'
import '../../styles/courses/os.css'

export default function OsPage() {
  return (
    <CoursePage
      courseKey="os"
      html={html}
      navLinks={navLinks}
    />
  )
}
