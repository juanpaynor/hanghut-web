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

function scopeSelector(selector: string): string {
    const s = selector.trim()
    if (!s) return s
    if (s.startsWith(SCOPE)) return s

    const rootMatch = PAGE_ROOT_SELECTOR.exec(s)
    if (rootMatch) return SCOPE + s.slice(rootMatch[0].length)

    return `${SCOPE} ${s}`
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
