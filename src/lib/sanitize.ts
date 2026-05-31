import sanitizeHtml from 'sanitize-html'

/**
 * Sanitize HTML content for safe rendering.
 * Allows a broad set of tags and preserves style/class attributes
 * so that organizer-written HTML descriptions render correctly.
 */
export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img', 'video', 'source', 'picture', 'figure', 'figcaption',
        'details', 'summary', 'sup', 'sub', 'mark', 'del', 'ins',
        'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
        'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
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
        'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedIframeHostnames: ['www.youtube.com', 'player.vimeo.com', 'www.google.com'],
}

export function sanitize(html: string): string {
    return sanitizeHtml(html, SANITIZE_OPTIONS)
}
