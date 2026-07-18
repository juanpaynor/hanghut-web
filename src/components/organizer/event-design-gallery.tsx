'use client'

import { Check } from 'lucide-react'
import {
    EVENT_DESIGN_TEMPLATES,
    TEMPLATE_FONT_CSS,
    TEMPLATE_FONTS_URL,
    type EventDesignTemplate,
} from '@/lib/event-design-templates'

function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return m
        ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
        : [99, 102, 241]
}

/**
 * Lightweight CSS approximation of each bg_style so the cards render cheaply —
 * the real animated canvases (event-bg.tsx) would be too heavy to run 6× on
 * one page. Colors derive from the template's theme color.
 */
function PreviewBackground({ t }: { t: EventDesignTemplate }) {
    const [r, g, b] = hexToRgb(t.theme_color)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    switch (t.bg_style) {
        case 'particles':
            return (
                <div
                    className="absolute inset-0"
                    style={{
                        background: [
                            `radial-gradient(circle 1.5px at 18% 28%, ${c(0.9)} 40%, transparent 100%)`,
                            `radial-gradient(circle 1px at 68% 18%, ${c(0.7)} 40%, transparent 100%)`,
                            `radial-gradient(circle 2px at 84% 60%, ${c(0.8)} 40%, transparent 100%)`,
                            `radial-gradient(circle 1px at 40% 72%, ${c(0.6)} 40%, transparent 100%)`,
                            `radial-gradient(circle 1.5px at 58% 44%, ${c(0.75)} 40%, transparent 100%)`,
                            `radial-gradient(circle 1px at 10% 78%, ${c(0.5)} 40%, transparent 100%)`,
                            `radial-gradient(circle 8px at 30% 50%, ${c(0.22)} 0%, transparent 100%)`,
                            `radial-gradient(ellipse 70% 55% at 50% 45%, ${c(0.14)} 0%, transparent 70%)`,
                            '#04040f',
                        ].join(', '),
                    }}
                />
            )
        case 'gradient-mesh':
            return (
                <div className="absolute inset-0" style={{ background: '#05050d' }}>
                    <div
                        className="absolute -top-1/4 -left-[10%] w-3/4 h-3/4 rounded-full opacity-40"
                        style={{ background: t.theme_color, filter: 'blur(24px)' }}
                    />
                    <div
                        className="absolute -bottom-1/4 -right-[10%] w-2/3 h-2/3 rounded-full opacity-30"
                        style={{ background: `rgb(${b},${Math.round(r * 0.45)},${Math.round(g * 1.3)})`, filter: 'blur(22px)' }}
                    />
                </div>
            )
        case 'noise':
            return (
                <div className="absolute inset-0" style={{ background: '#08080f' }}>
                    <div className="absolute inset-0" style={{ background: t.theme_color, opacity: 0.14 }} />
                    <svg className="absolute inset-0 w-full h-full opacity-[0.16]" xmlns="http://www.w3.org/2000/svg">
                        <filter id={`grain-${t.id}`}>
                            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
                            <feColorMatrix type="saturate" values="0" />
                        </filter>
                        <rect width="100%" height="100%" filter={`url(#grain-${t.id})`} />
                    </svg>
                </div>
            )
        case 'parallax':
            return (
                <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(165deg, ${c(0.55)} 0%, ${c(0.2)} 35%, #0b0b14 80%)` }}
                >
                    <div
                        className="absolute bottom-0 inset-x-0 h-1/3"
                        style={{
                            background: '#07070e',
                            clipPath: 'polygon(0 65%, 22% 30%, 40% 55%, 62% 15%, 80% 48%, 100% 28%, 100% 100%, 0 100%)',
                            opacity: 0.9,
                        }}
                    />
                </div>
            )
        default:
            return <div className="absolute inset-0 bg-white" />
    }
}

/**
 * Mini mock of the event page rendered in the theme's ART DIRECTION —
 * per-theme badge shapes, title treatment, button style, and card decoration,
 * mirroring the CSS in event-themes.ts so the card sells the real look.
 */
function PreviewContent({ t }: { t: EventDesignTemplate }) {
    const dark = t.bg_style !== 'default'
    const accent = t.theme_color
    const headingColor = t.heading_color || (dark ? '#FFFFFF' : '#18181B')
    const bodyColor = dark ? 'rgba(255,255,255,0.65)' : '#52525B'
    const headingFont = TEMPLATE_FONT_CSS[t.font_heading] || TEMPLATE_FONT_CSS.inter
    const bodyFont = TEMPLATE_FONT_CSS[t.font_body] || TEMPLATE_FONT_CSS.inter

    // ── Per-theme treatments (mirror event-themes.ts) ──
    const titleStyle: React.CSSProperties = {
        fontFamily: headingFont,
        color: headingColor,
        fontSize: t.page_layout === 'poster' ? 16 : 13,
        fontWeight: 700,
        lineHeight: 1.1,
        ...(t.theme === 'neon-rave' && {
            textTransform: 'uppercase',
            textShadow: `0 0 10px ${accent}, 0 0 28px ${accent}88`,
        }),
        ...(t.theme === 'velvet-gala' && { fontWeight: 600, letterSpacing: '0.01em' }),
        ...(t.theme === 'sunset-festival' && { fontWeight: 800 }),
    }

    const badgeStyle: React.CSSProperties = {
        fontFamily: t.theme === 'circuit' ? 'ui-monospace, monospace' : bodyFont,
        fontSize: 6.5,
        fontWeight: 700,
        letterSpacing: t.theme === 'velvet-gala' ? '0.2em' : '0.08em',
        textTransform: 'uppercase',
        padding: '2px 6px',
        width: 'fit-content',
        ...(t.theme === 'classic' && { borderRadius: 999, background: 'rgba(127,127,127,0.15)', color: dark ? '#fff' : '#3F3F46' }),
        ...(t.theme === 'neon-rave' && { borderRadius: 3, border: `1px solid ${accent}`, color: accent, boxShadow: `0 0 8px ${accent}66` }),
        ...(t.theme === 'velvet-gala' && { borderRadius: 0, border: `1px solid ${accent}A0`, color: accent }),
        ...(t.theme === 'sunset-festival' && { borderRadius: 999, background: accent, color: '#fff', transform: 'rotate(-2deg)', boxShadow: '0 2px 0 rgba(0,0,0,0.18)' }),
        ...(t.theme === 'circuit' && { borderRadius: 2, border: `1px solid ${accent}B0`, color: accent }),
        ...(t.theme === 'broadsheet' && { borderRadius: 0, border: `1px solid ${dark ? '#fff' : '#18181B'}`, color: dark ? '#fff' : '#18181B', letterSpacing: '0.16em' }),
    }

    const buttonStyle: React.CSSProperties = {
        fontFamily: bodyFont,
        fontSize: 8,
        fontWeight: t.theme === 'sunset-festival' ? 800 : 600,
        padding: '3px 10px',
        width: 'fit-content',
        background: accent,
        color: t.theme === 'velvet-gala' ? '#1a1608' : dark ? '#0a0a12' : '#fff',
        ...(t.theme === 'classic' && { borderRadius: 999 }),
        ...(t.theme === 'neon-rave' && { borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: `0 0 14px ${accent}88`, color: '#fff' }),
        ...(t.theme === 'velvet-gala' && { borderRadius: 0, letterSpacing: '0.08em' }),
        ...(t.theme === 'sunset-festival' && { borderRadius: 999, color: '#fff' }),
        ...(t.theme === 'circuit' && { borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#04120b' }),
        ...(t.theme === 'broadsheet' && { borderRadius: 0, color: '#fff' }),
    }

    // Sidebar "ticket card" — decorated per theme
    const cardStyle: React.CSSProperties = {
        background: dark ? 'rgba(255,255,255,0.07)' : '#fff',
        border: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid #E4E4E7',
        borderRadius: 8,
        ...(t.theme === 'neon-rave' && { border: `1px solid ${accent}66`, boxShadow: `0 0 16px ${accent}44`, borderRadius: 6 }),
        ...(t.theme === 'velvet-gala' && { border: `1px solid ${accent}70`, outline: `1px solid ${accent}30`, outlineOffset: 2, borderRadius: 1 }),
        ...(t.theme === 'sunset-festival' && { border: `2px solid ${accent}55`, borderRadius: 12 }),
        ...(t.theme === 'circuit' && { border: `1px solid ${accent}55`, borderRadius: 1 }),
        ...(t.theme === 'broadsheet' && { border: 'none', borderTop: `2px solid ${dark ? '#fff' : '#18181B'}`, borderRadius: 0, boxShadow: 'none' }),
    }

    const sectionLabel =
        t.theme === 'circuit' ? (
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 7, color: accent }}>{'// TICKETS'}</span>
        ) : t.theme === 'broadsheet' ? (
            <span style={{ fontFamily: bodyFont, fontSize: 7, letterSpacing: '0.14em', color: dark ? '#ffffff99' : '#71717A' }}>01&nbsp;&nbsp;TICKETS</span>
        ) : t.theme === 'neon-rave' ? (
            <span style={{ fontFamily: bodyFont, fontSize: 7, letterSpacing: '0.12em', color: accent, textTransform: 'uppercase' }}>✦ Tickets</span>
        ) : null

    const heading = <div style={titleStyle}>{t.theme === 'neon-rave' ? 'YOUR EVENT' : 'Your Event Name'}</div>
    const date = (
        <div style={{ fontFamily: bodyFont, color: bodyColor, fontSize: 7.5 }}>
            Sat, Aug 15 · 7:00 PM · Manila
            {t.theme === 'sunset-festival' && (
                <div style={{ height: 3, width: 46, marginTop: 3, background: `repeating-linear-gradient(90deg, ${accent} 0 4px, transparent 4px 6px)`, borderRadius: 2 }} />
            )}
            {t.theme === 'velvet-gala' && (
                <div style={{ height: 1, width: 40, marginTop: 4, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
            )}
        </div>
    )
    const button = <div style={buttonStyle}>{t.theme === 'neon-rave' || t.theme === 'circuit' ? 'GET TICKETS' : 'Get Tickets'}</div>

    if (t.page_layout === 'poster') {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-3">
                <div style={badgeStyle}>{t.vibe.split(' ')[0]}</div>
                {heading}
                {date}
                <div className="mt-0.5">{button}</div>
            </div>
        )
    }
    if (t.page_layout === 'minimal') {
        return (
            <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-4">
                <div style={badgeStyle}>{t.vibe.split(' ')[0]}</div>
                {heading}
                {date}
                {sectionLabel}
                <div className="mt-0.5">{button}</div>
            </div>
        )
    }
    // default two-column: text left, themed sidebar ticket card right
    return (
        <div className="absolute inset-0 flex items-center gap-2 px-3">
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                <div style={badgeStyle}>{t.vibe.split(' ')[0]}</div>
                {heading}
                {date}
                {button}
            </div>
            <div className="relative w-[27%] h-[64%] shrink-0 flex flex-col items-center justify-center gap-1" style={cardStyle}>
                {t.theme === 'circuit' && (
                    <>
                        <span className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1.5px solid ${accent}`, borderLeft: `1.5px solid ${accent}` }} />
                        <span className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1.5px solid ${accent}`, borderRight: `1.5px solid ${accent}` }} />
                    </>
                )}
                {sectionLabel}
                <div style={{ fontFamily: headingFont, fontSize: 9, fontWeight: 700, color: dark ? '#fff' : '#18181B' }}>₱499</div>
            </div>
        </div>
    )
}

