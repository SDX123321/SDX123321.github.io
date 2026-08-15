<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationFrameId: number | null = null

interface Particle {
  x: number
  y: number
  originX: number
  originY: number
  vx: number
  vy: number
  size: number
  alpha: number
  baseAlpha: number
  phase: number
}

const particles: Particle[] = []
let mouseX = -1000
let mouseY = -1000
let width = 0
let height = 0

function initParticles() {
  particles.length = 0
  const cols = Math.floor(width / 32)
  const rows = Math.floor(height / 32)
  const count = Math.min(cols * rows, 250)

  for (let i = 0; i < count; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const baseAlpha = Math.random() * 0.35 + 0.1
    particles.push({
      x,
      y,
      originX: x,
      originY: y,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 1,
      alpha: baseAlpha,
      baseAlpha,
      phase: Math.random() * Math.PI * 2,
    })
  }
}

function handleResize() {
  if (!canvasRef.value) return
  width = window.innerWidth
  height = window.innerHeight
  canvasRef.value.width = width * window.devicePixelRatio
  canvasRef.value.height = height * window.devicePixelRatio
  const ctx = canvasRef.value.getContext('2d')
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  }
  initParticles()
}

function handleMouseMove(e: MouseEvent) {
  mouseX = e.clientX
  mouseY = e.clientY
  document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`)
  document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`)
}

function render(time: number) {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)

  const t = time * 0.001

  // Draw subtle geometric web connections
  ctx.lineWidth = 0.5
  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i]

    // Wave motion
    p1.x += p1.vx + Math.sin(t + p1.phase) * 0.2
    p1.y += p1.vy + Math.cos(t * 0.8 + p1.phase) * 0.2

    // Screen wrapping
    if (p1.x < 0) p1.x = width
    if (p1.x > width) p1.x = 0
    if (p1.y < 0) p1.y = height
    if (p1.y > height) p1.y = 0

    // Cursor interaction (repulsion/glow)
    const dx = mouseX - p1.x
    const dy = mouseY - p1.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const maxDist = 180

    if (dist < maxDist) {
      const force = (1 - dist / maxDist) * 25
      const angle = Math.atan2(dy, dx)
      p1.x -= Math.cos(angle) * force * 0.05
      p1.y -= Math.sin(angle) * force * 0.05
      p1.alpha = p1.baseAlpha + (1 - dist / maxDist) * 0.5
    } else {
      p1.alpha += (p1.baseAlpha - p1.alpha) * 0.05
    }

    // Render node
    ctx.fillStyle = `rgba(99, 102, 241, ${p1.alpha})`
    ctx.beginPath()
    ctx.arc(p1.x, p1.y, p1.size, 0, Math.PI * 2)
    ctx.fill()

    // Connect close neighbors
    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j]
      const pdx = p1.x - p2.x
      const pdy = p1.y - p2.y
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy)

      if (pdist < 110) {
        const lineAlpha = (1 - pdist / 110) * 0.12 * p1.alpha
        ctx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }
  }

  animationFrameId = requestAnimationFrame(render)
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
  window.addEventListener('mousemove', handleMouseMove)
  animationFrameId = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<template>
  <canvas ref="canvasRef" class="interactive-canvas" aria-hidden="true" />
</template>

<style scoped>
.interactive-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
  opacity: 0.85;
}
</style>
