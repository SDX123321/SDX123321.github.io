import type { Course, NavLink } from '../types/course'
import { courseMap } from './courses'

export interface CourseContent extends Course {
  stylesheet?: string
}

const chapters = import.meta.glob<string>(['../content/*.html', '!../content/home-legacy.html'], {
  query: '?raw',
  import: 'default',
})
const navigation = import.meta.glob<NavLink[]>(['./*-nav.js', '!./*gaokao-nav.js'], {
  import: 'navLinks',
})
const styles = import.meta.glob<string>(
  '../styles/courses/{probability,os,algorithm,dsp,marxism,calculus,signals}.css',
  { query: '?inline', import: 'default' },
)
const interactions = {
  os: () => import('../../courses/os/main.js?raw').then((module) => module.default),
  dsp: () => import('../../courses/dsp/main.js?raw').then((module) => module.default),
}

export async function loadCourseContent(id: string): Promise<CourseContent | undefined> {
  const course = courseMap.get(id)
  const chapter = chapters[`../content/${id}.html`]
  if (!course || !chapter) return

  const [html, nav, stylesheet, interactionScript] = await Promise.all([
    chapter(),
    navigation[`./${id}-nav.js`]?.(),
    styles[`../styles/courses/${id}.css`]?.(),
    id === 'os' || id === 'dsp' ? interactions[id]() : undefined,
  ])
  return { ...course, html, nav: nav ?? course.nav, stylesheet, interactionScript }
}