export function EventDesignGallery({
    current,
    onApply,
}: {
    /** Current form values, used to badge the template that's already applied */
    current: {
        theme: string
        themeColor: string
        bgStyle: string
        pageLayout: string
    }
    onApply: (t: EventDesignTemplate) => void
}) {
    // A template counts as active when its theme is applied AND the main knobs
    // still match (so a manually-customized page doesn't claim a false badge).
    const activeId = EVENT_DESIGN_TEMPLATES.find(
        (t) =>
            t.theme === current.theme &&
            t.bg_style === current.bgStyle &&
            t.page_layout === current.pageLayout &&
            t.theme_color.toLowerCase() === current.themeColor.toLowerCase()
    )?.id

    return (
        <div>
            {/* Load the preview faces once for the whole gallery */}
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={TEMPLATE_FONTS_URL} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {EVENT_DESIGN_TEMPLATES.map((t) => {
                    const isActive = t.id === activeId
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => onApply(t)}
                            className={`group text-left rounded-2xl border-2 overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                isActive
                                    ? 'border-primary shadow-md'
                                    : 'border-border hover:border-primary/50 hover:shadow-md'
                            }`}
                        >
                            <div className="relative aspect-[16/10] overflow-hidden">
                                <PreviewBackground t={t} />
                                <PreviewContent t={t} />
                                {isActive && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 shadow">
                                        <Check className="h-3 w-3" />
                                    </div>
                                )}
                            </div>
                            <div className="p-3 bg-card">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold text-sm truncate">{t.name}</div>
                                    <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0"
                                        style={{ background: `${t.theme_color}1A`, color: t.theme_color === '#18181B' ? undefined : t.theme_color }}
                                    >
                                        {t.vibe}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5">{t.tagline}</div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
