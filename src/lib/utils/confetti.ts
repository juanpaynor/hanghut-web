const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa',
  '#ec4899', '#f43f5e',
  '#f59e0b', '#fbbf24',
  '#10b981', '#34d399',
  '#3b82f6', '#60a5fa',
  '#ffffff', '#e2e8f0',
]

type Shape = 'rect' | 'circle' | 'triangle'

interface Piece {
  x: number; y: number
  vx: number; vy: number
  r: number
  color: string
  rot: number; rv: number
  shape: Shape
}

export function fireConfetti(originX?: number, originY?: number) {
  if (typeof window === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const ox = originX ?? canvas.width / 2
  const oy = originY ?? canvas.height * 0.45

  const pieces: Piece[] = Array.from({ length: 130 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 9 + 4
    const shapes: Shape[] = ['rect', 'circle', 'triangle']
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 5 - 2,
      r: Math.random() * 5 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      rv: (Math.random() - 0.5) * 0.28,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }
  })

  let globalAlpha = 1
  let frame: number

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    globalAlpha -= 0.01
    if (globalAlpha <= 0) {
      cancelAnimationFrame(frame)
      canvas.remove()
      return
    }

    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.18 // gravity
      p.vx *= 0.992
      p.rot += p.rv

      const a = globalAlpha * (p.y < canvas.height + 40 ? 1 : 0)
      if (a <= 0) continue

      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color

      switch (p.shape) {
        case 'rect':
          ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9)
          break
        case 'circle':
          ctx.beginPath()
          ctx.arc(0, 0, p.r * 0.55, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'triangle':
          ctx.beginPath()
          ctx.moveTo(0, -p.r)
          ctx.lineTo(p.r, p.r)
          ctx.lineTo(-p.r, p.r)
          ctx.closePath()
          ctx.fill()
          break
      }
      ctx.restore()
    }

    frame = requestAnimationFrame(draw)
  }

  draw()
}
