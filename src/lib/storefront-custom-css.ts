import postcss, { type AtRule } from 'postcss'

/**
 * Custom-CSS support for event pages and partner storefronts (HelixPay-style skin).
 *
 * Stored in events.layout_config.custom_css / partners.branding.custom_css and
 * injected into the public page as a <style> tag.
 *
 * The old version only stripped </style> and capped the length, with a comment
 * saying rules are "conventionally scoped" under [data-hh-theme]. Convention was
 * doing all the work: a <style> tag is global, so `body { display: none }` or
 * `header { display: none }` reached straight past the skin into the rest of the
 * page, and `@import url(...)` let a reviewed skin fetch different rules later.
 *
 * Now the scope is ENFORCED. Every selector is parsed and rewritten so it can
 * only match inside the page's own [data-hh-theme] root:
 *
 *   body { ... }              ->  [data-hh-theme] { ... }
 *   #tickets button { ... }   ->  [data-hh-theme] #tickets button { ... }
 *   [data-hh-event] { ... }   ->  [data-hh-theme][data-hh-event] { ... }
 *   [data-hh-theme] h1 { .. } ->  unchanged (already scoped)
 *
 * Skins written to the documented convention come through byte-identical, so
 * this is a no-op for every skin already live. @import is dropped outright.
 *
 * CSS still can't execute JS, and an organizer can still make their OWN page
 * ugly or unusable — that is their page to ruin. What they can no longer do is
 * reach outside it.
 */

/** Both the event page root and the storefront root carry this attribute. */
const SCOPE = '[data-hh-theme]'

/** Generous ceiling; a skin bigger than this is a mistake, not a design. */
const MAX_CSS_LENGTH = 40_000

/**
 * `html`, `body` and `:root` can't be reached from inside the scope, but an
 * author writing them means "the page" — so map them ONTO the scope root rather
 * than prefixing them into a selector that silently matches nothing.
 */
const PAGE_ROOT_SELECTOR = /^(?::root|html|body)\b/
const EVENT_ROOT_SELECTOR = /^\[data-hh-event\]/

function scopeSelector(selector: string): string {
    const s = selector.trim()
    if (!s) return s
    if (s.startsWith(SCOPE)) return s

    // Both attributes belong to the same root, not nested elements. Keep the
    // event hook so an event skin cannot accidentally target a storefront.
    if (EVENT_ROOT_SELECTOR.test(s)) return SCOPE + s

    const rootMatch = PAGE_ROOT_SELECTOR.exec(s)
    if (rootMatch) return SCOPE + s.slice(rootMatch[0].length)

    return `${SCOPE} ${s}`
}

/**
 * The ONE host a skin may pull a stylesheet from.
 *
 * sanitizeCustomCss drops every @import, for a good reason: a remote stylesheet
 * can be swapped for different rules after anyone reviews the skin. But that
 * also silently killed the common legitimate case — an organizer importing a
 * Google font — and when the design preview skipped sanitizing, the font
 * rendered while they were designing and vanished once live. Axiom's
 * "BLOOD & GLAM" was built on Cinzel Decorative and shipped in a fallback serif.
 *
 * Google Fonts can only ever answer with @font-face rules pointing at
 * fonts.gstatic.com. It cannot deliver a selector that touches our page, so the
 * swap risk that justified dropping @import does not apply to this host.
 *
 * These URLs are emitted by the page as <link rel="stylesheet">, which is also
 * strictly better than an @import: it loads in parallel instead of blocking on
 * the parent sheet, and @import only works as the first rule in a stylesheet —
 * a position nothing can guarantee once the CSS is scoped and concatenated.
 */
const FONT_HOST = 'fonts.googleapis.com'

/** `@import url('x')`, `@import url(x)`, `@import "x"` — all three spellings. */
const IMPORT_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)|^\s*['"]([^'"]+)['"]/

/**
 * Font stylesheet URLs an organizer's custom CSS asks for, filtered to the one
 * allowed host. Returned so the caller can emit them as <link> tags; the
 * @import rules themselves are still stripped from the CSS by sanitizeCustomCss.
 */
export function extractCustomCssFontUrls(css: string | null | undefined): string[] {
    if (!css) return []
    const out: string[] = []
    try {
        const root = postcss.parse(css.slice(0, MAX_CSS_LENGTH))
        root.walkAtRules('import', rule => {
            const m = IMPORT_URL.exec(rule.params.trim())
            const raw = (m?.[1] ?? m?.[2] ?? '').trim()
            if (!raw) return
            let u: URL
            try { u = new URL(raw) } catch { return }   // relative/malformed: ignore
            if (u.protocol !== 'https:') return
            if (u.hostname !== FONT_HOST) return
            out.push(u.toString())
        })
    } catch {
        return []
    }
    return [...new Set(out)]
}

