'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type BgStyle = 'default' | 'particles' | 'noise' | 'gradient-mesh' | 'parallax' | 'custom-image' | 'cover-blur'
  // Cover-driven grounds. Every event has a cover image (it's required at create
  // time), so the background is built FROM the artwork rather than from an
  // abstract palette — the colours are the poster's own, for free.
  | 'cover-full' | 'spotlight'
  // The one deliberately non-image ground, for invitations and dinners.
  | 'paper'

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [99, 102, 241]
}

/** If the theme color is too dark (brightness < 30), fall back to indigo so effects are visible */
function resolveAccentColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness < 30 ? '#6366f1' : hex
}

// ─── Particles ────────────────────────────────────────────────────────────────
function ParticlesBg({ themeColor }: { themeColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const [r, g, b] = hexToRgb(themeColor)

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    type P = {
      x: number; y: number
      radius: number; baseRadius: number
      vx: number; vy: number
      alpha: number; baseAlpha: number
      pulseOffset: number; pulseSpeed: number
      // 0 = small star, 1 = mid orb, 2 = large glow
      tier: number
    }

    const COUNT = 140
    const CONNECT_DIST = 120

    const pts: P[] = Array.from({ length: COUNT }, () => {
      const tier = Math.random() < 0.55 ? 0 : Math.random() < 0.75 ? 1 : 2
      const baseRadius = tier === 0 ? Math.random() * 1.2 + 0.5
                       : tier === 1 ? Math.random() * 2.5 + 1.5
                       : Math.random() * 4.5 + 3
      const baseAlpha  = tier === 0 ? Math.random() * 0.5 + 0.25
                       : tier === 1 ? Math.random() * 0.4 + 0.3
                       : Math.random() * 0.25 + 0.12
      const speed = tier === 0 ? 0.45 : tier === 1 ? 0.22 : 0.1
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: baseRadius, baseRadius,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        alpha: baseAlpha, baseAlpha,
        pulseOffset: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.018 + 0.008,
        tier,
      }
    })

    let tick = 0
    let raf: number

    const draw = () => {
      tick++
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update positions + pulse
      for (const p of pts) {
        p.x = (p.x + p.vx + canvas.width)  % canvas.width
        p.y = (p.y + p.vy + canvas.height) % canvas.height
        const pulse = Math.sin(tick * p.pulseSpeed + p.pulseOffset)
        p.radius = p.baseRadius * (1 + pulse * (p.tier === 2 ? 0.35 : 0.18))
        p.alpha  = p.baseAlpha  * (1 + pulse * 0.4)
      }

      // Draw constellation lines between nearby small/mid particles
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        if (a.tier === 2) continue
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]
          if (b.tier === 2) continue
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            const lineAlpha = (1 - dist / CONNECT_DIST) * 0.18
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of pts) {
        if (p.tier === 2) {
          // Large glow orb — radial gradient
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3.5)
          grd.addColorStop(0,   `rgba(${r},${g},${b},${p.alpha})`)
          grd.addColorStop(0.4, `rgba(${r},${g},${b},${p.alpha * 0.45})`)
          grd.addColorStop(1,   `rgba(${r},${g},${b},0)`)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius * 3.5, 0, Math.PI * 2)
          ctx.fillStyle = grd
          ctx.fill()
        } else {
          // Small/mid — crisp dot with a soft halo
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`
          ctx.fill()
          // halo
          const halo = ctx.createRadialGradient(p.x, p.y, p.radius * 0.5, p.x, p.y, p.radius * 3)
          halo.addColorStop(0, `rgba(${r},${g},${b},${p.alpha * 0.3})`)
          halo.addColorStop(1, `rgba(${r},${g},${b},0)`)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
          ctx.fillStyle = halo
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [themeColor])

  return (
    <>
      {/* Deep space base */}
      <div className="absolute inset-0 bg-[#04040f]" />
      {/* Subtle center nebula glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 45%, rgba(${hexToRgb(themeColor).join(',')},0.35) 0%, transparent 70%)` }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* Edge vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 55%, rgba(4,4,15,0.75) 100%)' }} />
    </>
  )
}

