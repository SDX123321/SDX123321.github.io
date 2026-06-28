import { useEffect, useRef } from 'react'

const COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171']
const PARTICLE_COUNT = 18
const GRAVITY = 0.06

function createParticle(x, y) {
  const angle = Math.random() * Math.PI * 2
  const speed = 1.5 + Math.random() * 2.5
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 1.5 + Math.random() * 1.5,
    life: 0,
    maxLife: 40 + Math.random() * 20,
  }
}

export default function FireworkCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf, particles = []

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function onClick(e) {
      const card = e.target.closest('.card')
      if (!card) return
      const cx = e.clientX
      const cy = e.clientY
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(createParticle(cx, cy))
      }
    }
    document.addEventListener('click', onClick)

    function draw() {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

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

        if (p.life > p.maxLife) { particles.splice(i, 1); continue }

        // Outer glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha * 0.15
        ctx.fill()

        // Core
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha * 0.85
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('click', onClick)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  )
}