/**
 * Enforce the scope, drop @import, and cap the size. Returns '' for CSS that
 * can't be parsed — injecting a stylesheet we don't understand is exactly the
 * thing this function exists to prevent.
 */
export function sanitizeCustomCss(css: string | null | undefined): string {
    if (!css) return ''

    // Still strip tag-breakouts first: this runs before parsing, and postcss
    // would happily carry `</style>` through inside a string or comment.
    const stripped = css.replace(/<\/?(style|script)\b[^>]*>/gi, '').slice(0, MAX_CSS_LENGTH)
    if (!stripped.trim()) return ''

    try {
        const root = postcss.parse(stripped)

        // A remote stylesheet can be swapped after anyone reviews this skin.
        root.walkAtRules('import', rule => { rule.remove() })

        root.walkRules(rule => {
            // Keyframe steps ('0%', 'from') are not selectors — prefixing them
            // produces an animation that never runs.
            const parent = rule.parent
            if (parent?.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) return
            // Nested rules inherit their parent's scope already.
            if (parent?.type === 'rule') return

            rule.selectors = rule.selectors.map(scopeSelector)
        })

        return root.toString()
    } catch {
        return ''
    }
}

/** Review AI output against the same CSS the public page renders. This checks
 * syntax, targets and scale, not visual quality or colour contrast.
 *
 * `previous` is what the organizer already had, so the review can tell an EDIT
 * from a REWRITE. That distinction is the whole point of this check. */
export function reviewCustomCss(
    css: string,
    previewDocument?: Document | null,
    previous?: string | null,
): { error?: string; warning?: string } {
    const sanitized = sanitizeCustomCss(css)
    if (!sanitized.trim()) return { error: 'The generated styles could not be applied. Try generating again.' }

    /**
     * The model is told to return the COMPLETE stylesheet, not a patch. One that
     * summarises instead of editing passes every other check in here: the CSS
     * it returns is valid, scoped and matches the page -- it has just thrown
     * away most of the organizer's work.
     *
     * That is the expensive failure. Applying it is one click, "Add to the end"
     * no longer exists for CSS, and Undo is a single in-memory step that does
     * not survive a reload. Axiom's skin is 20,533 characters of hand-tuning;
     * losing it to a model that felt like being brief is not recoverable.
     *
     * Both sides are sanitized before measuring. Scoping REWRITES selectors and
     * usually makes CSS longer, so comparing raw input against sanitized output
     * would read as growth and hide a real shrink.
     */
    const before = sanitizeCustomCss(previous).trim().length
    const after = sanitized.trim().length
    if (before > 400 && after < before * 0.6) {
        const lost = Math.round((1 - after / before) * 100)
        return {
            warning: `This replaces your stylesheet with one about ${lost}% smaller, so it has probably dropped styles you already had. Check the preview, and use Undo if anything is missing.`,
        }
    }

    let ruleCount = 0
    let unmatchedCount = 0
    const root = postcss.parse(sanitized)
    root.walkRules(rule => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as AtRule).name)) return
        // Nested selectors need their parent's context; leave them to the browser.
        if (rule.parent?.type === 'rule') return
        ruleCount++
        if (!previewDocument?.querySelector(SCOPE)) return
        const matches = rule.selectors.some(selector => {
            // A hover/focus or pseudo-element rule can apply even when the
            // preview isn't in that state. Check its underlying element.
            const target = selector
                .replace(/::[\w-]+(?:\([^)]*\))?/g, '')
                .replace(/:(?:hover|active|focus-visible|focus-within|focus|visited)\b/g, '')
            try { return !!previewDocument.querySelector(target) } catch { return false }
        })
        if (!matches) unmatchedCount++
    })
    if (!ruleCount) return { error: 'The AI did not return any page styles. Try a more specific request.' }
    // Reached only when the stylesheet did not shrink: losing existing work is
    // the worse outcome, so that warning wins the single slot.
    if (unmatchedCount) return {
        warning: unmatchedCount === ruleCount
            ? 'These styles do not match anything in the current preview. Try describing the part you want to change.'
            : 'Some styles do not match this layout. Check the preview before saving.',
    }
    return {}
}