// ─── Gradient Mesh ────────────────────────────────────────────────────────────
function GradientMeshBg({ themeColor }: { themeColor: string }) {
  const [r, g, b] = hexToRgb(themeColor)
  const c1 = `rgb(${r},${g},${b})`
  const c2 = `rgb(${b},${Math.round(r * 0.45)},${Math.round(g * 1.3)})`
  const c3 = `rgb(${Math.round(g * 0.35)},${Math.round(b * 0.9)},${r})`

  return (
    <>
      <style>{`
        @keyframes _hhb1{0%,100%{transform:translate(0,0) scale(1)}38%{transform:translate(45px,-65px) scale(1.18)}72%{transform:translate(-22px,28px) scale(0.88)}}
        @keyframes _hhb2{0%,100%{transform:translate(0,0) scale(1)}32%{transform:translate(-55px,38px) scale(1.1)}68%{transform:translate(28px,-42px) scale(0.93)}}
        @keyframes _hhb3{0%,100%{transform:translate(0,0) scale(1)}48%{transform:translate(22px,52px) scale(0.9)}78%{transform:translate(-30px,-22px) scale(1.14)}}
      `}</style>
      <div className="absolute inset-0 bg-[#05050d]" />
      <div
        className="absolute w-[75%] h-[75%] rounded-full blur-[150px] opacity-40 -top-[20%] -left-[12%] will-change-transform"
        style={{ background: c1, animation: '_hhb1 14s ease-in-out infinite' }}
      />
      <div
        className="absolute w-[65%] h-[65%] rounded-full blur-[130px] opacity-30 -bottom-[15%] -right-[10%] will-change-transform"
        style={{ background: c2, animation: '_hhb2 18s ease-in-out infinite' }}
      />
      <div
        className="absolute w-[55%] h-[55%] rounded-full blur-[110px] opacity-25 top-[38%] left-[28%] will-change-transform"
        style={{ background: c3, animation: '_hhb3 22s ease-in-out infinite' }}
      />
    </>
  )
}

