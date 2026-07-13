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
}: {
    children: React.ReactNode
    primaryColor?: string
    bgColor?: string
    textColor?: string
    theme?: EmbedTheme
}) {
    const hex = (v?: string) => (v ? `#${v.replace('#', '')}` : undefined)

    const style: Record<string, string> = {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: '100%',
    }

    if (primaryColor) style['--embed-primary'] = hex(primaryColor)!

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
