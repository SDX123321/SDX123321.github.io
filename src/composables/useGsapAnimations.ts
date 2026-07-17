/**
 * useGsapAnimations — 替代 React 的 hooks/useGsapAnimations.js
 * 主页入场动画：Hero 文字 + 滚动触发卡片。
 */
import { ref, onMounted, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useGsapAnimations(totalStudyTime: Ref<number | null>) {
  const containerRef = ref<HTMLElement | null>(null)
  let scrollCtx: ReturnType<typeof gsap.context> | null = null

  onMounted(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    // Hero 入场动画（只跑一次）
    gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('h1', { y: 40, opacity: 0, duration: 0.9 }).from(
        '.subtitle',
        { y: 24, opacity: 0, duration: 0.65 },
        '-=0.45',
      )
    })

    // 滚动触发动画（scoped 到容器）
    scrollCtx = gsap.context(() => {
      const sections: Array<{ sel: string; start: string }> = [
        { sel: '.search-section', start: 'top 90%' },
        { sel: '.exam-section', start: 'top 85%' },
        { sel: '.file-section', start: 'top 88%' },
        { sel: '.comment-section', start: 'top 88%' },
        { sel: '.footer', start: 'top 95%' },
      ]
      sections.forEach(({ sel, start }) => {
        gsap.from(sel, {
          y: 30,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: sel, start },
        })
      })
      gsap.from('.card', {
        y: 50,
        opacity: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.cards', start: 'top 82%' },
      })
    }, containerRef.value ?? undefined)
  })

  // 学习时间徽章出现时的入场动画
  watch(totalStudyTime, (val) => {
    if (!val) return
    const badge = containerRef.value?.querySelector('.study-time-badge')
    if (!badge) return
    gsap.from(badge, { y: 16, opacity: 0, duration: 0.5, ease: 'power2.out' })
  })

  onUnmounted(() => {
    scrollCtx?.revert()
  })

  return containerRef
}
