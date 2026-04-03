interface DividerSectionProps {
    config: {
        style?: 'line' | 'space' | 'dots'
    }
}

export function DividerSection({ config }: DividerSectionProps) {
    const style = config.style || 'line'

    if (style === 'space') {
        return <div className="h-12 md:h-20" />
    }

    if (style === 'dots') {
        return (
            <div className="py-8 flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            </div>
        )
    }

    // Default: line
    return (
        <div className="container mx-auto px-4 py-4">
            <div className="border-t border-border" />
        </div>
    )
}
