import sanitizeHtml from 'sanitize-html'

/**
 * Sanitize organizer-authored HTML (events.description_html, partner bios) for
 * safe rendering on a page that also takes payments.
 *
 * sanitize-html already blocks the JS vectors (<script>, on* handlers,
 * javascript: URLs). The additions here close the gaps that a script-free
 * payload could still walk through:
 *
 *  - `style` used to be unrestricted, so a description could fix-position an
 *    element over the whole page — including a link dressed as the buy button,
 *    at max z-index, pointing anywhere. Styles are now an allow-list of
 *    typographic/box properties; `position`, `z-index`, `inset` and the offset
 *    properties are simply not on it, so nothing in a description can leave the
 *    flow of the description block.
 *  - `background`/`background-image` accept gradients but not `url()`, so a
 *    description can't quietly load a tracking pixel from a third party.
 *  - `target="_blank"` now always carries rel="noopener noreferrer".
 *  - `id` is namespaced, so a description can't claim a page anchor the page
 *    itself uses (an `id="tickets"` would otherwise hijack "Get tickets").
 *  - iframe is finally ALLOWED. allowedAttributes and allowedIframeHostnames
 *    were configured for it but the tag was never added to allowedTags, so every
 *    YouTube embed an organizer pasted was silently deleted.
 */

/** Prefix for ids/anchors inside authored HTML, so they can't collide with the page's own. */
const AUTHORED_ID_PREFIX = 'ugc-'

/** Anything goes as a value — the safety comes from the property being on this list at all. */
const ANY = [/^.*$/]
/** Any value that does not pull a remote resource. */
const NO_URL = [/^(?!.*url\s*\().*$/i]
/** Gradients only — a fill, never a fetch. */
const GRADIENT_ONLY = [/^\s*(?:repeating-)?(?:linear|radial|conic)-gradient\(.*\)\s*$/i]

/**
 * Properties an author may set inline. Chosen to cover what organizers actually
 * use today (checked against live description_html: margins, padding, colors,
 * font-family/size/weight/style, text-align, letter-spacing, line-height,
 * borders, border-radius, max-width, opacity) with room to spare.
 *
 * NOT here, deliberately: position, z-index, inset, top/right/bottom/left,
 * float, content, cursor, pointer-events.
 */
const SAFE_STYLE_PROPERTIES = [
    // colour & type
    'color', 'opacity', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration', 'text-transform',
    'text-shadow', 'text-indent', 'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'direction',
    // box
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-width', 'border-style', 'border-color', 'border-radius',
    'box-shadow', 'outline', 'box-sizing',
    // layout — safe because none of these can escape the description block
    'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
    'gap', 'row-gap', 'column-gap',
    'align-items', 'align-self', 'justify-content', 'justify-items', 'justify-self', 'order',
    'list-style', 'list-style-type', 'list-style-position',
    // visual
    'background-color', 'background-size', 'background-position', 'background-repeat', 'background-clip',
    'filter', 'transform', 'transition', 'object-fit', 'object-position', 'aspect-ratio', 'overflow',
]

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img', 'video', 'source', 'picture', 'figure', 'figcaption',
        'details', 'summary', 'sup', 'sub', 'mark', 'del', 'ins',
        'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
        'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        // Embeds. Restricted to allowedIframeHostnames below.
        'iframe',
    ]),
    allowedAttributes: {
        '*': ['style', 'class', 'id'],
        'a': ['href', 'target', 'rel', 'name'],
        'img': ['src', 'alt', 'width', 'height', 'loading'],
        'video': ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height'],
        'source': ['src', 'type'],
        'td': ['colspan', 'rowspan'],
        'th': ['colspan', 'rowspan', 'scope'],
        'ol': ['start', 'type'],
        'li': ['value'],
        'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow', 'title', 'loading'],
    },
    allowedStyles: {
        '*': {
            ...Object.fromEntries(SAFE_STYLE_PROPERTIES.map(p => [p, ANY])),
            'background': NO_URL,
            'background-image': GRADIENT_ONLY,
        },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedIframeHostnames: [
        'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
        'player.vimeo.com', 'www.google.com',
    ],
    transformTags: {
        '*': (tagName, attribs) => {
            const next: Record<string, string> = { ...attribs }

            // Namespace authored ids so they can't shadow the page's own anchors,
            // and keep in-page links pointing at the renamed targets.
            if (next.id) next.id = AUTHORED_ID_PREFIX + next.id

            if (tagName === 'a') {
                if (next.target === '_blank') next.rel = 'noopener noreferrer'
                if (next.href?.startsWith('#')) next.href = `#${AUTHORED_ID_PREFIX}${next.href.slice(1)}`
            }

            // Embeds are below the fold in practice; never block first paint for one.
            if (tagName === 'iframe' || tagName === 'img') next.loading ??= 'lazy'

            return { tagName, attribs: next }
        },
    },
}

export function sanitize(html: string): string {
    return sanitizeHtml(html, SANITIZE_OPTIONS)
}
