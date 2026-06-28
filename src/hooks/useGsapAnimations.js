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
  // Uses useEffect + gsap.context so we control exactly when things re-init.
  // Cards use ScrollTrigger.batch({ once: true }) — once animated they stay put.
  useEffect(() => {
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

      // Study time badge (only present when totalStudyTime is set)
      const badge = document.querySelector('.study-time-badge')
      if (badge) {
        gsap.from(badge, {
          y: 16, opacity: 0, duration: 0.5, ease: 'power2.out',
          scrollTrigger: { trigger: badge, start: 'top 90%' },
        })
      }

      // Course cards: staggered entrance via batch
      // gsap.set hides them before the ScrollTrigger fires
      gsap.set('.card', { opacity: 0, y: 50 })
      ScrollTrigger.batch('.card', {
        onEnter: (batch) => {
          gsap.to(batch, {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.1,
            ease: 'power3.out', overwrite: true,
          })
        },
        start: 'top 85%',
        once: true,
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
  }, [totalStudyTime])

  return containerRef
}
