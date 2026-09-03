/**
 * Miniature previews for the event-page design pickers.
 *
 * The pickers used to represent each option with an emoji (🅱️ for Broadside,
 * 🌈 for Gradient Mesh). Nobody can predict a page layout from an emoji, so
 * organizers defaulted to the one word they understood. These render an actual
 * scaled-down composition instead, tinted with the organizer's own accent.
 *
 * Pure presentation: no hooks, no data. Every preview is a fixed 16:10 frame so
 * the picker grid stays even.
 */

import { cn } from '@/lib/utils'

/**
 * The poster in a preview. Uses the organizer's REAL cover image when there is
 * one — a picker that shows their own artwork is worth far more than one
 * showing an invented gradient, especially for the cover-driven backgrounds
 * where the artwork IS the background.
 */
function Art({ accent, cover, className, style }: { accent: string; cover?: string; className?: string; style?: React.CSSProperties }) {
    if (cover) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={cover}
                alt=""
                aria-hidden
                className={cn('relative object-cover', className)}
                style={style}
            />
        )
    }
    return (
        <div
            className={cn('relative overflow-hidden', className)}
            style={{
                background: `linear-gradient(150deg, ${accent} 0%, ${accent}aa 45%, #E0523C 100%)`,
                ...style,
            }}
        >
            <div className="absolute left-[8%] bottom-[10%] right-[8%] flex flex-col gap-[2px]">
                <div style={{ height: 2, width: '70%', background: 'rgba(255,255,255,.92)', borderRadius: 1 }} />
                <div style={{ height: 2, width: '45%', background: 'rgba(255,255,255,.7)', borderRadius: 1 }} />
            </div>
        </div>
    )
}

const Frame = ({ children, style, className }: { children?: React.ReactNode; style?: React.CSSProperties; className?: string }) => (
    <div
        className={cn('relative w-full overflow-hidden rounded-md', className)}
        style={{ aspectRatio: '16 / 10', ...style }}
    >
        {children}
    </div>
)

/* ────────────────────────── Backgrounds ────────────────────────── */

export function BgPreview({ value, accent, cover }: { value: string; accent: string; cover?: string }) {
    const chip = <Art accent={accent} cover={cover} style={{ width: '30%', aspectRatio: '1 / 1.25', borderRadius: 2, boxShadow: '0 4px 14px -4px rgba(0,0,0,.5)', objectFit: 'cover' }} />
    const center = (bg: React.CSSProperties, extra?: React.ReactNode) => (
        <Frame style={bg}>
            {extra}
            <div className="absolute inset-0 grid place-items-center">{chip}</div>
        </Frame>
    )

    /** Fills the frame with the real cover (or an accent stand-in), so the
     *  cover-driven options preview the artwork they'll actually use. */
    const coverLayer = (filter: string, scale = 1.15) =>
        cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" style={{ filter, transform: `scale(${scale})` }} />
        ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${accent}, #E0523C)`, filter, transform: `scale(${scale})` }} />
        )

    switch (value) {
        // ── Cover-driven ──
        case 'cover-blur':
            return (
                <Frame style={{ background: '#0a0a12' }}>
                    {coverLayer('blur(12px) saturate(1.45) brightness(0.9)')}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.25), rgba(0,0,0,.6))' }} />
                    <div className="absolute inset-0 grid place-items-center">{chip}</div>
                </Frame>
            )
        case 'cover-full':
            return (
                <Frame style={{ background: '#0a0a12' }}>
                    {coverLayer('saturate(1.1)', 1)}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.75))' }} />
                    <div className="absolute inset-0 grid place-items-center">{chip}</div>
                </Frame>
            )
        case 'spotlight':
            return (
                <Frame style={{ background: '#08070d' }}>
                    {coverLayer('blur(14px) saturate(1.5) brightness(1.05)')}
                    <div className="absolute inset-0" style={{ background: 'radial-gradient(62% 55% at 50% 32%, transparent 0%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.85) 100%)' }} />
                    <div className="absolute inset-0 grid place-items-center">{chip}</div>
                </Frame>
            )

        // ── Non-image ──
        case 'paper':
            return center(
                { background: '#F6F1E8' },
                <div
                    className="absolute inset-0"
                    style={{ opacity: 0.5, backgroundImage: 'radial-gradient(#C9BFAC 0.5px, transparent 0.6px)', backgroundSize: '4px 4px' }}
                />
            )
        case 'custom-image':
            return center({ background: 'linear-gradient(135deg,#3C4A5E,#7E6A55)' })

        // ── Legacy effects ──
        case 'particles':
            return center({
                background: '#141024',
                backgroundImage: 'radial-gradient(#8f86ff 1px, transparent 1.2px)',
                backgroundSize: '9px 9px',
            })
        case 'gradient-mesh':
            return (
                <Frame style={{ background: '#0f0a1e' }}>
                    <div
                        className="absolute inset-[-20%]"
                        style={{ background: `conic-gradient(from 40deg, ${accent}, #ec4899, #22d3ee, ${accent})`, filter: 'blur(12px)', opacity: 0.85 }}
                    />
                    <div className="absolute inset-0 grid place-items-center">{chip}</div>
                </Frame>
            )
        case 'noise':
            return center({
                background: '#2A2733',
                backgroundImage:
                    'repeating-linear-gradient(0deg,rgba(255,255,255,.14) 0 1px,transparent 1px 2px),repeating-linear-gradient(90deg,rgba(255,255,255,.09) 0 1px,transparent 1px 2px)',
            })
        case 'parallax':
            return center({ background: 'linear-gradient(#1e293b 0 45%,#334155 45% 70%,#475569 70% 100%)' })

        case 'default':
        default:
            return center({ background: '#FAFAFC' })
    }
}

