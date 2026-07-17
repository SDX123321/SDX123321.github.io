<script setup lang="ts">
/**
 * MeteorShower — 替代 React 的 features/ux/MeteorShower.jsx
 * 用户空闲时在背景画布上绘制流星雨效果。
 */
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const METEOR_COUNT = 3
const METEOR_COLOR = 'rgba(180, 200, 255, 0.7)'
const METEOR_TAIL = 'rgba(180, 200, 255, 0)'

interface Meteor {
  x: number
  y: number
  len: number
  speed: number
  vx: number
  vy: number
  alpha: number
  life: number
  maxLife: number
}

function spawnMeteor(w: number, h: number): Meteor {
  const speed = 1.5 + Math.random() * 2
  const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3
  return {
    x: Math.random() * w * 1.2 - w * 0.1,
    y: -20 - Math.random() * h * 0.3,
    len: 50 + Math.random() * 70,
    speed,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: 0,
    life: 0,
    maxLife: 120 + Math.random() * 80,
  }
}

let raf = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null
let isIdle = false

onMounted(() => {
  const canvas = canvasRef.value!
  const ctx = canvas.getContext('2d')!
  let meteors: Meteor[] = []

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  function resetIdle() {
    isIdle = false
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      isIdle = true
    }, 3000)
  }
  window.addEventListener('mousemove', resetIdle)
  window.addEventListener('scroll', resetIdle)
  window.addEventListener('keydown', resetIdle)
  resetIdle()

  function draw() {
    raf = requestAnimationFrame(draw)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (isIdle && meteors.length < METEOR_COUNT && Math.random() < 0.012) {
      meteors.push(spawnMeteor(canvas.width, canvas.height))
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]
      m.life++
      m.x += m.vx
      m.y += m.vy
      if (m.life < 20) m.alpha = m.life / 20
      else if (m.life > m.maxLife - 20) m.alpha = (m.maxLife - m.life) / 20
      else m.alpha = 1
      if (m.life > m.maxLife || m.x > canvas.width + 100 || m.y > canvas.height + 100) {
        meteors.splice(i, 1)
        continue
      }
      const tailX = m.x - (m.vx * m.len) / m.speed
      const tailY = m.y - (m.vy * m.len) / m.speed
      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y)
      grad.addColorStop(0, METEOR_TAIL)
      grad.addColorStop(1, METEOR_COLOR)
      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(m.x, m.y)
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.2
      ctx.globalAlpha = m.alpha * 0.55
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2)
      ctx.fillStyle = METEOR_COLOR
      ctx.globalAlpha = m.alpha * 0.7
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  raf = requestAnimationFrame(draw)

  onUnmounted(() => {
    cancelAnimationFrame(raf)
    if (idleTimer) clearTimeout(idleTimer)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', resetIdle)
    window.removeEventListener('scroll', resetIdle)
    window.removeEventListener('keydown', resetIdle)
  })
})
</script>

<template>
  <canvas ref="canvasRef" class="meteor-canvas" />
</template>

<style scoped>
.meteor-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
</style>