// ─── Noise / Grain ────────────────────────────────────────────────────────────
function NoiseBg({ themeColor }: { themeColor: string }) {
  const [r, g, b] = hexToRgb(themeColor)

  return (
    <>
      <div className="absolute inset-0 bg-[#08080f]" />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgb(${r},${g},${b})`, opacity: 0.18 }}
      />
      {/* SVG fractal noise — renders sharp grain at any resolution */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.18]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="hh-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hh-grain)" />
      </svg>
    </>
  )
}

// ─── Parallax ─────────────────────────────────────────────────────────────────
function ParallaxBg({ coverImageUrl }: { coverImageUrl?: string }) {
  const imgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const container = el.parentElement!

    const onScroll = () => {
      const rect = container.getBoundingClientRect()
      // Only parallax when visible
      if (rect.bottom < 0 || rect.top > window.innerHeight) return
      const progress = -rect.top / (rect.height || 1)
      el.style.transform = `translateY(${progress * 70}px)`
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!coverImageUrl) {
    return <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />
  }

  return (
    <>
      <div
        ref={imgRef}
        className="absolute inset-[-18%] will-change-transform"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-background/90" />
    </>
  )
}

// ─── Cover Blur ───────────────────────────────────────────────────────────────
/** Apple-Music-style blurred echo of the event's own cover art: the poster is
 *  scaled up, heavily blurred, and saturated so the whole page swims in the
 *  artwork's palette. Falls back to a theme-color glow when there's no cover. */
function CoverBlurBg({ coverImageUrl, themeColor }: { coverImageUrl?: string; themeColor: string }) {
    if (!coverImageUrl) {
        const [r, g, b] = hexToRgb(themeColor)
        return (
            <div
                className="absolute inset-0"
                style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(${r},${g},${b},0.45) 0%, transparent 70%), #0a0a12`,
                }}
            />
        )
    }
    return (
        <>
            <div className="absolute inset-0 bg-[#0a0a12]" />
            {/* Oversized + blurred so edges never show; saturation lifted so the
                palette reads even through the dark scrim */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={coverImageUrl}
                alt=""
                aria-hidden
                className="absolute inset-[-12%] w-[124%] h-[124%] object-cover"
                style={{ filter: 'blur(64px) saturate(1.45) brightness(0.9)', transform: 'scale(1.05)' }}
            />
            {/* Scrim: readable text everywhere, artwork glowing through. Kept
                deliberately light — the old values (brightness .75 under a
                35/45/70 black ramp) stacked into a muddy near-black that threw
                away the very colour this style exists to show. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/60" />
        </>
    )
}

// ─── Custom Image ─────────────────────────────────────────────────────────────
function CustomImageBg({ bgImageUrl }: { bgImageUrl?: string }) {
  if (!bgImageUrl) {
    return <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bgImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40" />
    </>
  )
}

// ─── Cover-driven grounds ─────────────────────────────────────────────────────
/**
 * Backgrounds built from the event's own poster.
 *
 * An earlier pass here used abstract grounds tinted with the accent colour. On a
 * page whose accent happened to be a dull green that produced a muddy dark
 * screen while the actual artwork sat unused a few hundred pixels away. Every
 * event has a cover image (required at create time), so the honest source for a
 * background is that image.
 */

/** The poster itself, full-bleed and sharp, under a scrim that keeps text legible. */
function CoverFullBg({ coverImageUrl, themeColor }: { coverImageUrl?: string; themeColor: string }) {
  if (!coverImageUrl) {
    const [r, g, b] = hexToRgb(themeColor)
    return <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(${r},${g},${b},0.45) 0%, transparent 70%), #0a0a12` }} />
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverImageUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'saturate(1.1)' }}
      />
      {/* Enough scrim to read body copy over a busy poster, no more. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/75" />
    </>
  )
}

/** Blurred poster with a vignette: centre stays bright, edges fall away. */
function SpotlightBg({ coverImageUrl, themeColor }: { coverImageUrl?: string; themeColor: string }) {
  if (!coverImageUrl) {
    const [r, g, b] = hexToRgb(themeColor)
    return <div className="absolute inset-0" style={{ background: `radial-gradient(58% 50% at 50% 28%, rgba(${r},${g},${b},0.35) 0%, transparent 70%), #0C0B10` }} />
  }
  return (
    <>
      <div className="absolute inset-0 bg-[#08070d]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverImageUrl}
        alt=""
        aria-hidden
        className="absolute inset-[-12%] w-[124%] h-[124%] object-cover"
        style={{ filter: 'blur(72px) saturate(1.5) brightness(1.05)', transform: 'scale(1.05)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(62% 55% at 50% 32%, transparent 0%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.85) 100%)' }}
      />
    </>
  )
}

/** Warm light ground — the one option that deliberately isn't the poster. */
function PaperBg() {
  return (
    <div className="absolute inset-0" style={{ background: '#F6F1E8' }}>
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.5,
          backgroundImage: 'radial-gradient(#C9BFAC 0.5px, transparent 0.6px)',
          backgroundSize: '4px 4px',
        }}
      />
    </div>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function EventPageBackground({
  bgStyle,
  themeColor = '#6366f1',
  coverImageUrl,
  bgImageUrl,
  videoUrl,
  className,
}: {
  bgStyle: BgStyle
  themeColor?: string
  coverImageUrl?: string
  bgImageUrl?: string
  videoUrl?: string
  /** Override the wrapper class — default is `absolute inset-0 overflow-hidden` */
  className?: string
}) {
  if (bgStyle === 'default') return null

  const accent = resolveAccentColor(themeColor)

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {/* Base layer: video > custom image > cover image */}
      {videoUrl ? (
        <video
          src={videoUrl}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : bgStyle === 'custom-image' ? (
        <CustomImageBg bgImageUrl={bgImageUrl} />
      ) : bgStyle === 'parallax' ? (
        <ParallaxBg coverImageUrl={coverImageUrl} />
      ) : bgStyle === 'cover-blur' ? (
        <CoverBlurBg coverImageUrl={coverImageUrl} themeColor={accent} />
      ) : bgStyle === 'cover-full' ? (
        <CoverFullBg coverImageUrl={coverImageUrl} themeColor={accent} />
      ) : bgStyle === 'spotlight' ? (
        <SpotlightBg coverImageUrl={coverImageUrl} themeColor={accent} />
      ) : bgStyle === 'paper' ? (
        <PaperBg />
      ) : null}

      {/* When a video is playing under particles/mesh/noise, darken it first so effects read */}
      {videoUrl && bgStyle !== 'custom-image' && bgStyle !== 'parallax' && bgStyle !== 'cover-blur' && (
        <div className="absolute inset-0 bg-black/55 z-[1]" />
      )}

      {/* Effect overlay layers — z-[2] so they sit above the video+darkener */}
      {bgStyle === 'particles'     && <div className="absolute inset-0 z-[2]"><ParticlesBg themeColor={accent} /></div>}
      {bgStyle === 'gradient-mesh' && <div className="absolute inset-0 z-[2]"><GradientMeshBg themeColor={accent} /></div>}
      {bgStyle === 'noise'         && <div className="absolute inset-0 z-[2]"><NoiseBg themeColor={accent} /></div>}
    </div>
  )
}
