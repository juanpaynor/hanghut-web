import { Extension } from '@tiptap/core'

/**
 * Keep inline styles alive through the Visual tab.
 *
 * Tiptap is schema-based: it parses incoming HTML into a ProseMirror document
 * and silently discards anything the schema doesn't declare. StarterKit
 * declares no `style` attribute, so loading an email template into the Visual
 * tab stripped every colour, padding value and button style — and because
 * onUpdate writes `editor.getHTML()` straight back to the parent, the stripped
 * version was what got SAVED. The styling wasn't hidden, it was destroyed.
 *
 * This declares `style` (and the email-relevant layout attributes) as a global
 * attribute on the node types an email body actually uses, so they survive the
 * round trip.
 *
 * SCOPE — verified by round-tripping real AI output through a headless editor:
 * this rescues styles on NODES (paragraphs, headings, lists, images). It cannot
 * rescue the styled <a> that every marketing email uses as its call-to-action.
 * Tiptap v3's Link mark renders a fixed attribute set, and neither
 * addGlobalAttributes('link') nor Link.extend({ addAttributes }) survives the
 * round trip — both were tried and both dropped it.
 *
 * So button-styled HTML must be kept OUT of the Visual tab rather than repaired
 * on the way through — see isComplexEmailHtml.
 */

const STYLED_TYPES = [
    'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
    'blockquote', 'horizontalRule', 'image', 'hardBreak', 'codeBlock',
]

export const PreserveStyles = Extension.create({
    name: 'preserveStyles',

    addGlobalAttributes() {
        return [
            {
                types: STYLED_TYPES,
                attributes: {
                    style: {
                        default: null,
                        parseHTML: (element: HTMLElement) => element.getAttribute('style'),
                        renderHTML: (attributes: Record<string, any>) =>
                            attributes.style ? { style: attributes.style } : {},
                    },
                    align: {
                        default: null,
                        parseHTML: (element: HTMLElement) => element.getAttribute('align'),
                        renderHTML: (attributes: Record<string, any>) =>
                            attributes.align ? { align: attributes.align } : {},
                    },
                },
            },
        ]
    },
})

/**
 * True when the HTML holds something the Visual tab would silently destroy.
 *
 * Two cases, both verified rather than assumed:
 *   1. <table> layout — no table extension is loaded, so the whole structure is
 *      flattened into a few bare paragraphs. Email templates are table-based
 *      because that is what mail clients support, so this is most of them.
 *   2. A styled <a> — the call-to-action button. Its style attribute cannot be
 *      preserved through Tiptap's Link mark (see above), so a pill button goes
 *      in and a plain blue underlined link comes out.
 *
 * Callers open in HTML instead, and say why.
 */
export function isComplexEmailHtml(html: string): boolean {
    if (!html) return false
    if (/<\s*(table|tr|td|th|tbody|thead)\b/i.test(html)) return true
    // A styled anchor — the CTA. Matches style= appearing inside an <a ...> tag.
    return /<a\b[^>]*\sstyle\s*=/i.test(html)
}
