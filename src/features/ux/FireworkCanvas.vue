<script setup lang="ts">
/**
 * FireworkCanvas — 替代 React 的 features/ux/FireworkCanvas.jsx
 * 点击 .card 元素时触发粒子烟花动画。
 */
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171']
const PARTICLE_COUNT = 18
const GRAVITY = 0.06

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  color: string
  size: number
  life: number
  maxLife: number
}

function createParticle(x: number, y: number): Particle {
  const angle = Math.random() * Math.PI * 2
  const speed = 1.5 + Math.random() * 2.5
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 1.5 + Math.random() * 1.5,
    life: 0,
    maxLife: 40 + Math.random() * 20,
  }
}

let raf = 0
let particles: Particle[] = []

onMounted(() => {
  const canvas = canvasRef.value!
  const ctx = canvas.getContext('2d')!

  // 尊重系统减少动效偏好：直接不启动
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const DPR = Math.min(window.devicePixelRatio || 1, 2)

  function resize() {
    canvas.width = Math.round(window.innerWidth * DPR)
    canvas.height = Math.round(window.innerHeight * DPR)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  let hidden = false
  function onVisibility() {
    hidden = document.hidden
    if (hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (particles.length) {
      // 切回前台时若还有粒子，恢复绘制
      raf = requestAnimationFrame(draw)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  function onClick(e: MouseEvent) {
    if (hidden || !(e.target as HTMLElement).closest('.card')) return
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(e.clientX, e.clientY))
    }
    if (!raf) raf = requestAnimationFrame(draw)
  }
  document.addEventListener('click', onClick)

  function draw() {
    raf = requestAnimationFrame(draw)
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life++
      p.x += p.vx
      p.y += p.vy
      p.vy += GRAVITY
      p.vx *= 0.98
      p.vy *= 0.98
      if (p.life < 6) p.alpha = p.life / 6
      else if (p.life > p.maxLife - 15) p.alpha = (p.maxLife - p.life) / 15
      else p.alpha = 1
      if (p.life > p.maxLife) {
        particles.splice(i, 1)
        continue
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.alpha * 0.15
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.alpha * 0.85
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // 粒子全部消失后停掉 rAF，避免后台空转耗电
    if (!particles.length) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
  raf = requestAnimationFrame(draw)

  onUnmounted(() => {
    cancelAnimationFrame(raf)
    raf = 0
    document.removeEventListener('click', onClick)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', resize)
  })
})
</script>

<template>
  <canvas ref="canvasRef" class="fw-canvas" />
</template>

<style scoped>
.fw-canvas {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}
</style>
