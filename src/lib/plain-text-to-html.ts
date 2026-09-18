/**
 * Convert plain text that uses real newlines into simple HTML.
 *
 * Newlines are insignificant whitespace in HTML, so handing a plain-text
 * description straight to a rich-text editor silently collapses every
 * paragraph into one run-on block — the author's formatting is gone before
 * they have typed anything, and their next save writes the collapsed version
 * back over the good plain text.
 *
 * Blank lines become paragraphs; single newlines become <br>.
 */
const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

/** Tags common enough in an authored description to mean "this is already HTML". */
const LOOKS_LIKE_HTML = /<(?:p|div|br|h[1-6]|ul|ol|li|strong|em|b|i|a|img|blockquote)\b[^>]*>/i

export function plainTextToHtml(text: string | null | undefined): string {
    if (!text) return ''
    // Already markup — pass through untouched rather than escaping it into
    // visible angle brackets.
    if (LOOKS_LIKE_HTML.test(text)) return text

    return text
        .replace(/\r\n?/g, '\n')
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => {
            const escaped = block.replace(/[&<>]/g, c => ESCAPE[c])
            return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
        })
        .join('')
}
