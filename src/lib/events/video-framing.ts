/**
 * Where a hero/background video sits inside its box.
 *
 * The organizer pans and zooms the video in the Design tab, which saves a
 * string like `scale:1.20|x:77|y:32` into layout_config.video_position. Turning
 * that back into CSS existed as two byte-identical copies — the event page's
 * hero and the storefront hero — and a third surface needed it, so it lives
 * here once instead.
 *
 * That duplication was not harmless. The video BACKGROUND (event-bg.tsx, used
 * by the `poster` page layout) had no copy at all and simply ignored the
 * framing, and the storefront hero passed the raw `scale:...|x:...|y:...`
 * string straight into `objectPosition`, where it is not valid CSS and is
 * dropped — so the zoom never applied on either. Both looked correct in the
 * Design-tab preview and wrong on the live page.
 *
 * No 'use server' — pure, used on both sides.
 */

export interface VideoFraming {
    /** CSS object-position. */
    objectPosition: string
    /** CSS transform carrying the zoom, or 'none'. */
    transform: string
}

/**
 * Three formats, oldest last:
 *   `scale:1.20|x:77|y:32`  current — pan plus zoom
 *   `center 50%` / `40% 60%` legacy percentage pair
 *   `top` / `bottom`         legacy keyword
 */
export function parseVideoFraming(raw: string | null | undefined): VideoFraming {
    const v = (raw ?? '').trim()
    if (!v) return { objectPosition: 'center 50%', transform: 'none' }

    if (v.includes('scale:')) {
        let s = 1.0, x = 50, y = 50
        for (const part of v.split('|')) {
            const [k, val] = part.split(':')
            const n = parseFloat(val)
            if (!Number.isFinite(n)) continue
            if (k === 'scale') s = n
            else if (k === 'x') x = n
            else if (k === 'y') y = n
        }
        return { objectPosition: `${x}% ${y}%`, transform: `scale(${s})` }
    }
    if (v.includes('%')) return { objectPosition: v, transform: 'none' }      // legacy pair
    if (v === 'top') return { objectPosition: 'center 0%', transform: 'none' }
    if (v === 'bottom') return { objectPosition: 'center 100%', transform: 'none' }

    return { objectPosition: 'center 50%', transform: 'none' }
}
