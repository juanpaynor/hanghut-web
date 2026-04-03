import { cn } from '@/lib/utils'

interface CTASectionProps {
    config: {
        heading?: string
        subheading?: string
        button_text?: string
        button_link?: string
        background_color?: string
    }
    primaryColor?: string
}

export function CTASection({ config, primaryColor }: CTASectionProps) {
    const heading = config.heading
    const subheading = config.subheading
    const buttonText = config.button_text || 'Learn More'
    const buttonLink = config.button_link || '#'
    const bgColor = config.background_color || primaryColor

    if (!heading) return null

    return (
        <section className="py-10 md:py-12 relative overflow-hidden">
            <div
                className="absolute inset-0 opacity-10"
                style={bgColor ? { backgroundColor: bgColor } : undefined}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />

            <div className="container mx-auto px-4 relative z-10 text-center max-w-3xl">
                <h2 className="text-2xl md:text-3xl font-bold mb-2">{heading}</h2>
                {subheading && (
                    <p className="text-base text-muted-foreground mb-6 max-w-xl mx-auto">{subheading}</p>
                )}
                {buttonText && buttonLink && (
                    <a
                        href={buttonLink}
                        className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity shadow-md"
                    >
                        {buttonText}
                    </a>
                )}
            </div>
        </section>
    )
}
