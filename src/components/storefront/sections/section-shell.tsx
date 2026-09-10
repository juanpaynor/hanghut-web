import { cn } from '@/lib/utils'

/**
 * Shared rhythm and heading treatment for storefront sections.
 *
 * Every section used to open with `py-16 md:py-20` and a `text-2xl md:text-3xl`
 * heading with a primary-coloured lucide icon beside it. Uniform padding gives a
 * page no hierarchy — the reader gets no signal about what matters — and the
 * icon-beside-heading is the most templated thing on the page. Sections now pick
 * a rhythm that matches their weight, and headings carry an eyebrow instead of
 * an icon, which labels the section without competing with the title.
 */

type Rhythm = 'tight' | 'default' | 'generous'

const RHYTHM: Record<Rhythm, string> = {
    /** Supporting material — about, stats, dividers. Sits close to its neighbours. */
    tight: 'py-12 md:py-16',
    /** The default for most content. */
    default: 'py-16 md:py-24',
    /** The page's main event. Earns the air around it. */
    generous: 'py-20 md:py-32',
}

const WIDTH = {
    narrow: 'max-w-3xl',
    default: 'max-w-6xl',
    wide: 'max-w-7xl',
}

interface SectionShellProps {
    children: React.ReactNode
    rhythm?: Rhythm
    width?: keyof typeof WIDTH
    className?: string
    id?: string
}

export function SectionShell({
    children,
    rhythm = 'default',
    width = 'default',
    className,
    id,
}: SectionShellProps) {
    return (
        <section id={id} className={cn(RHYTHM[rhythm], className)}>
            <div className={cn('container mx-auto px-4 sm:px-6', WIDTH[width])}>
                {children}
            </div>
        </section>
    )
}

interface SectionHeadingProps {
    /** Small label above the title. Names the section so the title doesn't have to. */
    eyebrow?: string
    title: string
    /** One line under the title. Keep it short — it competes with the content. */
    description?: string
    /** Right-aligned slot: a count, a link, a filter. */
    action?: React.ReactNode
    align?: 'left' | 'center'
    className?: string
}

export function SectionHeading({
    eyebrow,
    title,
    description,
    action,
    align = 'left',
    className,
}: SectionHeadingProps) {
    const centered = align === 'center'

    return (
        <div
            className={cn(
                'mb-10 md:mb-14',
                centered
                    ? 'text-center max-w-2xl mx-auto'
                    : action
                        ? 'flex flex-wrap items-end justify-between gap-x-6 gap-y-3'
                        : '',
                className,
            )}
        >
            <div className={centered ? '' : 'min-w-0'}>
                {eyebrow && (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2.5">
                        {eyebrow}
                    </p>
                )}
                <h2
                    data-hh-section-title
                    className="text-[1.75rem] leading-[1.15] md:text-[2.125rem] font-semibold tracking-[-0.02em] text-balance"
                >
                    {title}
                </h2>
                {description && (
                    <p
                        className={cn(
                            'mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground',
                            centered ? 'mx-auto max-w-xl' : 'max-w-xl',
                        )}
                    >
                        {description}
                    </p>
                )}
            </div>
            {action && !centered && <div className="shrink-0">{action}</div>}
        </div>
    )
}
