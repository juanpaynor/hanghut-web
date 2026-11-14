import { createPublicClient } from '@/lib/supabase/public'
import { notFound, permanentRedirect } from 'next/navigation'
import Image from 'next/image'
import { cache } from 'react'
import { format } from 'date-fns'
import type { Metadata } from 'next'
import { MapPin, Users, CalendarDays, BadgeCheck } from 'lucide-react'
import { StoreButtons } from '@/components/landing/store-buttons'

/**
 * Public landing page for a shared hangout — /hangouts/{id}.
 *
 * Built for team_comms #380, which reported this as LIVE BREAKAGE rather than a
 * backlog item: the app's share sheet has offered "Outside HangHut" on hangout
 * cards since August and is not gated by entity type, so users have been sending
 * hanghut.com/hangouts/<id> to WhatsApp and every one of them 404'd. The app team
 * deliberately left the button visible while waiting, so the 404 was user-facing.
 *
 * Like /posts/{id}, this page only ever renders for someone WITHOUT the app —
 * with it installed, iOS/Android hand the URL straight over.
 *
 * ── ⚠ RLS IS NOT A SAFETY NET HERE. THIS FILTER IS THE ONLY GATE. ────────────
 * /posts/{id} could lean on RLS as a second, independent layer, because anon may
 * only select public posts. `tables` is NOT like that: its SELECT policy is
 * "Anyone can view non-group-only tables", so anon can already read `mystery` and
 * `followers_only` rows. 24 of 204 rows are non-public.
 *
 * So the `.eq('visibility', 'public')` below is load-bearing on its own. If it is
 * ever removed or loosened, private hangouts become publicly crawlable
 * immediately, with nothing underneath to catch it.
 *
 * `mystery` counts as non-public (#380 §4): it withholds its details until someone
 * joins, so rendering a public page for one would undo the whole feature.
 *
 * Enforced per-request, uncached, for the reason the app team gave back in #255:
 * their gate only covers links they MINT, not links this route RECEIVES. An id is
 * directly addressable, and a hangout can be flipped to followers_only long after
 * its link is already circulating. Hence force-dynamic — correctness beats a cache
 * hit on a page whose whole job is to respect a privacy setting.
 *
 * ── Location is deliberately coarse ───────────────────────────────────────────
 * `tables.latitude` and `longitude` are NOT NULL, so every row carries exact
 * coordinates, and `venue_address` is a street address. A crawlable public page
 * renders NEITHER. Only `location_name` (the meeting-point name) and `city` appear
 * — the same posture as /posts/{id}, and more necessary here because a hangout is
 * a real person at a real place at a stated time.
 *
 * ── The is_experience split ───────────────────────────────────────────────────
 * `tables` stores hangouts AND experiences behind `is_experience` (197 / 7 today).
 * That ambiguity is precisely what blocked this route for two months — the AASA
 * file says so in its own comment. #380 settled it: render when false or null,
 * redirect when true. So an id pasted under the wrong slug still lands somewhere
 * correct and neither side has to track which slug minted a link.
 */

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Deliberately selects NO coordinates and NO venue_address. Narrowing the select
 * rather than filtering in JSX means a careless future edit to the markup cannot
 * leak a column the query never fetched.
 */
const getHangout = cache(async (id: string) => {
    // Reject non-uuids before touching the DB: Postgres raises 22P02 on a
    // malformed uuid, which surfaces as a 500 rather than the 404 we want.
    if (!UUID_RE.test(id)) return null

    const supabase = createPublicClient()
    const { data } = await supabase
        .from('tables')
        .select('id, title, description, location_name, city, datetime, max_guests, current_capacity, image_url, marker_emoji, cuisine_type, status, visibility, is_experience, verified_by_hanghut, host:users!tables_host_id_fkey ( display_name, username, avatar_url, is_verified )')
        .eq('id', id)
        .maybeSingle()

    return data ?? null
})

/**
 * PostgREST returns an embedded to-one as an object, but resolves some
 * relationships to a single-element array. Normalise rather than let the host
 * silently degrade to "Someone" on the array shape — the same trap handled in
 * /posts/{id}.
 */
function host(row: any): any | null {
    const h = row?.host
    if (!h) return null
    return Array.isArray(h) ? (h[0] ?? null) : h
}

