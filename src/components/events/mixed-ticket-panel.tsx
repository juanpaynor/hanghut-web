import type { ReactNode } from 'react'
import { Armchair, Ticket } from 'lucide-react'

interface SeatedTierSummary {
    id: string
    name: string
    price: number | string
}

/**
 * Buy box for an event that sells BOTH general admission by quantity and
 * seat-mapped tiers through the picker -- a festival with GA + Early Bird GA
 * alongside VIP A/B/C.
 *
 * Pure layout. It takes the two purchase surfaces already rendered, so the GA
 * side stays the real RegistrationGate (keeping registration questions,
 * approval, invite-only, subscriber pricing and RSVP exactly as they are) and
 * the seated side stays the real SeatPickerLauncher. Nothing here reimplements
 * either, and no checkout logic lives in this file: each side continues down
 * its own existing flow, one order per tier.
 *
 * Either slot may be absent. A mixed event whose GA tiers are all sold out or
 * locked still sells seats, and vice versa -- so this renders whichever halves
 * are live rather than assuming both.
 */
export function MixedTicketPanel({
    gaSlot,
    seatSlot,
    seatedTiers,
}: {
    gaSlot?: ReactNode
    seatSlot?: ReactNode
    seatedTiers: SeatedTierSummary[]
}) {
    const both = !!gaSlot && !!seatSlot
    const money = (n: number | string) =>
        Number(n) === 0 ? 'Free' : `₱${Number(n).toLocaleString()}`

    return (
        <div className="space-y-5">
            {gaSlot && (
                <section>
                    {/* The heading only earns its space when there is a second
                        option to tell it apart from. */}
                    {both && (
                        <header className="mb-3 flex items-center gap-2">
                            <Ticket className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <h3 className="text-sm font-semibold tracking-tight">
                                General admission
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                · choose a quantity
                            </span>
                        </header>
                    )}
                    {gaSlot}
                </section>
            )}

            {both && (
                <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        or
                    </span>
                    <span className="h-px flex-1 bg-border" />
                </div>
            )}

            {seatSlot && (
                <section>
                    {both && (
                        <header className="mb-3 flex items-center gap-2">
                            <Armchair className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <h3 className="text-sm font-semibold tracking-tight">
                                Reserved seating
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                · pick your seat
                            </span>
                        </header>
                    )}

                    {/* Named with prices, because the seat map is behind a click:
                        without this the buyer cannot see what reserved seating
                        costs before committing to open it. */}
                    {both && seatedTiers.length > 0 && (
                        <ul className="mb-3 space-y-1.5">
                            {seatedTiers.map(t => (
                                <li
                                    key={t.id}
                                    className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                    <span className="min-w-0 truncate text-muted-foreground">
                                        {t.name}
                                    </span>
                                    <span className="shrink-0 font-semibold tabular-nums">
                                        {money(t.price)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {seatSlot}
                </section>
            )}

            {/* Stated plainly rather than discovered at checkout. Unified
                mixed-cart checkout is a separate project; until then two
                categories mean two orders. */}
            {both && (
                <p className="text-center text-xs text-muted-foreground">
                    General admission and reserved seats are bought separately.
                </p>
            )}
        </div>
    )
}
