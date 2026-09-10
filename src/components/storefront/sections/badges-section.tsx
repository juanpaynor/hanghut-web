import { cn } from '@/lib/utils'
import { describeCriteria, type PublicBadge } from '@/lib/badges/public-actions'
import { SectionShell, SectionHeading } from './section-shell'

/**
 * Badges a visitor can collect from this organizer.
 *
 * Opt-in: the section only renders when the organizer adds it AND has at least
 * one active badge. It is never appended automatically — a page that suddenly
 * advertises rewards the organizer didn't choose to promote is worse than one
 * that says nothing.
 *
 * Metal tiers are rendered as their metals rather than as generic accent chips,
 * because the tier IS the reward's rank and reading it at a glance is the point.
 */

const TIER_STYLE: Record<string, { ring: string; plate: string; ink: string; label: string }> = {
    bronze: {
        ring: 'ring-[#b87333]/25',
        plate: 'bg-[#c98a4b]',
        ink: 'text-[#7a4a1d] dark:text-[#e0a86a]',
        label: 'Bronze',
    },
    silver: {
        ring: 'ring-[#9aa3ad]/30',
        plate: 'bg-[#b9c1c9]',
        ink: 'text-[#5b646d] dark:text-[#c8d0d8]',
        label: 'Silver',
    },
    gold: {
        ring: 'ring-[#d4a017]/30',
        plate: 'bg-[#e3b53f]',
        ink: 'text-[#8a6608] dark:text-[#f0cd6d]',
        label: 'Gold',
    },
    platinum: {
        ring: 'ring-[#7fb3c8]/30',
        plate: 'bg-[#cfe3ea]',
        ink: 'text-[#3f6f81] dark:text-[#a9d3e2]',
        label: 'Platinum',
    },
}

interface BadgesSectionProps {
    config: {
        heading?: string
        subheading?: string
        variant?: 'grid' | 'row'
        show_holder_count?: boolean
    }
    badges: PublicBadge[]
    partnerName: string
}

export function BadgesSection({ config, badges, partnerName }: BadgesSectionProps) {
    if (!badges || badges.length === 0) return null

    const variant = config.variant || 'grid'
    const showCount = config.show_holder_count !== false

    return (
        <SectionShell rhythm="default" id="badges">
            <SectionHeading
                eyebrow="Rewards"
                title={config.heading || 'Badges to collect'}
                description={
                    config.subheading ||
                    `Earn these on your profile by turning up for ${partnerName}.`
                }
            />

            <ul
                className={cn(
                    'grid gap-4',
                    variant === 'row'
                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
                )}
            >
                {badges.map((badge) => {
                    const tier = TIER_STYLE[badge.tier] ?? TIER_STYLE.bronze
                    const how = describeCriteria(badge.criteria)

                    return (
                        <li
                            key={badge.id}
                            data-hh-card
                            className="group relative flex gap-4 rounded-2xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
                        >
                            <div
                                className={cn(
                                    'relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-4',
                                    tier.ring,
                                )}
                            >
                                {badge.art_url ? (
                                    <img
                                        src={badge.art_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div
                                        className={cn(
                                            'flex h-full w-full items-center justify-center text-lg font-semibold text-black/55',
                                            tier.plate,
                                        )}
                                    >
                                        {badge.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p
                                    className={cn(
                                        'text-[10px] font-semibold uppercase tracking-[0.16em]',
                                        tier.ink,
                                    )}
                                >
                                    {tier.label}
                                </p>
                                <h3 className="mt-1 text-[0.9375rem] font-semibold leading-snug text-balance">
                                    {badge.name}
                                </h3>

                                {badge.description && (
                                    <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
                                        {badge.description}
                                    </p>
                                )}

                                {how && (
                                    <p className="mt-3 text-[0.8125rem] font-medium">{how}</p>
                                )}

                                {showCount && badge.holder_count > 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                        {badge.holder_count.toLocaleString()}{' '}
                                        {badge.holder_count === 1 ? 'person has' : 'people have'} this
                                    </p>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ul>
        </SectionShell>
    )
}
