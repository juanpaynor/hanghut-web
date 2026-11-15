interface DividerSectionProps {
    config: {
        style?: 'line' | 'space' | 'dots'
    }
}

export function DividerSection({ config }: DividerSectionProps) {
    const style = config.style || 'line'

    if (style === 'space') {
        return <div data-hh-section="divider" data-hh-divider="space" className="h-12 md:h-20" />
    }

    if (style === 'dots') {
        return (
            <div data-hh-section="divider" data-hh-divider="dots" className="py-8 flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            </div>
        )
    }

    // Default: line
    return (
        <div data-hh-section="divider" data-hh-divider="line" className="container mx-auto px-4 py-4">
            <div className="border-t border-border" />
        </div>
    )
}
