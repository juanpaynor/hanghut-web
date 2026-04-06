'use client'

export function EmbedThemeWrapper({
    children,
    primaryColor,
    bgColor,
    textColor,
}: {
    children: React.ReactNode
    primaryColor?: string
    bgColor?: string
    textColor?: string
}) {
    const style: Record<string, string> = {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        minHeight: '100%',
    }

    if (primaryColor) style['--embed-primary'] = `#${primaryColor.replace('#', '')}`
    if (bgColor) {
        style['--embed-bg'] = `#${bgColor.replace('#', '')}`
        style.backgroundColor = style['--embed-bg']
    }
    if (textColor) {
        style['--embed-text'] = `#${textColor.replace('#', '')}`
        style.color = style['--embed-text']
    }

    return <div style={style}>{children}</div>
}
