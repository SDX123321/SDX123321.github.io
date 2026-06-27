// Marxism page: content is JS-generated, uses static HTML fallback
import CoursePage from './CoursePage'
import html from '../../content/marxism.html?raw'
import '../../styles/courses/marxism.css'

export default function MarxismPage() {
  return (
    <CoursePage
      courseKey="marxism"
      html={html}
      navLinks={[]}
    />
  )
}
