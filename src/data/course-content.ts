import type { Course, NavLink } from '../types/course'
import { courseMap } from './courses'
import probabilityHtml from '../content/probability.html?raw'
import osHtml from '../content/os.html?raw'
import algorithmHtml from '../content/algorithm.html?raw'
import dspHtml from '../content/dsp.html?raw'
import marxismHtml from '../content/marxism.html?raw'
import maogaiHtml from '../content/maogai.html?raw'
import calculusHtml from '../content/calculus.html?raw'
import signalsHtml from '../content/signals.html?raw'
import osInteractions from '../../courses/os/main.js?raw'
import dspInteractions from '../../courses/dsp/main.js?raw'
import { navLinks as probabilityNav } from './probability-nav.js'
import { navLinks as osNav } from './os-nav.js'
import { navLinks as algorithmNav } from './algorithm-nav.js'
import { navLinks as dspNav } from './dsp-nav.js'
import { navLinks as marxismNav } from './marxism-nav.js'
import { navLinks as maogaiNav } from './maogai-nav.js'
import { navLinks as calculusNav } from './calculus-nav.js'
import { navLinks as signalsNav } from './signals-nav.js'

const nav = (links: unknown) => links as NavLink[]
const attach = (id: string, html: string, links: unknown, interactionScript?: string): Course => ({
  ...(courseMap.get(id) as Course),
  html,
  nav: nav(links),
  interactionScript,
})

export const courseContentMap = new Map<string, Course>([
  ['probability', attach('probability', probabilityHtml, probabilityNav)],
  ['os', attach('os', osHtml, osNav, osInteractions)],
  ['algorithm', attach('algorithm', algorithmHtml, algorithmNav)],
  ['dsp', attach('dsp', dspHtml, dspNav, dspInteractions)],
  ['marxism', attach('marxism', marxismHtml, marxismNav)],
  ['maogai', attach('maogai', maogaiHtml, maogaiNav)],
  ['calculus', attach('calculus', calculusHtml, calculusNav)],
  ['signals', attach('signals', signalsHtml, signalsNav)],
])
