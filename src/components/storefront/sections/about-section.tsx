import { sanitize } from '@/lib/sanitize'
import { cn } from '@/lib/utils'
import { SectionShell, SectionHeading } from './section-shell'

interface AboutSectionProps {
    config: {
        variant?: 'left-aligned' | 'centered'
    }
    description?: string | null
    descriptionHtml?: string | null
}

export function AboutSection({ config, description, descriptionHtml }: AboutSectionProps) {
    if (!descriptionHtml && !description) return null

    const variant = config.variant || 'centered'
    const centered = variant === 'centered'

    return (
        // Tight rhythm: this is context for the events below, not a destination of
        // its own, so it sits close rather than claiming a full screen.
        <SectionShell rhythm="tight" width={centered ? 'narrow' : 'default'}>
            <SectionHeading
                eyebrow="About"
                // The heading used to be "About Us" set in a foreground-to-60%
                // gradient. The gradient is gone: it reads as decoration, and it
                // fought every custom palette a partner set.
                title="Who we are"
                align={centered ? 'center' : 'left'}
            />

            {descriptionHtml ? (
                <div
                    className={cn(
                        'prose prose-neutral dark:prose-invert',
                        'prose-p:text-[1.0625rem] prose-p:leading-[1.7] prose-p:text-muted-foreground',
                        'prose-headings:tracking-[-0.01em] prose-headings:font-semibold',
                        'prose-a:underline prose-a:underline-offset-4 prose-a:decoration-border hover:prose-a:decoration-current',
                        'prose-img:rounded-xl',
                        centered ? 'mx-auto text-center' : 'max-w-[68ch]',
                    )}
                    dangerouslySetInnerHTML={{ __html: sanitize(descriptionHtml) }}
                />
            ) : (
                <p
                    className={cn(
                        'text-[1.0625rem] leading-[1.7] text-muted-foreground',
                        centered ? 'mx-auto max-w-[60ch] text-center' : 'max-w-[68ch]',
                    )}
                >
                    {description}
                </p>
            )}
        </SectionShell>
    )
}
