import CoursePage from './CoursePage'
import html from '../../content/dsp.html?raw'
import { navLinks } from '../../data/dsp-nav'
import '../../styles/courses/dsp.css'

export default function DspPage() {
  return (
    <CoursePage
      courseKey="dsp"
      html={html}
      navLinks={navLinks}
      needsMathJax={true}
    />
  )
}
