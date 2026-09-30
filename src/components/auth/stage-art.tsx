'use client'

import { useEffect } from 'react'
import {
    motion, useMotionValue, useSpring, useTransform,
    type MotionValue,
} from 'motion/react'

/**
 * Reactive stage scene for the partner sign-in panel.
 *
 * WHY IT IS DRAWN RATHER THAN SHIPPED. The repo has no animated art — four flat
 * PNGs with white backgrounds, six multi-megabyte app screenshots and the logo.
 * None can sit on a purple gradient without a card frame, and none of them move.
 * Inline SVG costs ~1kB, inherits the panel's colour, and is the only option
 * that can react to anything.
 *
 * THE RIG FOLLOWS THE CURSOR. Four lights aim at the pointer, a spotlight pool
 * tracks it across the floor, and five depth layers parallax against it at
 * different rates. Tracking is bound to the WINDOW, not this panel — the cursor
 * spends its time on the form to the right, and a rig that only woke up when you
 * crossed into the artwork would look broken from where the user actually is.
 *
 * IT MUST NOT COMPETE WITH THE COPY. Headline and value props sit mid-panel, so
 * weight lives at the top (truss) and bottom (crowd, spotlight). Beams crossing
 * the middle are gradients faded to nothing before they reach the text.
 *
 * Sliced to yMax, NOT yMid: the panel is wider than this viewBox's ratio at most
 * window sizes, so `slice` crops vertically, and centred that takes ~43 user
 * units off the bottom — exactly where the crowd is. Bottom-anchored, the crop
 * lands above the truss where there is nothing to lose.
 */

const SPRING = { stiffness: 45, damping: 22, mass: 1.1 }

/** Fixture x-positions along the truss. A light hangs from each. */
const FIXTURES = [70, 152, 248, 330]

const CROWD = [
    { x: 18, r: 11, arms: false }, { x: 48, r: 9, arms: true },
    { x: 74, r: 12, arms: false }, { x: 106, r: 10, arms: false },
    { x: 132, r: 9, arms: true }, { x: 160, r: 13, arms: false },
    { x: 194, r: 10, arms: false }, { x: 222, r: 11, arms: true },
    { x: 252, r: 9, arms: false }, { x: 280, r: 12, arms: false },
    { x: 312, r: 10, arms: true }, { x: 344, r: 11, arms: false },
    { x: 374, r: 9, arms: false },
]

const TICKETS = [
    { x: 54, delay: 0, duration: 18 },
    { x: 296, delay: 6, duration: 22 },
    { x: 186, delay: 12, duration: 20 },
]

/**
 * Depth. `depth` is how far the layer travels against the pointer: the crowd is
 * nearest so it moves most and OPPOSITE the far layers, which is what sells the
 * parallax — everything sliding the same way just reads as the whole image
 * shifting.
 */
function useParallax(
    sx: MotionValue<number>, sy: MotionValue<number>, depth: number,
) {
    return {
        x: useTransform(sx, (v) => (v - 0.5) * depth * 70),
        y: useTransform(sy, (v) => (v - 0.5) * depth * 34),
    }
}

/** One tracking light. Its own component because `useTransform` cannot run in a loop. */
function Beam({
    fx, index, sx, sy, reduce,
}: {
    fx: number; index: number
    sx: MotionValue<number>; sy: MotionValue<number>
    reduce: boolean
}) {
    const spread = 46 + index * 7
    const d = `M${fx} 172 L${fx - spread} 620 L${fx + spread} 620 Z`

    // Aim at the pointer, clamped: past about 32° a beam leaves the panel
    // sideways and reads as a mistake rather than a light.
    const rotate = useTransform<number, number>([sx, sy], ([x, y]) => {
        const px = x * 400
        const py = Math.max(y * 600, 230)     // never aim upward at its own truss
        const deg = (Math.atan2(px - fx, py - 172) * 180) / Math.PI
        return Math.max(-32, Math.min(32, deg))
    })

    if (reduce) return <path d={d} fill="url(#hh-beam)" />

    return (
        <motion.g
            style={{ transformBox: 'view-box', transformOrigin: `${fx}px 172px`, rotate }}
        >
            <path d={d} fill="url(#hh-beam)" />
            {/* A brighter core inside the cone. A flat cone looks like a shape;
                a hot centre looks like light. */}
            <path d={`M${fx} 172 L${fx - spread * 0.3} 620 L${fx + spread * 0.3} 620 Z`}
                fill="url(#hh-beam-core)" />
        </motion.g>
    )
}