function hostName(row: any): string {
    const h = host(row)
    return h?.display_name || (h?.username ? `@${h.username}` : 'Someone')
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const row = await getHangout(id)

    // Identical response for "missing", "private" and "is an experience". Saying
    // which would confirm the id exists, the same reasoning behind 404-over-403.
    if (!row || row.is_experience === true || row.visibility !== 'public') {
        return { title: 'Hangout not found', robots: { index: false, follow: false } }
    }

    const name = hostName(row)
    const plain = (row.description || '').replace(/\s+/g, ' ').trim()
    const description = plain
        ? plain.slice(0, 157) + (plain.length > 157 ? '…' : '')
        : `${name} is hosting on HangHut. Get the app to join.`

    return {
        title: `${row.title} · HangHut`,
        description,
        // Someone's gathering is for link recipients, not search engines.
        robots: { index: false, follow: false },
        openGraph: {
            type: 'article',
            url: `/hangouts/${row.id}`,
            siteName: 'HangHut',
            title: row.title,
            description,
            images: row.image_url ? [{ url: row.image_url, width: 1200, height: 630, alt: row.title }] : [],
        },
        twitter: {
            card: row.image_url ? 'summary_large_image' : 'summary',
            title: row.title,
            description,
            images: row.image_url ? [row.image_url] : [],
        },
    }
}

export default async function PublicHangoutPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const row = await getHangout(id)

    if (!row) notFound()

    // Experiences live at their own route, which applies its own rules. Redirect
    // BEFORE the visibility check so a non-public experience is judged by that
    // page rather than silently 404'd by this one. 308 rather than the 301 #380
    // asked for: it is the modern permanent redirect and, unlike 301, is defined
    // to preserve the method. Browsers and crawlers treat both as permanent.
    if (row.is_experience === true) permanentRedirect(`/experiences/${row.id}`)

    // ⚠ THE ONLY GATE. See the header — RLS lets anon read mystery and
    // followers_only rows, so nothing catches this if it is removed.
    if (row.visibility !== 'public') notFound()

    const h = host(row)
    const name = hostName(row)
    const when = row.datetime ? new Date(row.datetime) : null
    const isPast = when ? when.getTime() < Date.now() : false
    const spotsLeft = typeof row.max_guests === 'number' && typeof row.current_capacity === 'number'
        ? Math.max(row.max_guests - row.current_capacity, 0)
        : null

    return (
        <main className="min-h-screen bg-background">
            <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">

                <article className="overflow-hidden rounded-2xl border border-border bg-card">
                    {row.image_url && (
                        <div className="relative aspect-[16/9] w-full bg-muted">
                            <Image
                                src={row.image_url}
                                alt=""
                                fill
                                sizes="(max-width: 672px) 100vw, 672px"
                                className="object-cover"
                                priority
                            />
                        </div>
                    )}

                    <div className="p-5">
                        <div className="flex items-start gap-3">
                            {row.marker_emoji && (
                                <span className="text-2xl leading-none" aria-hidden>{row.marker_emoji}</span>
                            )}
                            <div className="min-w-0">
                                {/* Plain user text rendered as text, never as HTML. */}
                                <h1 className="text-xl font-bold leading-tight">{row.title}</h1>
                                {row.cuisine_type && (
                                    <p className="mt-0.5 text-sm text-muted-foreground">{row.cuisine_type}</p>
                                )}
                            </div>
                        </div>

                        {row.description && (
                            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">
                                {row.description}
                            </p>
                        )}

                        <dl className="mt-5 space-y-2.5 text-sm">
                            {when && (
                                <div className="flex items-center gap-2.5">
                                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <dd>
                                        <time dateTime={row.datetime}>
                                            {format(when, "EEEE, d MMMM yyyy 'at' h:mm a")}
                                        </time>
                                        {isPast && (
                                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                Already happened
                                            </span>
                                        )}
                                    </dd>
                                </div>
                            )}

                            {/* Meeting-point name and city only — never the address or
                                coordinates. See the header comment. */}
                            {(row.location_name || row.city) && (
                                <div className="flex items-center gap-2.5">
                                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <dd>{[row.location_name, row.city].filter(Boolean).join(', ')}</dd>
                                </div>
                            )}

                            {spotsLeft !== null && !isPast && (
                                <div className="flex items-center gap-2.5">
                                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <dd>
                                        {spotsLeft > 0
                                            ? `${spotsLeft} of ${row.max_guests} spots left`
                                            : 'Full'}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        {/* Host */}
                        <div className="mt-5 flex items-center gap-3 border-t border-border pt-5">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                                {h?.avatar_url ? (
                                    <Image src={h.avatar_url} alt="" fill sizes="40px" className="object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">Hosted by</div>
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate font-semibold">{name}</span>
                                    {(h?.is_verified || row.verified_by_hanghut) && (
                                        <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </article>

                {/* Joining happens in the app — there is no web join flow for hangouts,
                    so this is the only call to action worth offering. */}
                <section className="mt-8 rounded-2xl border border-border bg-muted/30 p-6 text-center">
                    <h2 className="text-lg font-semibold">
                        {isPast ? 'Find your next hangout' : 'Join this hangout'}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        {isPast
                            ? 'Get the app to see what people are doing near you.'
                            : `Get the app to join ${name} and see who else is going.`}
                    </p>
                    <StoreButtons className="mt-5 justify-center" />
                </section>
            </div>
        </main>
    )
}
