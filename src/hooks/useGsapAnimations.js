import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function useGsapAnimations(totalStudyTime) {
  const containerRef = useRef(null)

  // ── Hero: title + subtitle entrance (runs once, never reverts) ──
  useGSAP(() => {
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('h1', { y: 40, opacity: 0, duration: 0.9 })
        .from('.subtitle', { y: 24, opacity: 0, duration: 0.65 }, '-=0.45')
    })
  }, { scope: containerRef })

  // ── Scroll-triggered sections ──
  // Runs once on mount only — never re-runs to avoid reverting and losing card visibility.
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const ctx = gsap.context(() => {
      // Search bar
      gsap.from('.search-section', {
        y: 20, opacity: 0, duration: 0.55, ease: 'power2.out',
        scrollTrigger: { trigger: '.search-section', start: 'top 90%' },
      })

      // Exam section
      gsap.from('.exam-section', {
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
        scrollTrigger: { trigger: '.exam-section', start: 'top 85%' },
      })

      // Course cards: staggered entrance via scroll
      gsap.from('.card', {
        y: 50, opacity: 0, duration: 0.7, stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.cards', start: 'top 82%' },
      })

      // File browser section
      gsap.from('.file-section', {
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
        scrollTrigger: { trigger: '.file-section', start: 'top 88%' },
      })

      // Comments section
      gsap.from('.comment-section', {
        y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
        scrollTrigger: { trigger: '.comment-section', start: 'top 88%' },
      })

      // Footer
      gsap.from('.footer', {
        opacity: 0, duration: 0.6, ease: 'power2.out',
        scrollTrigger: { trigger: '.footer', start: 'top 95%' },
      })
    }, containerRef) // scope to container

    return () => ctx.revert()
  }, []) // stable — never re-runs

  // ── Study time badge (appears async, animate separately) ──
  useEffect(() => {
    if (!totalStudyTime) return
    const badge = containerRef.current?.querySelector('.study-time-badge')
    if (!badge) return
    gsap.from(badge, { y: 16, opacity: 0, duration: 0.5, ease: 'power2.out' })
  }, [totalStudyTime, containerRef])

  return containerRef
}
