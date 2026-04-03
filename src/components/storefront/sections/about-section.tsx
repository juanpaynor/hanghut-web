import sanitizeHtml from 'sanitize-html'
import { cn } from '@/lib/utils'

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

    return (
        <section className="py-16 md:py-20">
            <div className={cn(
                'container mx-auto px-4',
                variant === 'centered' ? 'max-w-3xl text-center' : 'max-w-5xl'
            )}>
                <h2 className={cn(
                    'text-2xl md:text-3xl font-bold mb-6',
                    variant === 'centered'
                        ? 'bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60'
                        : ''
                )}>
                    About Us
                </h2>

                {descriptionHtml ? (
                    <div
                        className={cn(
                            'prose dark:prose-invert max-w-none prose-lg',
                            variant === 'centered' ? 'mx-auto' : ''
                        )}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(descriptionHtml) }}
                    />
                ) : (
                    <p className={cn(
                        'text-lg leading-relaxed text-muted-foreground',
                        variant === 'centered' ? 'mx-auto max-w-2xl' : ''
                    )}>
                        {description}
                    </p>
                )}
            </div>
        </section>
    )
}
