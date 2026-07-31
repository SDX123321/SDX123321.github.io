import type { Course, NavLink } from '../types/course'
import { courseMap } from './courses'

const attach = (id: string, html: string, links: unknown, interactionScript?: string): Course => ({
  ...(courseMap.get(id) as Course),
  html,
  nav: links as NavLink[],
  interactionScript,
})

interface CourseAssets {
  html: string
  links: NavLink[]
  interactionScript?: string
}

const courseLoaders: Record<string, () => Promise<CourseAssets>> = {
  probability: async () => ({
    html: (await import('../content/probability.html?raw')).default,
    links: (await import('./probability-nav.js')).navLinks,
  }),
  os: async () => ({
    html: (await import('../content/os.html?raw')).default,
    links: (await import('./os-nav.js')).navLinks,
    interactionScript: (await import('../../courses/os/main.js?raw')).default,
  }),
  algorithm: async () => ({
    html: (await import('../content/algorithm.html?raw')).default,
    links: (await import('./algorithm-nav.js')).navLinks,
  }),
  dsp: async () => ({
    html: (await import('../content/dsp.html?raw')).default,
    links: (await import('./dsp-nav.js')).navLinks,
    interactionScript: (await import('../../courses/dsp/main.js?raw')).default,
  }),
  marxism: async () => ({
    html: (await import('../content/marxism.html?raw')).default,
    links: (await import('./marxism-nav.js')).navLinks,
  }),
  maogai: async () => ({
    html: (await import('../content/maogai.html?raw')).default,
    links: (await import('./maogai-nav.js')).navLinks,
  }),
  calculus: async () => ({
    html: (await import('../content/calculus.html?raw')).default,
    links: (await import('./calculus-nav.js')).navLinks,
  }),
  signals: async () => ({
    html: (await import('../content/signals.html?raw')).default,
    links: (await import('./signals-nav.js')).navLinks,
  }),
}

export async function loadCourseContent(courseId: string): Promise<Course | undefined> {
  const loader = courseLoaders[courseId]
  if (!loader) return undefined
  const assets = await loader()
  return attach(courseId, assets.html, assets.links, assets.interactionScript)
}
