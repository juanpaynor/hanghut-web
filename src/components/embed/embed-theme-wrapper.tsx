'use client'

export type EmbedTheme = 'light' | 'dark' | 'auto'

// Default palettes. Explicit data-bg-color / data-text-color always win over these.
const DARK = { bg: '#0d0d0f', text: '#ededed' }
const LIGHT = { bg: '#ffffff', text: '#111111' }

export function EmbedThemeWrapper({
    children,
    primaryColor,
    bgColor,
    textColor,
    theme = 'light',
    radius,
    fontCss,
    fontUrl,
}: {
    children: React.ReactNode
    primaryColor?: string
    bgColor?: string
    textColor?: string
    theme?: EmbedTheme
    /** Corner radius in px for the card and its buttons. embed.js has always
     *  sent data-border-radius through as `radius`, and both embed pages
     *  declared it in their searchParams type and then never read it — an
     *  accepted-and-discarded knob. It is wired up here. */
    radius?: string
    /** Resolved CSS font-family, e.g. "'Bebas Neue', cursive". */
    fontCss?: string
    /** Google Fonts stylesheet for that face, when it needs loading. */
    fontUrl?: string
}) {
    const hex = (v?: string) => (v ? `#${v.replace('#', '')}` : undefined)

    const style: Record<string, string> = {
        fontFamily: fontCss
            ? `${fontCss}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
            : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: '100%',
    }

    if (primaryColor) style['--embed-primary'] = hex(primaryColor)!

    // Clamped: a publisher pasting data-border-radius="9999" should get a pill,
    // not a layout that collapses in on itself, and a negative value is not a
    // thing CSS can honour.
    const r = Number(radius)
    if (Number.isFinite(r)) style['--embed-radius'] = `${Math.min(Math.max(r, 0), 32)}px`

    // Theme defaults (skipped for 'auto' — handled by the media-query <style> below).
    if (theme === 'dark') {
        style['--embed-bg'] = DARK.bg
        style['--embed-text'] = DARK.text
    }

    // Explicit colors override the theme defaults.
    if (bgColor) style['--embed-bg'] = hex(bgColor)!
    if (textColor) style['--embed-text'] = hex(textColor)!

    if (style['--embed-bg']) style.backgroundColor = style['--embed-bg']
    if (style['--embed-text']) style.color = style['--embed-text']

    // 'auto' follows the host site's light/dark preference. Inline styles can't hold
    // media queries, so we scope CSS vars to a class and let the media query set them.
    // Inline explicit colors (above) still win over this stylesheet.
    const isAuto = theme === 'auto'

    return (
        <div className={isAuto ? 'hh-embed-auto' : undefined} style={style}>
            {/* The face has to come down with the frame: this document is the
                widget, so there is no host stylesheet to inherit from.
                `precedence` hoists it to <head> rather than leaving a
                stylesheet sitting in the body. */}
            {fontUrl && <link rel="stylesheet" href={fontUrl} precedence="default" />}
            {isAuto && (
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
                            .hh-embed-auto { --embed-bg:${LIGHT.bg}; --embed-text:${LIGHT.text}; }
                            @media (prefers-color-scheme: dark) {
                                .hh-embed-auto { --embed-bg:${DARK.bg}; --embed-text:${DARK.text}; background-color:${DARK.bg}; color:${DARK.text}; }
                            }
                        `,
                    }}
                />
            )}
            {children}
        </div>
    )
}
