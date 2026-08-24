import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TicketQR } from '@/components/tickets/ticket-qr'
import { CalendarClock, MapPin, Package, Truck, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEventDateTime, formatEventDateTimeWithEnd } from '@/lib/datetime'
import type { Metadata } from 'next'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MerchClaim = {
    claim: {
        claim_token: string
        status: string
        fulfillment_mode: 'claim' | 'ship'
        buyer_name: string | null
        buyer_email: string | null
        shipping_address: { raw?: string } | null
        claimed_at: string | null
        created_at: string
    }
    items: { name: string; quantity: number; unit_price: number }[]
    event: { id: string; title: string; slug: string | null; start_datetime: string | null; end_datetime: string | null; venue_name: string | null } | null
    organizer: { business_name: string | null; profile_photo_url: string | null; branding: any } | null
}

function publicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

const peso = (n: number) => (n === 0 ? 'Free' : `₱${Number(n).toLocaleString()}`)

// The claim token is the credential — never let it be indexed or previewed.
export const metadata: Metadata = {
    title: 'Your merch',
    robots: { index: false, follow: false },
}

async function getClaim(token: string): Promise<MerchClaim | null> {
    const supabase = publicClient()
    const { data, error } = await supabase.rpc('get_merch_claim', { p_token: token })
    if (error || !data) return null
    return data as MerchClaim
}

export default async function MerchClaimPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    if (!UUID_RE.test(token)) notFound()

    const data = await getClaim(token)
    if (!data) notFound()

    const { claim, items, event, organizer } = data
    const accent = organizer?.branding?.colors?.primary || undefined
    const isShip = claim.fulfillment_mode === 'ship'
    const isClaimed = claim.status === 'claimed'
    const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

    // Pinned to Manila — this renders on the server (UTC) while other surfaces
    // render in the browser; without a fixed zone the same order shows two dates.
    const eventDate = event?.start_datetime ? formatEventDateTimeWithEnd(event.start_datetime, event.end_datetime) : null

    return (
        <main className="min-h-screen bg-muted/30 px-4 py-10">
            <div className="mx-auto w-full max-w-md space-y-4">

                {/* Brand header */}
                <div className="flex items-center gap-3">
                    {organizer?.profile_photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={organizer.profile_photo_url}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                        />
                    )}
                    <div className="min-w-0">
                        <p className="truncate font-semibold">{organizer?.business_name || 'HangHut'}</p>
                        <p className="text-xs text-muted-foreground">Merch order</p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">

                    {/* Status */}
                    <div
                        className={cn(
                            'flex items-center gap-2 px-5 py-3 text-sm font-medium',
                            isClaimed
                                ? 'bg-muted text-muted-foreground'
                                : 'text-primary-foreground'
                        )}
                        style={!isClaimed ? { background: accent || 'hsl(var(--primary))' } : undefined}
                    >
                        {isClaimed ? <CheckCircle2 className="h-4 w-4" /> : isShip ? <Truck className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        {isClaimed
                            ? 'Already collected'
                            : isShip
                                ? 'Order confirmed — shipping to you'
                                : 'Ready to collect'}
                    </div>

                    <div className="space-y-5 p-5">

                        {/* Items */}
                        <div className="space-y-2">
                            {items.map((item, i) => (
                                <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="min-w-0 flex-1">
                                        <span className="text-muted-foreground">{item.quantity}× </span>
                                        {item.name}
                                    </span>
                                    <span className="font-medium tabular-nums">{peso(item.unit_price * item.quantity)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between border-t pt-2 text-sm font-bold">
                                <span>Total</span>
                                <span className="tabular-nums">{peso(total)}</span>
                            </div>
                        </div>

                        {/* Claim QR, or shipping detail */}
                        {isShip ? (
                            <div className="rounded-xl bg-muted/50 p-4 text-sm">
                                <p className="mb-1 font-medium">Shipping to</p>
                                <p className="text-muted-foreground">
                                    {claim.shipping_address?.raw || 'Address on file'}
                                </p>
                            </div>
                        ) : isClaimed ? (
                            <div className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                                Collected{claim.claimed_at ? ` on ${formatEventDateTime(claim.claimed_at)}` : ''}.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="mx-auto max-w-[220px]">
                                    <TicketQR value={claim.claim_token} size={220} />
                                </div>
                                <p className="text-center text-sm text-muted-foreground">
                                    Show this code at the merch table to collect your order.
                                </p>
                            </div>
                        )}

                        {/* Event context */}
                        {event && (
                            <div className="space-y-1.5 border-t pt-4 text-sm">
                                <p className="font-medium">{event.title}</p>
                                {eventDate && (
                                    <p className="flex items-center gap-1.5 text-muted-foreground">
                                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                        {eventDate}
                                    </p>
                                )}
                                {event.venue_name && (
                                    <p className="flex items-center gap-1.5 text-muted-foreground">
                                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                                        {event.venue_name}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    Keep this link — it&apos;s your proof of purchase.
                </p>
            </div>
        </main>
    )
}