/* ──────────────────────────── Layouts ──────────────────────────── */

const Bar = ({ w, c = '#15141C', o = 0.75, h = 2 }: { w: string; c?: string; o?: number; h?: number }) => (
    <div style={{ height: h, width: w, background: c, opacity: o, borderRadius: 1 }} />
)

export function LayoutPreview({ value, accent, cover }: { value: string; accent: string; cover?: string }) {
    const btn = (extra?: React.CSSProperties) => (
        <div style={{ height: 6, borderRadius: 2, background: accent, ...extra }} />
    )

    switch (value) {
        /* ─── new ─── */
        case 'stack':
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex flex-col">
                        <Art accent={accent} cover={cover} style={{ height: '52%' }} />
                        <div className="flex flex-col gap-[3px]" style={{ padding: '6px 8px' }}>
                            <Bar w="65%" />
                            <Bar w="42%" c="#6A6780" o={0.55} h={1.5} />
                        </div>
                        <div
                            className="mt-auto flex items-center justify-between"
                            style={{ background: '#fff', borderTop: '1px solid #E7E5F0', padding: '5px 8px' }}
                        >
                            <Bar w="26%" c="#15141C" o={0.8} h={2} />
                            {btn({ width: '32%' })}
                        </div>
                    </div>
                </Frame>
            )
        case 'split':
            return (
                <Frame style={{ background: '#0C0B10' }}>
                    <div className="absolute inset-0 flex">
                        <Art accent={accent} cover={cover} style={{ width: '46%' }} />
                        <div className="flex-1 flex flex-col gap-[3px]" style={{ padding: '8px' }}>
                            <Bar w="35%" c="#F1F0F6" o={0.5} h={1.5} />
                            <Bar w="72%" c="#F1F0F6" o={0.92} h={3} />
                            <Bar w="50%" c="#F1F0F6" o={0.45} h={1.5} />
                            <div style={{ height: 1, background: '#F1F0F6', opacity: 0.15, margin: '3px 0' }} />
                            {btn({ width: '52%', marginTop: 'auto' })}
                        </div>
                    </div>
                </Frame>
            )
        case 'marquee':
            return (
                <Frame style={{ background: '#0B0A0F' }}>
                    <div className="absolute inset-0 flex flex-col" style={{ padding: '7px 8px' }}>
                        <Bar w="62%" c="#F7F5FF" o={0.45} h={1.5} />
                        <div className="flex flex-col gap-[2px]" style={{ marginTop: 5 }}>
                            <Bar w="88%" c="#F7F5FF" o={0.95} h={7} />
                            <Bar w="66%" c="#F7F5FF" o={0.95} h={7} />
                        </div>
                        <div className="mt-auto flex items-end justify-between gap-2">
                            {btn({ width: '34%' })}
                            <Art accent={accent} cover={cover} style={{ width: '32%', aspectRatio: '1 / 1', borderRadius: 2 }} />
                        </div>
                    </div>
                </Frame>
            )
        case 'stub':
            return (
                <Frame style={{ background: '#EFEDF5' }}>
                    <div
                        className="absolute flex overflow-hidden"
                        style={{ inset: 7, background: '#fff', borderRadius: 3, boxShadow: '0 6px 16px -8px rgba(20,19,32,.4)' }}
                    >
                        <div className="flex-1 flex flex-col">
                            <Art accent={accent} cover={cover} style={{ height: '54%' }} />
                            <div className="flex flex-col gap-[3px]" style={{ padding: '5px 6px' }}>
                                <Bar w="70%" h={2.5} />
                                <Bar w="45%" c="#6A6780" o={0.55} h={1.5} />
                            </div>
                        </div>
                        <div style={{ width: 2, background: 'repeating-linear-gradient(180deg,#C9C6D8 0 4px,transparent 4px 8px)' }} />
                        <div
                            className="flex flex-col items-center justify-center gap-[4px]"
                            style={{ width: '27%', background: '#FBFAFD', padding: '6px 4px' }}
                        >
                            <Bar w="70%" c="#6A6780" o={0.5} h={1.5} />
                            <div style={{ width: 16, height: 16, borderRadius: 2, background: 'repeating-linear-gradient(90deg,#15141C 0 2px,#fff 2px 4px)' }} />
                            {btn({ width: '80%', height: 4 })}
                        </div>
                    </div>
                </Frame>
            )

        /* ─── existing ─── */
        case 'poster':
            return (
                <Frame>
                    <Art accent={accent} cover={cover} className="absolute inset-0" style={{ borderRadius: 0 }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(8,4,16,.88) 8%,rgba(8,4,16,.15) 55%,transparent 80%)' }} />
                    <div className="absolute left-0 right-0 bottom-0 flex flex-col items-center gap-[3px]" style={{ padding: 8 }}>
                        <Bar w="34%" c="#fff" o={0.6} h={1.5} />
                        <Bar w="62%" c="#fff" o={0.95} h={4} />
                        {btn({ width: '38%', marginTop: 2 })}
                    </div>
                </Frame>
            )
        case 'broadside':
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex flex-col">
                        <div style={{ height: '32%', background: `linear-gradient(135deg, ${accent}, ${accent}55)`, borderBottom: '2px solid #15141C' }} />
                        <div className="flex flex-col gap-[3px]" style={{ padding: '5px 7px' }}>
                            <Bar w="80%" h={6} />
                            <div style={{ display: 'flex', gap: 3, borderTop: '1.5px solid #15141C', borderBottom: '1.5px solid #15141C', padding: '2px 0' }}>
                                <Bar w="30%" c="#6A6780" o={0.7} h={1.5} />
                                <Bar w="24%" c="#6A6780" o={0.7} h={1.5} />
                                <Bar w="28%" c="#6A6780" o={0.7} h={1.5} />
                            </div>
                            {btn({ width: '100%', borderRadius: 0, marginTop: 2 })}
                        </div>
                    </div>
                </Frame>
            )
        case 'editorial':
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex gap-[6px]" style={{ padding: 7 }}>
                        <div className="flex-1 flex flex-col gap-[3px]">
                            <Bar w="55%" c="#6A6780" o={0.6} h={1.5} />
                            <Bar w="85%" h={5} />
                            <Bar w="48%" c="#6A6780" o={0.5} h={1.5} />
                            <div style={{ marginTop: 'auto', borderTop: `1.5px solid ${accent}`, paddingTop: 3 }}>{btn({ width: '54%' })}</div>
                        </div>
                        <Art accent={accent} cover={cover} style={{ width: '34%', borderRadius: 2 }} />
                    </div>
                </Frame>
            )
        case 'cinematic':
            return (
                <Frame>
                    <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${accent}, transparent 55%), linear-gradient(160deg, #1a1130, #08060f)` }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(5,3,10,0.92), transparent 62%)' }} />
                    <div className="absolute left-0 right-0 bottom-0 flex flex-col gap-[3px]" style={{ padding: 8 }}>
                        <Bar w="30%" c="#fff" o={0.5} h={1.5} />
                        <Bar w="70%" c="#fff" o={0.95} h={4} />
                        {btn({ width: '40%', borderRadius: 999, marginTop: 2 })}
                    </div>
                </Frame>
            )
        case 'boutique':
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3px]" style={{ padding: 10 }}>
                        <Bar w="30%" c="#6A6780" o={0.6} h={1.5} />
                        <div style={{ width: 14, height: 14, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, ${accent}cc, ${accent})`, margin: '2px 0' }} />
                        <Bar w="58%" h={3.5} />
                        <div style={{ width: 12, height: 1, background: '#15141C', opacity: 0.25, margin: '1px 0' }} />
                        <Bar w="42%" c="#6A6780" o={0.55} h={1.5} />
                        {btn({ width: '34%', borderRadius: 999, marginTop: 2 })}
                    </div>
                </Frame>
            )
        case 'minimal':
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex flex-col justify-center gap-[4px]" style={{ padding: '0 10px' }}>
                        <Bar w="28%" c="#6A6780" o={0.6} h={1.5} />
                        <Bar w="72%" h={5} />
                        <Bar w="50%" c="#6A6780" o={0.5} h={1.5} />
                        {btn({ width: '36%', marginTop: 3 })}
                    </div>
                </Frame>
            )
        case 'default':
        default:
            return (
                <Frame style={{ background: '#FAFAFC' }}>
                    <div className="absolute inset-0 flex gap-[6px]" style={{ padding: 7 }}>
                        <Art accent={accent} cover={cover} style={{ width: '38%', borderRadius: 2 }} />
                        <div className="flex-1 flex flex-col gap-[3px]">
                            <Bar w="52%" c="#6A6780" o={0.6} h={1.5} />
                            <Bar w="80%" h={4} />
                            <div style={{ height: 1, background: '#15141C', opacity: 0.12, margin: '2px 0' }} />
                            <div
                                className="mt-auto flex flex-col gap-[3px]"
                                style={{ border: '1px solid #E7E5F0', borderRadius: 3, padding: 4, background: '#fff' }}
                            >
                                <Bar w="55%" c="#6A6780" o={0.6} h={1.5} />
                                {btn({ width: '100%' })}
                            </div>
                        </div>
                    </div>
                </Frame>
            )
    }
}
