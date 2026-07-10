export interface NavLink {
  id: string
  label: string
  keywords?: string
}

export interface Course {
  id: string
  name: string
  shortName: string
  description: string
  accent: string
  softAccent: string
  icon: 'chart' | 'cpu' | 'network' | 'wave' | 'book' | 'sigma' | 'landmark' | 'signal' | 'library'
  tags: string[]
  html?: string
  nav: NavLink[]
  renderer?: 'katex' | 'mathjax'
  interactionScript?: string
  featured?: boolean
}