export function StageArt({ reduce }: { reduce: boolean }) {
    const mx = useMotionValue(0.5)
    const my = useMotionValue(0.55)
    const sx = useSpring(mx, SPRING)
    const sy = useSpring(my, SPRING)

    useEffect(() => {
        if (reduce) return
        const onMove = (e: PointerEvent) => {
            mx.set(e.clientX / window.innerWidth)
            my.set(e.clientY / window.innerHeight)
        }
        // Passive: this only reads coordinates, and a non-passive pointermove
        // listener blocks scrolling on the mobile form below.
        window.addEventListener('pointermove', onMove, { passive: true })
        return () => window.removeEventListener('pointermove', onMove)
    }, [reduce, mx, my])

    const far = useParallax(sx, sy, 0.18)      // colour field
    const mid = useParallax(sx, sy, 0.38)      // halftone + rings
    const rig = useParallax(sx, sy, 0.1)       // truss: nearly fixed
    const near = useParallax(sx, sy, -0.55)    // crowd: opposite, most travel
    const poolX = useTransform(sx, (v) => (v - 0.5) * 300)

    const still = { x: 0, y: 0 }
    const L = (p: { x: MotionValue<number>; y: MotionValue<number> }) =>
        reduce ? still : p

    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 400 600"
            preserveAspectRatio="xMidYMax slice"
            fill="none"
        >
            <defs>
                <linearGradient id="hh-beam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
                    <stop offset="45%" stopColor="#fff" stopOpacity="0.07" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hh-beam-core" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.30" />
                    <stop offset="60%" stopColor="#fff" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hh-crowd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0.04" />
                </linearGradient>
                <radialGradient id="hh-pool">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                {/* Halftone. A pattern, not 600 circles — the browser tiles one. */}
                <pattern id="hh-dots" width="14" height="14" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.1" fill="#fff" fillOpacity="0.12" />
                </pattern>
                <radialGradient id="hh-dots-fade">
                    <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                <mask id="hh-dots-mask">
                    <ellipse cx="200" cy="300" rx="260" ry="300" fill="url(#hh-dots-fade)" />
                </mask>
            </defs>

            {/* ── Colour field ──────────────────────────────────────────────
                Screen-blended risograph shapes. These are what stop the panel
                reading as one flat purple with lines drawn on it. */}
            <motion.g style={{ ...L(far), mixBlendMode: 'screen' }}>
                <motion.ellipse
                    cx="90" cy="250" rx="150" ry="180" fill="#f0abfc" fillOpacity="0.16"
                    animate={reduce ? undefined : { cx: [90, 130, 90], ry: [180, 205, 180] }}
                    transition={{ duration: 23, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.ellipse
                    cx="320" cy="420" rx="170" ry="150" fill="#818cf8" fillOpacity="0.20"
                    animate={reduce ? undefined : { cx: [320, 280, 320], rx: [170, 195, 170] }}
                    transition={{ duration: 31, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.ellipse
                    cx="230" cy="120" rx="130" ry="110" fill="#fb923c" fillOpacity="0.11"
                    animate={reduce ? undefined : { cy: [120, 165, 120] }}
                    transition={{ duration: 27, repeat: Infinity, ease: 'easeInOut' }}
                />
            </motion.g>

            {/* ── Halftone + rings ──────────────────────────────────────── */}
            <motion.g style={L(mid)}>
                <rect x="-60" y="-60" width="520" height="720"
                    fill="url(#hh-dots)" mask="url(#hh-dots-mask)" />
                <circle cx="200" cy="300" r="150" stroke="#fff" strokeOpacity="0.07" strokeWidth="1" />
                <circle cx="200" cy="300" r="210" stroke="#fff" strokeOpacity="0.05" strokeWidth="1" />
            </motion.g>

            {/* ── Beams ─────────────────────────────────────────────────── */}
            {FIXTURES.map((fx, i) => (
                <Beam key={fx} fx={fx} index={i} sx={sx} sy={sy} reduce={reduce} />
            ))}

            {/* ── Spotlight pool on the floor ───────────────────────────── */}
            <motion.g style={reduce ? { x: 0 } : { x: poolX }}>
                <ellipse cx="200" cy="556" rx="130" ry="30" fill="url(#hh-pool)" />
            </motion.g>

            {/* ── Truss + fixtures ──────────────────────────────────────── */}
            <motion.g style={L(rig)}>
                <g stroke="#fff" strokeOpacity="0.32" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="-60" y1="152" x2="460" y2="152" />
                    <line x1="-60" y1="168" x2="460" y2="168" />
                    {Array.from({ length: 26 }, (_, i) => {
                        const x = -60 + i * 20
                        return <line key={i} x1={x} y1="152" x2={x + 20} y2="168" strokeOpacity="0.15" />
                    })}
                </g>
                {FIXTURES.map((fx, i) => (
                    <g key={fx}>
                        <rect x={fx - 7} y="168" width="14" height="10" rx="2" fill="#fff" fillOpacity="0.38" />
                        {reduce ? (
                            <circle cx={fx} cy="179" r="3.2" fill="#fff" fillOpacity="0.75" />
                        ) : (
                            <motion.circle
                                cx={fx} cy="179" r="3.2" fill="#fff"
                                animate={{ fillOpacity: [0.4, 0.9, 0.4] }}
                                transition={{ duration: 3.4 + i * 0.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        )}
                    </g>
                ))}
            </motion.g>

            {/* ── Drifting ticket stubs ─────────────────────────────────── */}
            {!reduce && TICKETS.map((t) => (
                <motion.g
                    key={t.x}
                    style={{ transformBox: 'view-box', transformOrigin: `${t.x + 19}px 400px` }}
                    initial={{ opacity: 0 }}
                    animate={{
                        // Same keyframe count on every property: `times` applies
                        // per-property, so a 2-keyframe y against 4 times does
                        // not line up.
                        y: [0, -40, -150, -205],
                        opacity: [0, 0.9, 0.9, 0],
                        rotate: [-12, -4, 7, 14],
                    }}
                    transition={{
                        duration: t.duration, delay: t.delay, repeat: Infinity,
                        ease: 'linear', times: [0, 0.18, 0.72, 1],
                    }}
                >
                    <rect x={t.x} y="392" width="38" height="21" rx="3"
                        stroke="#fff" strokeOpacity="0.42" strokeWidth="1.2" />
                    {/* The perforation is what makes it a ticket and not a box. */}
                    <line x1={t.x + 26} y1="392" x2={t.x + 26} y2="413"
                        stroke="#fff" strokeOpacity="0.42" strokeWidth="1.2" strokeDasharray="2 2" />
                </motion.g>
            ))}

            {/* ── Crowd ─────────────────────────────────────────────────── */}
            <motion.g style={L(near)} fill="url(#hh-crowd)" stroke="none">
                {CROWD.map((p, i) => {
                    const head = <circle cx={p.x} cy={556 - p.r} r={p.r} />
                    const body = (
                        <path d={`M${p.x - p.r * 1.7} 620
                                  q0 -${p.r * 3.2} ${p.r * 1.7} -${p.r * 3.2}
                                  q${p.r * 1.7} 0 ${p.r * 1.7} ${p.r * 3.2} Z`} />
                    )
                    const arms = p.arms ? (
                        <g stroke="#fff" strokeOpacity="0.18" strokeWidth="3" strokeLinecap="round" fill="none">
                            <line x1={p.x - p.r} y1={568} x2={p.x - p.r * 2.1} y2={534} />
                            <line x1={p.x + p.r} y1={568} x2={p.x + p.r * 2.1} y2={530} />
                        </g>
                    ) : null

                    if (reduce) return <g key={p.x}>{head}{body}{arms}</g>
                    return (
                        <motion.g
                            key={p.x}
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                                duration: 2.6 + (i % 5) * 0.45,
                                repeat: Infinity,
                                ease: 'easeInOut',
                                // Phase-shifted. In step, thirteen silhouettes read
                                // as one bouncing object rather than a crowd.
                                delay: (i % 7) * 0.31,
                            }}
                        >
                            {head}{body}{arms}
                        </motion.g>
                    )
                })}
            </motion.g>
        </svg>
    )
}
