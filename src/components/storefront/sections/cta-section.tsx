import { SectionShell } from './section-shell'

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

/**
 * One ask, made once. This used to stack two overlays — a 10%-opacity flat fill
 * plus a primary/transparent/primary horizontal gradient — which on most palettes
 * produced a muddy band rather than a deliberate block of colour. It now paints a
 * single tinted panel and lets the type do the work.
 */
export function CTASection({ config, primaryColor }: CTASectionProps) {
    const heading = config.heading
    const subheading = config.subheading
    const buttonText = config.button_text || 'Learn More'
    const buttonLink = config.button_link || '#'
    const bgColor = config.background_color || primaryColor

    if (!heading) return null

    return (
        <SectionShell rhythm="tight" width="default">
            <div
                data-hh-card
                className="relative overflow-hidden rounded-3xl border border-border/60 px-6 py-14 text-center md:px-12 md:py-20"
                style={
                    bgColor
                        ? { backgroundColor: `color-mix(in srgb, ${bgColor} 8%, transparent)` }
                        : undefined
                }
            >
                <h2
                    data-hh-section-title
                    className="mx-auto max-w-2xl text-[1.75rem] md:text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-balance"
                >
                    {heading}
                </h2>

                {subheading && (
                    <p className="mx-auto mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
                        {subheading}
                    </p>
                )}

                {buttonText && buttonLink && (
                    <a
                        href={buttonLink}
                        className="mt-8 inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-[0.9375rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        {buttonText}
                    </a>
                )}
            </div>
        </SectionShell>
    )
}
