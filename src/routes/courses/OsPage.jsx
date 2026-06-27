import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import CoursePage from './CoursePage'
import html from '../../content/os.html?raw'
import { navLinks } from '../../data/os-nav'
import '../../styles/courses/os.css'
import SchedulingSimulator from '../../courses/os/SchedulingSimulator'
import PageReplacementSimulator from '../../courses/os/PageReplacementSimulator'
import BankerAlgorithm from '../../courses/os/BankerAlgorithm'
import DiskScheduling from '../../courses/os/DiskScheduling'

const SIMULATOR_MAP = [
  { id: 'schedResult', Component: SchedulingSimulator },
  { id: 'pageResult', Component: PageReplacementSimulator },
  { id: 'bankerResult', Component: BankerAlgorithm },
  { id: 'diskResult', Component: DiskScheduling },
]

export default function OsPage() {
  const rootsRef = useRef([])

  useEffect(() => {
    // Mount React simulators into placeholder divs after content renders
    const timer = setTimeout(() => {
      SIMULATOR_MAP.forEach(({ id, Component }) => {
        const el = document.getElementById(id)
        if (el) {
          const root = createRoot(el)
          root.render(<Component />)
          rootsRef.current.push(root)
        }
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      rootsRef.current.forEach(root => { try { root.unmount() } catch (e) {} })
      rootsRef.current = []
    }
  }, [])

  return (
    <CoursePage
      courseKey="os"
      html={html}
      navLinks={navLinks}
    />
  )
}
