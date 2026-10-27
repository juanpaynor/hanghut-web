import { useEffect, type RefObject } from 'react'

/**
 * Grow a textarea to fit its content, up to a ceiling.
 *
 * A composer with a fixed `rows` wraps text but cannot show it: past the last
 * visible row the author is typing into a scrolling slot and can no longer see
 * the start of their own message. That is where long replies get sloppy.
 *
 * Deliberately not the CSS `field-sizing: content` one-liner -- that is
 * Chromium-only plus very recent Safari, and a good chunk of our traffic is
 * neither. This works everywhere.
 *
 * Returns nothing: it writes `height` on the element, so the caller should
 * keep `resize-none` and leave height out of its classes.
 */
export function useAutogrowTextarea(
    ref: RefObject<HTMLTextAreaElement | null>,
    value: string,
    maxPx = 320,
) {
    useEffect(() => {
        const el = ref.current
        if (!el) return
        // Collapse first, or scrollHeight only ever reports the taller of the
        // content and the height we last set, and the box can never shrink.
        el.style.height = 'auto'
        const next = Math.min(el.scrollHeight, maxPx)
        el.style.height = `${next}px`
        el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden'
    }, [ref, value, maxPx])
}
