'use client'

import { useRef, useState } from 'react'
import { Award, Loader2, Share2 } from 'lucide-react'

export interface TicketBadge {
    id: string
    name: string
    description: string | null
    tier: string | null
    art_url: string | null
    holder_count: number
    earned_at: string
}

/** Tier treatment, used for the fallback medallion and the share card ground. */
const TIER_STYLE: Record<string, { from: string; to: string; ink: string; label: string }> = {
    bronze:   { from: '#b45309', to: '#78350f', ink: '#fde68a', label: 'Bronze' },
    silver:   { from: '#94a3b8', to: '#475569', ink: '#f1f5f9', label: 'Silver' },
    gold:     { from: '#f59e0b', to: '#b45309', ink: '#fffbeb', label: 'Gold' },
    platinum: { from: '#67e8f9', to: '#0e7490', ink: '#ecfeff', label: 'Platinum' },
}
const tierStyle = (t: string | null) => TIER_STYLE[(t ?? '').toLowerCase()] ?? TIER_STYLE.gold

/** "one of only 26" reads as a reward; "one of 306" reads as a crowd. */
function rarityLine(holders: number): string | null {
    if (!holders || holders <= 1) return 'The first one of these'
    if (holders <= 50) return `One of only ${holders}`
    return `${holders.toLocaleString()} people have this`
}

/**
 * Load an image for the share card.
 *
 * crossOrigin is required or the canvas is tainted and toBlob() throws on
 * export. Resolves null instead of rejecting so a blocked or missing image
 * degrades to the tier medallion rather than killing the share.
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = url
    })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

/** Wrap text to a width, returning the lines actually drawn. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ''
    for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (ctx.measureText(next).width > maxWidth && line) {
            lines.push(line)
            line = w
            if (lines.length === maxLines) return lines
        } else {
            line = next
        }
    }
    if (line && lines.length < maxLines) lines.push(line)
    return lines
}

async function buildCard(badge: TicketBadge, organizer: string | null, eventTitle: string): Promise<Blob | null> {
    // 1080x1350 — the portrait that works as a feed post and still reads inside a
    // story's safe area. Drawn at full size, not scaled up from the DOM.
    const W = 1080, H = 1350
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const st = tierStyle(badge.tier)

    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, st.from)
    bg.addColorStop(1, st.to)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Vignette so the art never fights the ground.
    const vig = ctx.createRadialGradient(W / 2, H * 0.42, 80, W / 2, H * 0.42, W * 0.85)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    // Badge art, circular. Falls back to a monogram medallion.
    const cx = W / 2, cy = 520, r = 260
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fill()
    ctx.clip()
    const art = badge.art_url ? await loadImage(badge.art_url) : null
    if (art) {
        // cover-fit inside the circle
        const scale = Math.max((r * 2) / art.width, (r * 2) / art.height)
        const dw = art.width * scale, dh = art.height * scale
        ctx.drawImage(art, cx - dw / 2, cy - dh / 2, dw, dh)
    } else {
        ctx.fillStyle = st.ink
        ctx.font = '700 220px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((badge.name[0] || '?').toUpperCase(), cx, cy + 8)
    }
    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    // Tier eyebrow
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.letterSpacing = '6px'
    ctx.fillText(st.label.toUpperCase(), cx, 880)
    ctx.letterSpacing = '0px'

    // Badge name, wrapped
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 76px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const nameLines = wrap(ctx, badge.name, W - 160, 2)
    nameLines.forEach((l, i) => ctx.fillText(l, cx, 970 + i * 86))

    const afterName = 970 + nameLines.length * 86

    // Rarity
    const rarity = rarityLine(badge.holder_count)
    if (rarity) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = '600 38px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        ctx.fillText(rarity, cx, afterName + 24)
    }

    // Where it came from
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.font = '400 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const fromLines = wrap(ctx, organizer ? `${organizer} · ${eventTitle}` : eventTitle, W - 180, 2)
    fromLines.forEach((l, i) => ctx.fillText(l, cx, afterName + 92 + i * 44))

    // Wordmark
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '700 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    ctx.letterSpacing = '4px'
    ctx.fillText('HANGHUT.COM', cx, H - 70)
    ctx.letterSpacing = '0px'

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95))
}

export function TicketBadges({
    badges, organizerName, eventTitle, accent,
}: {
    badges: TicketBadge[]
    organizerName: string | null
    eventTitle: string
    accent?: string
}) {
    const [sharing, setSharing] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const liveRef = useRef<HTMLParagraphElement>(null)

    if (!badges || badges.length === 0) return null

    async function share(badge: TicketBadge) {
        setSharing(badge.id)
        setNote(null)
        try {
            const blob = await buildCard(badge, organizerName, eventTitle)
            if (!blob) throw new Error('render failed')
            const file = new File([blob], `${badge.name.replace(/\s+/g, '-').toLowerCase()}.png`, { type: 'image/png' })

            // Native share sheet where the browser supports sharing FILES —
            // canShare must be asked about the file itself, since several
            // browsers expose navigator.share but refuse attachments.
            const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
            if (nav.share && nav.canShare?.({ files: [file] })) {
                await nav.share({ files: [file], title: badge.name })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = file.name
                a.click()
                URL.revokeObjectURL(url)
                setNote('Saved to your downloads — post it anywhere.')
            }
        } catch (e) {
            // AbortError is the user dismissing the share sheet; not a failure.
            if ((e as Error)?.name !== 'AbortError') setNote('Could not make the image. Try again.')
        } finally {
            setSharing(null)
        }
    }

    return (
        <div className="rounded-2xl border bg-background p-5">
            <div className="flex items-center gap-2">
                <Award className="h-4 w-4 shrink-0" style={accent ? { color: accent } : undefined} />
                <h2 className="text-sm font-bold">
                    {badges.length === 1 ? 'You earned a badge' : `You earned ${badges.length} badges`}
                </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                From {organizerName || 'this organizer'}. Yours to keep — no account needed.
            </p>

            <ul className="mt-4 space-y-3">
                {badges.map((b) => {
                    const st = tierStyle(b.tier)
                    const rarity = rarityLine(b.holder_count)
                    return (
                        <li key={b.id} className="flex items-center gap-3">
                            <div
                                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/70"
                                style={{ background: `linear-gradient(135deg, ${st.from}, ${st.to})` }}
                            >
                                {b.art_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={b.art_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-xl font-extrabold" style={{ color: st.ink }}>
                                        {(b.name[0] || '?').toUpperCase()}
                                    </span>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{b.name}</p>
                                {b.description && (
                                    <p className="truncate text-xs text-muted-foreground">{b.description}</p>
                                )}
                                {rarity && (
                                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                        style={{ color: st.from }}>
                                        {rarity}
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => share(b)}
                                disabled={sharing === b.id}
                                aria-label={`Share ${b.name}`}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
                                style={accent ? { borderColor: `${accent}55` } : undefined}
                            >
                                {sharing === b.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Share2 className="h-3.5 w-3.5" />}
                                Share
                            </button>
                        </li>
                    )
                })}
            </ul>

            <p ref={liveRef} aria-live="polite" className="mt-3 text-xs text-muted-foreground">
                {note}
            </p>
        </div>
    )
}
