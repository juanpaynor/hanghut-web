import { createPublicClient } from '@/lib/supabase/public'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Calendar, MapPin, Share2, ShieldCheck, Ticket, Phone, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import { SeatPickerLauncher } from '@/components/events/seat-picker-launcher'
import { EventGallery } from '@/components/events/event-gallery'
import { RegistrationGate } from '@/components/events/registration-gate'
import { Reveal } from '@/components/events/reveal'
import { EventInviteResponse } from '@/components/events/event-invite-response'
import { getEventInviteByToken } from '@/lib/organizer/event-invite-actions'
import type { QuestionForForm } from '@/components/events/registration-questions-form'
import { cn, hexToHsl, getYouTubeEmbedUrl } from '@/lib/utils'
import { formatEventDateTime, formatEventDate, formatEventTime, formatInManila } from '@/lib/datetime'

import { MobileTicketButton, ShareButton, AddToCalendarButton } from '@/components/events/event-actions'
import { EventViewTracker } from '@/components/events/event-view-tracker'
import { CaptureAttribution } from '@/components/tracking/track-view'
import { MerchSection } from '@/components/merch/merch-section'
import { getPublicMerch } from '@/lib/merch/public-actions'
import { sanitize } from '@/lib/sanitize'
import { EventPageBackground, type BgStyle } from '@/components/events/event-bg'
import { getEventThemeCss } from '@/lib/event-themes'
import { getEventLayoutCss } from '@/lib/event-layouts'
import { sanitizeCustomCss } from '@/lib/storefront-custom-css'
import { StorefrontPreviewBridge } from '@/components/organizer/storefront-preview-bridge'
import { EventCountdown } from '@/components/events/event-countdown'
import { SocialProofTicker } from '@/components/events/social-proof-ticker'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/slug'
import { cache } from 'react'
import { LoginNudge } from '@/components/shared/login-nudge'

export const dynamic = 'force-dynamic' // always fresh — bg style changes show immediately

/**
 * Resolve a retired slug to its event, so renamed events redirect instead of 404.
 */
const getEventIdByRetiredSlug = cache(async (slug: string) => {
    const supabase = createPublicClient()
    const { data } = await supabase
        .from('event_slug_history')
        .select('event_id')
        .eq('slug', slug)
        .maybeSingle()

    return data?.event_id ?? null
})

const getEvent = cache(async (idOrSlug: string, allowAnyStatus = false) => {
    const supabase = createPublicClient()

    let query = supabase
        .from('events')
        .select(`
      *,
      organizer:partners!events_organizer_id_fkey(
        id,
        business_name,
        verified,
        profile_photo_url,
        slug,
        contact_number,
        branding
      ),
      ticket_tiers(*),
      registration_questions(*)
    `)

    // Legacy links carry the UUID, new links carry the slug — both must resolve.
    // UUIDs are already out in sent emails, the sitemap and referral redirects,
    // so they stay valid permanently.
    query = isUuid(idOrSlug) ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug)

    // Public visitors only see live/unlisted events. Owner preview (below) may
    // pass allowAnyStatus to render a draft in the Design-tab preview iframe.
    if (!allowAnyStatus) query = query.in('status', ['active', 'hidden'])

    const { data: event, error } = await query.single()

    if (error || !event) {
        return null
    }

    // Use the DB column directly — triggers keep it up to date
    // Only fall back to admin count if tickets_sold looks stale (0 but has tiers with sales)
    let totalSold = event.tickets_sold ?? 0
    const tiersSold = (event.ticket_tiers || []).reduce((sum: number, t: any) => sum + (t.quantity_sold || 0), 0)
    if (tiersSold > totalSold) {
        totalSold = tiersSold
    }

    return {
        ...event,
        tickets_sold: totalSold,
    }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const event = await getEvent(id)

    if (!event) return { title: 'Event Not Found' }

    const organizer = (event as any).organizer
    const orgName = organizer?.business_name || 'HangHut'
    const orgIcon = organizer?.profile_photo_url || undefined

    // Plain-text, truncated description for meta tags (strip any HTML/markup).
    const plain = (event.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const description = plain
        ? plain.slice(0, 157) + (plain.length > 157 ? '…' : '')
        : `Get tickets for ${event.title} on HangHut.`

    // Always canonicalise to the slug, so a visitor arriving on the legacy UUID
    // link doesn't cause the page to be indexed twice.
    const url = `/events/${(event as any).slug || id}`
    const ogImages = event.cover_image_url
        ? [{ url: event.cover_image_url, width: 1200, height: 630, alt: event.title }]
        : []

    // Unlisted (hidden) and private (subscriber-only / invite-only) events must
    // never be indexed by search engines.
    const isPrivate = event.status === 'hidden' || event.is_subscriber_only === true || event.invite_only === true

    return {
        title: event.title,
        description,
        alternates: { canonical: url },
        ...(isPrivate ? { robots: { index: false, follow: false } } : {}),
        // Use the organizer's logo as the browser-tab favicon for their event page.
        ...(orgIcon ? { icons: { icon: orgIcon, shortcut: orgIcon, apple: orgIcon } } : {}),
        openGraph: {
            type: 'website',
            url,
            siteName: 'HangHut',
            title: `${event.title} · ${orgName}`,
            description,
            images: ogImages,
        },
        twitter: {
            card: 'summary_large_image',
            title: `${event.title} · ${orgName}`,
            description,
            images: event.cover_image_url ? [event.cover_image_url] : [],
        },
    }
}

export default async function PublicEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        invite?: string
        hh_preview?: string
        // Design-tab live-preview structural overrides (see storefront form). These
        // only change how an ALREADY-PUBLIC event renders — purely cosmetic, so they
        // need no auth gate; the draft-status relaxation below stays owner-gated.
        hh_layout?: string; hh_bg?: string; hh_theme?: string
        hh_fh?: string; hh_fb?: string; hh_cd?: string; hh_sp?: string; hh_bgimg?: string
    }>
}) {
    const { id } = await params
    const sp = await searchParams
    const { invite: inviteToken, hh_preview } = sp
    const isPreview = hh_preview === '1'
    let event = await getEvent(id)

    // Design-tab live preview: let the OWNER preview a draft/paused event that the
    // public fetch above hides. Verify ownership before relaxing the status gate.
    if (!event && isPreview) {
        const authed = await createClient()
        const { data: { user } } = await authed.auth.getUser()
        if (user) {
            const anyStatus = await getEvent(id, true)
            const ownerId = (anyStatus?.organizer as any)?.id
            if (ownerId) {
                const { data: owned } = await authed
                    .from('partners').select('id').eq('id', ownerId).eq('user_id', user.id).maybeSingle()
                if (owned) event = anyStatus
            }
        }
    }

    // The event was renamed and this is one of its old slugs — send visitors to the
    // current URL instead of 404ing, preserving whatever query string they arrived
    // with (invite tokens, ?ref= attribution, preview flags).
    if (!event && !isUuid(id)) {
        const retiredEventId = await getEventIdByRetiredSlug(id)
        if (retiredEventId) {
            const current = await getEvent(retiredEventId)
            if (current?.slug) {
                const qs = new URLSearchParams(
                    Object.entries(sp).filter(
                        (entry): entry is [string, string] => typeof entry[1] === 'string'
                    )
                ).toString()
                redirect(`/events/${current.slug}${qs ? `?${qs}` : ''}`)
            }
        }
    }

    if (!event) notFound()

    // Canonicalise: a UUID link still resolves (they are in sent emails, printed
    // QR codes, the sitemap and referral redirects, so they must never break) but
    // the visitor lands on the readable address. The query string is preserved so
    // invite tokens and ?ref= attribution survive the hop. Skipped for the owner's
    // design-preview iframe, which addresses the event by id on purpose.
    if (isUuid(id) && event.slug && !isPreview) {
        const qs = new URLSearchParams(
            Object.entries(sp).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
        ).toString()
        redirect(`/events/${event.slug}${qs ? `?${qs}` : ''}`)
    }

    // ── Viewer-dependent state (venue, subscriber, tickets) ─────────────────
    // Resolve the viewer ONCE, then run every per-viewer lookup in parallel.
    // (Previously this made two separate auth.getUser() round-trips and ran the
    //  ticket / registration / RPC queries sequentially — the main cause of slow
    //  logged-in loads.)
    let venueVisible = !event.hide_venue_until_registered
    let subscriberDiscount: {
        has_discount: boolean
        discount_type?: 'fixed_price' | 'percentage'
        discount_value?: number
        original_price?: number
        discounted_price?: number
        max_tickets?: number
    } | null = null
    let isActiveSubscriber = false
    let isLoggedIn = false
    let viewerEmail: string | null = null
    let approvedRegistrationId: string | null = null
    let viewerHasTicket = false
    let viewerTicketToken: string | null = null

    // Seat-map presence is viewer-independent — kick it off now so it overlaps
    // the auth work below instead of running strictly after it.
    // NOTE: every query below keys off `event.id`, NOT the `id` route param — that param
    // is whatever was in the URL, which is a SLUG on every canonical event link. Passing it
    // to a uuid column throws 22P02 ("invalid input syntax for type uuid: beyond-the-aswang")
    // and the lookup silently returns nothing.
    const seatMapPromise = createPublicClient()
        .from('event_seat_maps')
        .select('id')
        .eq('event_id', event.id)
        .maybeSingle()
        .then(r => !!r.data, () => false)

    try {
        const authClient = await createClient()
        const { data: { user } } = await authClient.auth.getUser()
        isLoggedIn = !!user
        viewerEmail = user?.email ?? null
        if (user) {
            const admin = createAdminClient()
            const gated = event.require_approval || event.invite_only
            const [regRes, tkRes, discountRes, subRes] = await Promise.all([
                // Returning approved users skip the question step (only when gated).
                gated
                    ? admin.from('event_registrations')
                        .select('id')
                        .eq('event_id', event.id)
                        .eq('user_id', user.id)
                        .in('status', ['approved', 'auto_approved'])
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle()
                    : Promise.resolve({ data: null }),
                // Held ticket → drives both "You're going" AND venue reveal
                // (a confirmed ticket is exactly the venue-gating condition, so
                //  this single query covers both — no separate venue lookup).
                admin.from('tickets')
                    .select('id, purchase_intents(access_token)')
                    .eq('event_id', event.id)
                    .eq('user_id', user.id)
                    .in('status', ['valid', 'used', 'approved'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                // Subscriber discount + active flag (only when there's an organizer).
                event.organizer?.id
                    ? authClient.rpc('get_subscriber_event_discount', { p_event_id: event.id })
                    : Promise.resolve({ data: null }),
                event.organizer?.id
                    ? authClient.rpc('is_active_subscriber', { p_partner_id: event.organizer.id })
                    : Promise.resolve({ data: null }),
            ])

            approvedRegistrationId = (regRes.data as any)?.id ?? null
            const tk = tkRes.data as any
            if (tk) {
                viewerHasTicket = true
                viewerTicketToken = tk.purchase_intents?.access_token ?? null
                venueVisible = true
            }
            if ((discountRes.data as any)?.has_discount) subscriberDiscount = discountRes.data as any
            if ((subRes.data as any) === true) isActiveSubscriber = true
        }
    } catch {
        // Non-blocking — anonymous or auth failure keeps public defaults.
    }

    // ── Invite-only resolution ──────────────────────────────────────────────
    // Private events resolve the viewer's invite status from the ?invite=token
    // link OR the logged-in user's email on the allowlist. Drives the gate below.
    // inviteState: 'public' (not private) | 'pending' (invited, awaiting response)
    //            | 'accepted' | 'declined' | 'uninvited'
    let inviteState: 'public' | 'pending' | 'accepted' | 'declined' | 'uninvited' = 'public'
    let inviteTokenForResponse: string | null = null
    let inviteeName: string | null = null
    if (event.invite_only) {
        inviteState = 'uninvited'
        try {
            if (inviteToken) {
                const inv = await getEventInviteByToken(inviteToken)
                // String compare against the ROUTE PARAM was never true on a slug URL, so a
                // valid invite token silently read as "uninvited" on every canonical link.
                if (inv && inv.event_id === event.id) {
                    inviteState = inv.status === 'accepted' ? 'accepted' : inv.status === 'declined' ? 'declined' : 'pending'
                    inviteTokenForResponse = inviteToken
                    inviteeName = inv.name
                }
            }
            // Fall back to the logged-in email if the token didn't resolve a match
            if (inviteState === 'uninvited' && viewerEmail) {
                const admin = createAdminClient()
                const { data: inv } = await admin
                    .from('event_invites')
                    .select('token, name, status')
                    .eq('event_id', event.id)
                    .eq('email', viewerEmail.toLowerCase())
                    .maybeSingle()
                if (inv) {
                    inviteState = inv.status === 'accepted' ? 'accepted' : inv.status === 'declined' ? 'declined' : 'pending'
                    inviteTokenForResponse = inv.token
                    inviteeName = inv.name
                }
            }
        } catch {
            // Non-blocking — fail closed to 'uninvited' (request-to-join wall)
        }
    }

    // Early access window check
    const earlyAccessHours: number | null = event.subscriber_early_access_hours ?? null
    const isSubscriberOnly: boolean = event.is_subscriber_only ?? false
    const now = new Date()
    const eventStart = new Date(event.start_datetime)
    const publicSaleOpen = earlyAccessHours
        ? new Date(eventStart.getTime() - earlyAccessHours * 60 * 60 * 1000)
        : null
    const inEarlyAccessWindow = publicSaleOpen !== null && now < publicSaleOpen
    // Subscribers can always buy if in early access window; non-subscribers wait
    const ticketingBlocked =
        (isSubscriberOnly && !isActiveSubscriber) ||
        (inEarlyAccessWindow && !isActiveSubscriber)

    // Seated event check — resolved from the promise kicked off above so it
    // overlaps the auth work instead of running after it.
    const hasSeatMap = await seatMapPromise

    const ticketsRemaining = event.capacity - event.tickets_sold
    let isSoldOut = ticketsRemaining <= 0

    // If event has active ticket tiers, also check if all tiers are sold out individually
    const activeTiers = event.ticket_tiers?.filter((t: any) => t.is_active !== false) || []
    if (activeTiers.length > 0) {
        const hasAvailableTier = activeTiers.some((t: any) => t.quantity_total - t.quantity_sold > 0)
        if (!hasAvailableTier) {
            isSoldOut = true
        }
    }

    // RSVP mode — free events where the organizer opted into a one-tap RSVP instead
    // of the ticket/quantity/checkout flow. Only valid when the event is actually free.
    const isFreeEvent = activeTiers.length > 0
        ? activeTiers.every((t: any) => Number(t.price) === 0)
        : Number(event.ticket_price) === 0
    const rsvpMode = !!event.rsvp_enabled && isFreeEvent
    const rsvpLabel = (event.rsvp_button_label || '').trim() || 'RSVP'

    // External ticketing redirect URL (edge function handles click tracking + 302 redirect)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const externalRedirectUrl = event.is_external
        ? `${supabaseUrl}/functions/v1/redirect-to-external?event_id=${event.id}`
        : undefined
    const eventDate = new Date(event.start_datetime)

    // Theme Logic
    const themeStyle = event.theme_color ? {
        '--primary': hexToHsl(event.theme_color),
        '--ring': hexToHsl(event.theme_color),
    } as React.CSSProperties : undefined;

    // Layout Config
    const defaultOrder = ["hero", "title", "details", "about", "lineup", "schedule", "gallery", "organizer", "faq", "sponsors", "tickets"]
    let layoutOrder: string[] = event.layout_config?.order || defaultOrder
    // Events saved before lineup/schedule/faq/sponsors existed have orders without
    // them — merge missing ids in (before tickets) so their content can render.
    {
        const missing = ['lineup', 'schedule', 'faq', 'sponsors'].filter(s => !layoutOrder.includes(s))
        if (missing.length) {
            layoutOrder = [...layoutOrder]
            const ti = layoutOrder.indexOf('tickets')
            layoutOrder.splice(ti === -1 ? layoutOrder.length : ti, 0, ...missing)
        }
    }
    const hiddenSections = new Set(event.layout_config?.hidden || [])
    const rawVideoPosition = event.layout_config?.video_position || 'center 50%'

    // New style config. In the Design-tab preview iframe (isPreview) the organizer's
    // UNSAVED structural picks arrive as URL params — so layout/bg/fonts preview live
    // (a reload, since these are server-rendered) without needing to Save first. A
    // param wins over the saved value; absent → saved value. `?? ` keeps `''`-safe.
    const ov = <T,>(v: T | undefined, saved: T): T => (isPreview && v !== undefined ? v : saved)
    const bgStyle: BgStyle = ov(sp.hh_bg as BgStyle | undefined, event.layout_config?.bg_style || 'default')
    const pageLayout: 'default' | 'poster' | 'minimal' | 'broadside' | 'editorial' | 'cinematic' | 'boutique' =
        ov(sp.hh_layout as any, event.layout_config?.page_layout || 'default')
    // Art-directed theme: restyles cards/badges/buttons/headers via injected CSS
    const pageTheme: string = ov(sp.hh_theme, event.layout_config?.theme || 'classic')
    const themeCss = getEventThemeCss(pageTheme)
    // Layout "bones" CSS — reshapes the shared body sections to match the chosen
    // skeleton (see event-layouts.ts). Injected AFTER themeCss so structure wins.
    const layoutCss = getEventLayoutCss(pageLayout)
    // Partner/admin custom CSS skin (HelixPay-style). Scoped-by-convention under
    // [data-hh-theme]; sanitized so it can't break out of the <style> tag.
    const customCss = sanitizeCustomCss(event.layout_config?.custom_css)
    const showCountdown = ov(sp.hh_cd !== undefined ? sp.hh_cd === '1' : undefined, event.layout_config?.show_countdown ?? false)
    const countdownLabel = event.layout_config?.countdown_label || 'Event starts in'
    const showSocialProof = ov(sp.hh_sp !== undefined ? sp.hh_sp === '1' : undefined, event.layout_config?.show_social_proof ?? false)
    // bg image: the form always sends hh_bgimg (empty = intentionally cleared), so
    // key-presence — not truthiness — decides whether to use the preview value.
    const bgImageUrl: string | undefined = isPreview && sp.hh_bgimg !== undefined
        ? (sp.hh_bgimg || undefined)
        : (event.layout_config?.bg_image_url || undefined)

    // Font config
    const fontHeading: string = ov(sp.hh_fh, event.layout_config?.font_heading || 'inter')
    const fontBody: string = ov(sp.hh_fb, event.layout_config?.font_body || 'inter')
    const FONT_MAP: Record<string, { name: string; url: string; css: string }> = {
        inter:      { name: 'Inter',             url: '',                                                                                css: 'Inter, sans-serif' },
        playfair:   { name: 'Playfair Display',  url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap', css: "'Playfair Display', serif" },
        grotesk:    { name: 'Space Grotesk',     url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap',    css: "'Space Grotesk', sans-serif" },
        bebas:      { name: 'Bebas Neue',        url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',                        css: "'Bebas Neue', cursive" },
        cormorant:  { name: 'Cormorant Garamond',url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap', css: "'Cormorant Garamond', serif" },
        mono:       { name: 'JetBrains Mono',    url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap',       css: "'JetBrains Mono', monospace" },
        outfit:     { name: 'Outfit',            url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;900&display=swap',        css: "'Outfit', sans-serif" },
        dmserif:    { name: 'DM Serif Display',  url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap',                  css: "'DM Serif Display', serif" },
    }
    const headingFont = FONT_MAP[fontHeading] || FONT_MAP.inter
    const bodyFont    = FONT_MAP[fontBody]    || FONT_MAP.inter
    const googleFontUrls = [...new Set([headingFont.url, bodyFont.url].filter(Boolean))]

    // Color overrides
    const textColor: string  = event.layout_config?.text_color  || ''
    const headingColor: string = event.layout_config?.heading_color || ''
    // Whether a dark bg is active — drives glass card mode
    const isDarkBg = bgStyle !== 'default'

    // A text colour set only as `color` on the root reaches nothing: every element
    // carrying a Tailwind colour class (text-foreground, text-muted-foreground, …)
    // beats an INHERITED value no matter the specificity. So map the pick onto the
    // design TOKENS those classes paint from — then the whole page follows.
    const textHsl = textColor ? hexToHsl(textColor) : null
    /** Recessive companion for --muted-foreground: pushes lightness toward mid so
     *  secondary text still reads as secondary, whichever way the pick leans. */
    const softenHsl = (hsl: string) => {
        const m = /^([\d.]+) ([\d.]+)% ([\d.]+)%$/.exec(hsl)
        if (!m) return hsl
        const l = parseFloat(m[3])
        return `${m[1]} ${m[2]}% ${(l > 50 ? Math.max(0, l - 24) : Math.min(100, l + 24)).toFixed(1)}%`
    }

    const fontStyle = {
        ...themeStyle,
        '--font-heading': headingFont.css,
        '--font-body': bodyFont.css,
        '--hh-accent': event.theme_color || '#4E47DC',
        ...(textColor    ? { '--hh-text':    textColor }    : {}),
        ...(headingColor ? { '--hh-heading': headingColor } : {}),
        ...(textHsl ? {
            '--foreground': textHsl,
            '--card-foreground': textHsl,
            '--popover-foreground': textHsl,
            '--muted-foreground': softenHsl(textHsl),
        } : {}),
    } as React.CSSProperties

    // Fetch anonymised recent registrations for social proof ticker
    const recentNames: string[] = []
    if (showSocialProof) {
        try {
            const adminForProof = createAdminClient()
            const { data: regs } = await adminForProof
                .from('event_registrations')
                .select('guest_name, user_id, users!event_registrations_user_id_fkey(display_name)')
                .eq('event_id', event.id)
                .in('status', ['approved', 'auto_approved'])
                .order('created_at', { ascending: false })
                .limit(12)
            if (regs) {
                for (const reg of regs) {
                    const full: string =
                        reg.guest_name ||
                        (reg as any).users?.display_name ||
                        'Someone'
                    const parts = full.trim().split(' ')
                    const anonymised =
                        parts.length > 1
                            ? `${parts[0]} ${parts[parts.length - 1][0]}.`
                            : parts[0]
                    recentNames.push(anonymised)
                }
            }
        } catch {
            // non-fatal
        }
    }

    // Parse the new scale/x/y format
    let objectPosition = 'center 50%'
    let transform = 'none'

    if (rawVideoPosition.includes('scale:')) {
        const parts = rawVideoPosition.split('|')
        let s = 1.0, x = 50, y = 50
        parts.forEach((p: string) => {
            const [k, v] = p.split(':')
            if (k === 'scale') s = parseFloat(v)
            if (k === 'x') x = parseFloat(v)
            if (k === 'y') y = parseFloat(v)
        })
        objectPosition = `${x}% ${y}%`
        transform = `scale(${s})`
    } else if (rawVideoPosition.includes('%')) {
        objectPosition = rawVideoPosition // legacy
    } else if (rawVideoPosition === 'top') {
        objectPosition = 'center 0%'
    } else if (rawVideoPosition === 'bottom') {
        objectPosition = 'center 100%'
    }

    // --- Section Components ---

    const HeroSection = () => {
        const youtubeEmbed = event.video_url ? getYouTubeEmbedUrl(event.video_url) : null

        // When a visual bg style is chosen, the hero becomes an immersive header with
        // the event title + countdown overlaid. Video/image takes a back seat.
        if (bgStyle !== 'default') {
            return (
                <div className="relative w-full h-[65vh] min-h-[520px] overflow-hidden">
                    <EventPageBackground
                        bgStyle={bgStyle}
                        themeColor={event.theme_color || '#6366f1'}
                        coverImageUrl={event.cover_image_url || undefined}
                        bgImageUrl={bgImageUrl}
                        videoUrl={!youtubeEmbed ? (event.video_url || undefined) : undefined}
                    />
                    {/* Dark vignette at bottom so content reads cleanly below */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 pointer-events-none z-10" />
                    {/* Centered overlay content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-4 z-20">
                        <div className="flex gap-2 justify-center">
                            <span data-hh-badge className="bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                                {event.event_type || 'Event'}
                            </span>
                            {event.is_featured && (
                                <span data-hh-badge className="bg-yellow-400/90 text-yellow-900 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                                    Featured
                                </span>
                            )}
                        </div>
                        <h1 data-hh-title className="text-4xl md:text-6xl lg:text-7xl font-black text-white drop-shadow-2xl leading-[1.05] tracking-tight max-w-3xl">
                            {event.title}
                        </h1>
                        <div className="flex items-center gap-3 text-white/75 text-sm font-medium flex-wrap justify-center">
                            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatEventDateTime(event.start_datetime)}</span>
                            {event.venue_name && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-white/40" />
                                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span>
                                </>
                            )}
                        </div>
                        {showCountdown && (
                            <EventCountdown targetDate={event.start_datetime} label={countdownLabel} />
                        )}
                        {showSocialProof && recentNames.length > 0 && (
                            <SocialProofTicker names={recentNames} />
                        )}
                    </div>
                </div>
            )
        }

        return (
            <div className="relative w-full h-[50vh] min-h-[400px] overflow-hidden bg-muted group">
                {youtubeEmbed ? (
                    <iframe
                        src={youtubeEmbed}
                        className="w-full h-full object-cover pointer-events-none origin-center"
                        style={{ objectPosition, transform }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Hero Video"
                    />
                ) : event.video_url ? (
                    <video
                        src={event.video_url}
                        poster={event.cover_image_url}
                        className="w-full h-full object-cover origin-center"
                        style={{ objectPosition, transform }}
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                ) : event.cover_image_url ? (
                    <>
                        <Image
                            src={event.cover_image_url}
                            alt={event.title}
                            fill
                            sizes="100vw"
                            className="object-cover"
                            priority
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                    </>
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <h1 className="text-4xl font-bold opacity-20">{event.title}</h1>
                    </div>
                )}
                {/* Countdown + social proof on default hero too, if enabled */}
                {(showCountdown || (showSocialProof && recentNames.length > 0)) && (
                    <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-10">
                        {showSocialProof && recentNames.length > 0 && (
                            <SocialProofTicker names={recentNames} />
                        )}
                        {showCountdown && (
                            <EventCountdown targetDate={event.start_datetime} label={countdownLabel} />
                        )}
                    </div>
                )}
            </div>
        )
    }



    const TitleSection = () => (
        <div className="space-y-4 py-8">
            <div className="flex gap-2 mb-2">
                <Badge data-hh-badge variant="secondary" className="bg-background/80 backdrop-blur text-foreground border shadow-sm">
                    {event.event_type ? event.event_type.toUpperCase() : 'EVENT'}
                </Badge>
                {event.is_featured && <Badge data-hh-badge className="bg-yellow-500 text-white hover:bg-yellow-600">Featured</Badge>}
                {event.status === 'hidden' && (
                    <Badge variant="outline" className="border-purple-300 text-purple-600 bg-purple-50/80 backdrop-blur">
                        🔒 Unlisted Event
                    </Badge>
                )}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-foreground drop-shadow-sm">
                {event.title}
            </h1>
        </div>
    )

    const DetailsSection = () => (
        <Card data-hh-card className="p-0 overflow-hidden border-none shadow-xl my-8">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
                <div className="p-6 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                        <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="font-semibold text-lg">{formatEventDate(event.start_datetime)}</p>
                        <p className="text-muted-foreground">{formatEventTime(event.start_datetime)}</p>
                        <AddToCalendarButton
                            title={event.title}
                            startDatetime={event.start_datetime}
                            endDatetime={event.end_datetime}
                            location={event.venue_name ? `${event.venue_name}, ${event.address || ''} ${event.city || ''}`.trim() : event.city}
                            description={event.description}
                            eventId={event.id}
                        />
                    </div>
                </div>
                <div className="p-6 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                        <MapPin className="h-6 w-6" />
                    </div>
                    <div>
                        {venueVisible ? (
                            <>
                                <p className="font-semibold text-lg line-clamp-1">{event.venue_name}</p>
                                <p className="text-muted-foreground line-clamp-2">{event.address}, {event.city}</p>
                                <a
                                    href={`https://maps.google.com/?q=${event.latitude},${event.longitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary font-medium hover:underline mt-2 inline-block"
                                >
                                    Get Directions
                                </a>
                            </>
                        ) : (
                            <>
                                <p className="font-semibold text-lg">{event.city}</p>
                                <p className="text-muted-foreground text-sm mt-1 italic">📍 Venue revealed after registration</p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    )

    const AboutSection = () => (
        <div className="prose dark:prose-invert max-w-none py-8">
            <h2 data-hh-section-title className="text-2xl font-bold mb-4">About this Event</h2>
            {event.description_html ? (
                <div
                    dangerouslySetInnerHTML={{ __html: sanitize(event.description_html) }}
                    className="description-html"
                />
            ) : (
                <p className="whitespace-pre-wrap text-lg leading-relaxed text-muted-foreground">
                    {event.description || "No description provided."}
                </p>
            )}
        </div>
    )

    const OrganizerSection = () => (
        <div data-hh-card className="flex items-center gap-4 py-6 px-5 rounded-2xl border border-border/50 my-8">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-background shadow-md">
                {event.organizer?.profile_photo_url ? (
                    <img src={event.organizer.profile_photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {event.organizer?.business_name?.charAt(0)}
                    </div>
                )}
            </div>
            <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Organized by</p>
                <h3 className="text-xl font-bold flex items-center gap-2">
                    {event.organizer?.business_name}
                    {event.organizer?.verified && (
                        <ShieldCheck className="h-5 w-5 text-blue-500 fill-blue-500/10" />
                    )}
                </h3>
                {event.organizer?.slug && (
                    <a href={`https://${event.organizer.slug}.hanghut.com`} className="text-sm text-primary hover:underline">
                        View Profile
                    </a>
                )}
                {/* The organizer's own number, shown only when they've opted in via
                    Settings → Contact Details. This slot used to print a single
                    hard-coded number on every event page, for every organizer. */}
                {event.organizer?.contact_number && event.organizer?.branding?.contact_display?.phone === true && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" />
                        <a href={`tel:${event.organizer.contact_number.replace(/[^\d+]/g, '')}`} className="hover:underline">
                            {event.organizer.contact_number}
                        </a>
                    </p>
                )}
            </div>
        </div>
    )

    const GallerySection = () => {
        const galleryImages = [
            ...(event.cover_image_url ? [event.cover_image_url] : []),
            ...(event.images || [])
        ]

        if (galleryImages.length === 0) return null
        return (
            <div className="py-8 border-t border-border/50">
                <EventGallery images={galleryImages} title={event.title} aspectRatio={3 / 4} />
            </div>
        )
    }

    const TicketsSection = () => {
        // Invite-only gate: invited-but-unresponded (or previously declined) sees
        // Accept/Decline before any registration/ticket UI. Accepted + public fall
        // through to the normal content below; 'uninvited' gets a request-to-join
        // notice prepended to the same flow (backend routes them to pending).
        if (event.invite_only && (inviteState === 'pending' || inviteState === 'declined') && inviteTokenForResponse) {
            return (
                <Card data-hh-card className="my-8 border-2 border-primary/10 shadow-lg overflow-hidden" id="tickets">
                    <div className="p-6 md:p-8">
                        <EventInviteResponse
                            token={inviteTokenForResponse}
                            organizerName={event.organizer?.business_name || 'the organizer'}
                            inviteeName={inviteeName}
                            initialStatus={inviteState === 'declined' ? 'declined' : 'invited'}
                        />
                    </div>
                </Card>
            )
        }
        return (
        <Card data-hh-card className="my-8 border-2 border-primary/10 shadow-lg overflow-hidden" id="tickets">
            <div className="bg-primary/5 p-6 border-b border-primary/10 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${event.is_external ? 'bg-blue-600 text-white' : 'bg-primary text-primary-foreground'}`}>
                        <Ticket className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 data-hh-section-title className="text-2xl font-bold">
                            {event.is_external
                                ? `Get Tickets${event.external_provider_name ? ` on ${event.external_provider_name}` : ''}`
                                : rsvpMode
                                    ? (isSoldOut ? 'Event full' : rsvpLabel)
                                    : (isSoldOut ? 'Sold Out' : 'Get Tickets')}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {event.is_external
                                ? 'Tickets sold by external provider'
                                : rsvpMode
                                    ? (isSoldOut ? 'This event is full' : 'Free event — reserve your spot')
                                    : (isSoldOut ? 'Tickets are no longer available' : 'Secure your spot now')}
                        </p>
                    </div>
                </div>
                {!rsvpMode && (
                    <div className="text-right">
                        <span className="block text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                            {event.is_external ? 'From' : 'Starting at'}
                        </span>
                        <span className="text-3xl font-extrabold text-primary">
                            {event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}
                        </span>
                    </div>
                )}
            </div>
            <div className="p-8">
                {event.invite_only && inviteState === 'uninvited' && (
                    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold">This is a private event</p>
                            <p className="text-sm text-muted-foreground">
                                You&apos;re not on the guest list yet. You can request to join below —
                                the organizer will review and approve your request.
                            </p>
                        </div>
                    </div>
                )}
                {event.is_external ? (
                    <>
                        <a
                            href={externalRedirectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                        >
                            <button className="w-full h-14 text-lg font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-2 shadow-md">
                                Get Tickets{event.external_provider_name ? ` on ${event.external_provider_name}` : ''}
                                <ExternalLink className="h-5 w-5" />
                            </button>
                        </a>
                        <p className="text-center text-xs text-muted-foreground mt-4">
                            You will be redirected to {event.external_provider_name || 'the ticketing provider'} to complete your purchase.
                        </p>
                    </>
                ) : ticketingBlocked ? (
                    <div className="flex flex-col items-center text-center gap-4 py-4">
                        {isSubscriberOnly && !isActiveSubscriber ? (
                            <>
                                <p className="font-semibold">Members only event</p>
                                <p className="text-sm text-muted-foreground">
                                    This event is exclusive to subscribers of {event.organizer?.business_name}.
                                </p>
                                {event.organizer?.slug && (
                                    <Link href={`/${event.organizer.slug}/membership`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                        View membership options →
                                    </Link>
                                )}
                            </>
                        ) : inEarlyAccessWindow && !isActiveSubscriber ? (
                            <>
                                <p className="font-semibold">Early access for subscribers</p>
                                <p className="text-sm text-muted-foreground">
                                    Subscribers of {event.organizer?.business_name} get early access.
                                    Public sale opens{' '}
                                    <span className="font-medium text-foreground">
                                        {publicSaleOpen ? formatInManila(publicSaleOpen.toISOString(), { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>.
                                </p>
                                {event.organizer?.slug && (
                                    <Link href={`/${event.organizer.slug}/membership`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                        Become a member for early access →
                                    </Link>
                                )}
                            </>
                        ) : null}
                    </div>
                ) : hasSeatMap ? (
                    /* Reserved-seating event: seat selection is the ONLY checkout path.
                       Quantity-based "Get Tickets" is intentionally disabled here — it would
                       sell against the same tier capacity without claiming a seat (oversell)
                       and issue tickets with no seat assignment (ghost tickets). */
                    <>
                        {isSoldOut ? (
                            <div className="text-center py-4 text-muted-foreground font-medium">
                                Tickets are no longer available
                            </div>
                        ) : (
                            <SeatPickerLauncher eventId={event.id} fullWidth maxPerOrder={event.max_seats_per_order ?? undefined} />
                        )}
                        {!isLoggedIn && (
                            <LoginNudge
                                label="Have a HangHut account? Sign in for faster checkout"
                                className="mt-4"
                            />
                        )}
                        <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Secure checkout powered by Xendit
                        </p>
                        <p className="text-center text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                            <Phone className="h-3 w-3" /> Need help? Contact us at{' '}
                            <a href="tel:+639618478642" className="text-primary hover:underline font-medium">+63 961 847 8642</a>
                        </p>
                    </>
                ) : (
                    <>
                        <RegistrationGate
                            eventId={event.id}
                            eventTitle={event.title}
                            ticketPrice={event.ticket_price}
                            minTickets={event.min_tickets_per_purchase}
                            maxTickets={event.max_tickets_per_purchase}
                            isSoldOut={isSoldOut}
                            tiers={event.ticket_tiers}
                            fullWidth
                            subscriberDiscount={subscriberDiscount}
                            questions={(event.registration_questions || []) as QuestionForForm[]}
                            requireApproval={event.require_approval}
                            inviteOnly={event.invite_only}
                            themeColor={event.theme_color}
                            dark={isDarkBg}
                            pageTheme={pageTheme}
                            initialApprovedRegistrationId={approvedRegistrationId}
                            hasTicket={viewerHasTicket}
                            ticketToken={viewerTicketToken}
                            rsvpMode={rsvpMode}
                            rsvpLabel={rsvpLabel}
                            tierDisplay={event.layout_config?.tiers}
                        />
                        {!isLoggedIn && (
                            <LoginNudge
                                label="Have a HangHut account? Sign in for faster checkout"
                                className="mt-4"
                            />
                        )}
                        <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Secure checkout powered by Xendit
                        </p>
                        <p className="text-center text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                            <Phone className="h-3 w-3" /> Need help? Contact us at{' '}
                            <a href="tel:+639618478642" className="text-primary hover:underline font-medium">+63 961 847 8642</a>
                        </p>
                    </>
                )}
            </div>
        </Card>
        )
    }

    // ── Rich content sections (lineup / schedule / FAQ / sponsors) ──
    // Content lives in layout_config.sections (jsonb); each section renders
    // only when the organizer has added entries.
    const sectionsContent = event.layout_config?.sections || {}

    const LineupSection = () => {
        const lineup: Array<{ name: string; role?: string; photo_url?: string }> = sectionsContent.lineup || []
        if (lineup.length === 0) return null
        return (
            <div className="py-8">
                <h2 data-hh-section-title className="text-2xl font-bold mb-6">Lineup</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {lineup.map((artist, i) => (
                        <div data-hh-card key={`${artist.name}-${i}`} className="rounded-2xl border border-border/50 overflow-hidden text-center bg-card/50">
                            {artist.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={artist.photo_url} alt={artist.name} className="w-full aspect-square object-cover" />
                            ) : (
                                <div className="w-full aspect-square bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary">
                                    {artist.name.charAt(0)}
                                </div>
                            )}
                            <div className="p-3">
                                <p className="font-bold leading-tight">{artist.name}</p>
                                {artist.role && <p className="text-xs text-muted-foreground mt-0.5">{artist.role}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const ScheduleSection = () => {
        const schedule: Array<{ time: string; title: string; description?: string }> = sectionsContent.schedule || []
        if (schedule.length === 0) return null
        return (
            <div className="py-8">
                <h2 data-hh-section-title className="text-2xl font-bold mb-6">Schedule</h2>
                <div className="relative pl-6 space-y-6 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-primary/30">
                    {schedule.map((item, i) => (
                        <div key={i} className="relative">
                            <span className="absolute -left-6 top-1.5 w-[11px] h-[11px] rounded-full bg-primary ring-4 ring-primary/15" />
                            <p className="text-sm font-semibold text-primary tabular-nums">{item.time}</p>
                            <p className="font-bold text-lg leading-snug">{item.title}</p>
                            {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const FaqSection = () => {
        const faq: Array<{ q: string; a: string }> = sectionsContent.faq || []
        if (faq.length === 0) return null
        return (
            <div className="py-8">
                <h2 data-hh-section-title className="text-2xl font-bold mb-6">FAQ</h2>
                <div className="space-y-3">
                    {faq.map((item, i) => (
                        // Native details/summary — accordion with zero JS
                        <details data-hh-card key={i} className="group rounded-2xl border border-border/50 px-5 py-4 bg-card/50">
                            <summary className="font-semibold cursor-pointer list-none flex items-center justify-between gap-3 select-none">
                                {item.q}
                                <span className="text-primary transition-transform group-open:rotate-45 shrink-0 text-xl leading-none">+</span>
                            </summary>
                            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{item.a}</p>
                        </details>
                    ))}
                </div>
            </div>
        )
    }

    const SponsorsSection = () => {
        const sponsors: Array<{ name: string; logo_url?: string; url?: string }> = sectionsContent.sponsors || []
        if (sponsors.length === 0) return null
        return (
            <div className="py-8">
                <h2 data-hh-section-title className="text-2xl font-bold mb-6">Sponsors & Partners</h2>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
                    {sponsors.map((s, i) => {
                        const inner = s.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.logo_url} alt={s.name} title={s.name} className="h-10 md:h-12 w-auto max-w-[140px] object-contain opacity-70 hover:opacity-100 transition-opacity" />
                        ) : (
                            <span className="font-bold text-lg text-muted-foreground hover:text-foreground transition-colors">{s.name}</span>
                        )
                        return s.url ? (
                            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{inner}</a>
                        ) : (
                            <span key={i}>{inner}</span>
                        )
                    })}
                </div>
            </div>
        )
    }

    // Read-only pricing table for the page body — a scannable "menu" of every
    // tier (name · what's included · availability · price). Purpose-built for
    // events with many tiers, where the buy box would be a wall of cards. It
    // does NOT sell — the Ticket Selector remains the single checkout path. Opt-in:
    // only renders when the organizer adds 'pricing' to their section order.
    const PricingSection = () => {
        const cfg = event.layout_config?.tiers || {}
        const showRemaining: boolean = cfg.show_remaining ?? false
        const showSoldOut: boolean = cfg.show_sold_out ?? true
        const soldOutOf = (t: any) => Number(t.quantity_sold) >= Number(t.quantity_total)
        let list = (event.ticket_tiers || []).filter((t: any) => t.is_active !== false)
        if (!showSoldOut) list = list.filter((t: any) => !soldOutOf(t))
        list = list.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0) || a.price - b.price)
        if (list.length === 0) return null
        const money = (n: number) => (Number(n) === 0 ? 'Free' : `₱${Number(n).toLocaleString()}`)
        return (
            <div className="py-8">
                <h2 data-hh-section-title className="text-2xl font-bold mb-6">Ticket Options</h2>
                <div data-hh-card className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 divide-y divide-border/50">
                    {list.map((tier: any) => {
                        const tSoldOut = soldOutOf(tier)
                        const accent = tier.accent_color as string | undefined
                        const remaining = Math.max(Number(tier.quantity_total) - Number(tier.quantity_sold), 0)
                        const perks: string[] = Array.isArray(tier.perks) ? tier.perks : []
                        return (
                            <div key={tier.id} className={`flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6 p-4 sm:p-5 ${tSoldOut ? 'opacity-55' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {accent && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />}
                                        <span className="font-bold text-lg">{tier.name}</span>
                                        {tier.highlight && (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: accent || 'var(--primary, #6366f1)' }}>
                                                {tier.badge_label || 'Featured'}
                                            </span>
                                        )}
                                        {!tier.highlight && tier.badge_label && (
                                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={accent ? { borderColor: accent, color: accent } : undefined}>
                                                {tier.badge_label}
                                            </span>
                                        )}
                                    </div>
                                    {tier.description && <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>}
                                    {perks.length > 0 && (
                                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                                            {perks.map((perk, i) => (
                                                <li key={i} className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                                    <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0" />{perk}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                                    <span className="text-xl font-extrabold">{money(tier.price)}</span>
                                    {tSoldOut ? (
                                        <span className="text-xs font-semibold text-destructive">Sold out</span>
                                    ) : showRemaining && remaining <= 20 ? (
                                        <span className="text-xs font-medium text-amber-600">Only {remaining} left</span>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                </div>
                {showTickets && (
                    <a href="#tickets" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                        Choose your tickets ↓
                    </a>
                )}
            </div>
        )
    }

    // Body sections that scroll-reveal (fade + lift into view once). Hero,
    // title, details and the ticket box are excluded — they're above the fold
    // or the primary CTA, where an entrance animation would just add latency.
    const REVEAL_SECTIONS = new Set(['about', 'lineup', 'schedule', 'faq', 'sponsors', 'pricing', 'gallery', 'organizer'])

    const renderSection = (sectionId: string) => {
        if (hiddenSections.has(sectionId)) return null

        const el = (() => {
            switch (sectionId) {
                case 'hero': return <HeroSection key="hero" />
                case 'title': return <TitleSection key="title" />
                case 'details': return <DetailsSection key="details" />
                case 'about': return <AboutSection key="about" />
                case 'lineup': return <LineupSection key="lineup" />
                case 'schedule': return <ScheduleSection key="schedule" />
                case 'faq': return <FaqSection key="faq" />
                case 'sponsors': return <SponsorsSection key="sponsors" />
                case 'pricing': return <PricingSection key="pricing" />
                case 'organizer': return <OrganizerSection key="organizer" />
                case 'gallery': return <GallerySection key="gallery" />
                // Only render when there is something to sell — an ordered-but-empty
                // merch slot would otherwise leave a blank block on the page.
                case 'merch': return event.organizer?.id && eventMerch.length > 0
                    ? <MerchSection key="merch" organizerId={event.organizer.id} eventId={event.id} products={eventMerch} />
                    : null
                case 'tickets': return <TicketsSection key="tickets" />
                // 'location' (Map & Directions) removed — the Details card already
                // covers venue + Get Directions; old saved orders fall through to null
                default: return null
            }
        })()

        if (el && REVEAL_SECTIONS.has(sectionId)) {
            return <Reveal key={sectionId}>{el}</Reveal>
        }
        return el
    }

    // Buyer-facing merch for this event + the organizer's storefront-wide items.
    const eventMerch = event.organizer?.id ? await getPublicMerch(event.organizer.id, event.id) : []

    // Separate special sections. Merch is now a FIRST-CLASS orderable section — it used
    // to be stripped out of layoutOrder and force-appended, which meant organizers could
    // neither move nor hide it. It only falls back to being appended for layouts saved
    // before merch became arrangeable, so those pages render exactly as they do today.
    const mainContentOrder = [
        ...layoutOrder.filter((id: string) => id !== 'hero' && id !== 'tickets'),
        ...(eventMerch.length > 0 && !layoutOrder.includes('merch') ? ['merch'] : []),
    ]
    const showHero = !hiddenSections.has('hero')
    const showTickets = !hiddenSections.has('tickets')

    // Shared <head>-ish injection every layout branch renders once, in a fixed
    // order: webfonts → theme paint → layout bones → custom skin → live-preview
    // bridge. Centralised so a branch can never silently miss one (the custom-CSS
    // "nothing happens on save" bug was exactly that — one branch missing a tag).
    const PageHead = () => (
        <>
            {googleFontUrls.map(url => (
                <link key={url} rel="stylesheet" href={url} />
            ))}
            {/* Heading font on every heading in the new layouts — the theme BASE only
                applies it for non-classic themes, so classic would otherwise fall back.
                Keyed on [data-hh-event] (every layout root carries it); the old
                [data-hh-layout] key silently matched nothing on poster/minimal, so
                their heading font + colour picks never applied. Heading colour is
                !important because headings often carry their own text-* class, which
                an explicit organizer override should still win against. */}
            <style>{`[data-hh-event] h1,[data-hh-event] h2,[data-hh-event] h3,[data-hh-event] h4{font-family:var(--font-heading)}`}</style>
            {themeCss && <style>{themeCss}</style>}
            {layoutCss && <style>{layoutCss}</style>}
            {/* Organizer colour picks land AFTER the layout bones: cinematic (and the
                dark-bg block) pin .text-foreground/.text-muted-foreground to fixed
                slate values, which would otherwise outrank an explicit pick. Custom
                CSS still ships last so it remains the final escape hatch. */}
            {(textColor || headingColor) && (
                <style>{`${textColor ? `[data-hh-event]{color:var(--hh-text)}[data-hh-event] .text-foreground{color:var(--hh-text)}[data-hh-event] .text-muted-foreground{color:color-mix(in srgb,var(--hh-text) 70%,transparent)}` : ''}${headingColor ? `[data-hh-event] h1,[data-hh-event] h2,[data-hh-event] h3,[data-hh-event] h4{color:var(--hh-heading)!important}` : ''}`}</style>
            )}
            {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
            {isPreview && <StorefrontPreviewBridge />}
        </>
    )

    // Shared organizer header used by the new layout branches.
    const OrganizerHeaderLink = ({ dark }: { dark?: boolean }) =>
        event.organizer ? (
            <a
                href={`https://${event.organizer.slug}.hanghut.com`}
                className={cn('flex items-center gap-3 font-bold transition-opacity hover:opacity-80', dark ? 'text-white/85' : 'text-foreground')}
            >
                {event.organizer.profile_photo_url ? (
                    <div className={cn('relative w-8 h-8 rounded-full overflow-hidden border', dark ? 'border-white/30' : 'border-border')}>
                        <Image src={event.organizer.profile_photo_url} alt={event.organizer.business_name} fill className="object-cover" />
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center text-primary-foreground font-bold text-sm">
                        {event.organizer.business_name.charAt(0)}
                    </div>
                )}
                <span className="truncate max-w-[200px] text-sm">{event.organizer.business_name}</span>
            </a>
        ) : (
            <Link href="/" className="font-black text-lg">HANGHUT</Link>
        )

    const formattedDate = formatEventDateTime(event.start_datetime)

    // ─── BROADSIDE LAYOUT ─ brutalist gig poster ─────────────────────────────
    if (pageLayout === 'broadside') {
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="broadside" className="min-h-screen bg-background pb-24" style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                <header className="border-b-2 border-foreground">
                    <div className="container mx-auto px-4 flex h-14 items-center justify-between">
                        <OrganizerHeaderLink />
                        <ShareButton title={event.title} description={event.description} eventId={event.id} />
                    </div>
                </header>

                {/* Poster hero: image band, then giant title + bordered meta strip */}
                <section className="container mx-auto px-4">
                    {showHero && event.cover_image_url && (
                        <div className="relative w-full h-[38vh] min-h-[240px] overflow-hidden border-b-2 border-foreground">
                            <Image src={event.cover_image_url} alt={event.title} fill priority sizes="100vw" className="object-cover" />
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-6">
                        <span data-hh-badge className="border-2 border-foreground text-foreground text-[11px] font-black uppercase tracking-[0.14em] px-3 py-1">
                            {event.event_type || 'Event'}
                        </span>
                        {event.is_featured && (
                            <span data-hh-badge className="bg-foreground text-background text-[11px] font-black uppercase tracking-[0.14em] px-3 py-1">Featured</span>
                        )}
                    </div>
                    <h1
                        data-hh-title
                        className="font-black uppercase tracking-[-0.03em] leading-[0.86] mt-3"
                        style={{ fontSize: 'clamp(3rem, 11vw, 9rem)', fontFamily: 'var(--font-heading)' }}
                    >
                        {event.title}
                    </h1>
                    {/* Mono metadata strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 border-t-2 border-b-2 border-foreground mt-6 font-mono text-xs uppercase tracking-wider">
                        <div className="p-3 border-r-2 border-foreground">
                            <div className="opacity-50">Date</div>
                            <div className="font-bold normal-case tracking-normal font-sans">{formatInManila(event.start_datetime, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                        </div>
                        <div className="p-3 md:border-r-2 border-foreground">
                            <div className="opacity-50">Time</div>
                            <div className="font-bold normal-case tracking-normal font-sans">{formatEventTime(event.start_datetime)}</div>
                        </div>
                        <div className="p-3 border-r-2 border-t-2 md:border-t-0 border-foreground">
                            <div className="opacity-50">Venue</div>
                            <div className="font-bold normal-case tracking-normal font-sans truncate">{venueVisible ? (event.venue_name || event.city) : event.city}</div>
                        </div>
                        <div className="p-3 border-t-2 md:border-t-0 border-foreground">
                            <div className="opacity-50">From</div>
                            <div className="font-bold normal-case tracking-normal font-sans">{event.ticket_price === 0 ? 'Free' : `₱${event.ticket_price.toLocaleString()}`}</div>
                        </div>
                    </div>
                    {showCountdown && (
                        <div className="mt-6"><EventCountdown targetDate={event.start_datetime} label={countdownLabel} /></div>
                    )}
                    {showSocialProof && recentNames.length > 0 && (
                        <div className="mt-4"><SocialProofTicker names={recentNames} /></div>
                    )}
                </section>

                <main className="container mx-auto px-4 max-w-3xl">
                    {mainContentOrder.map(sectionId => (
                        <div key={sectionId}>{renderSection(sectionId)}</div>
                    ))}
                    {showTickets && <TicketsSection />}
                </main>

                <MobileTicketButton showTickets={showTickets} isSoldOut={isSoldOut} isExternal={event.is_external} externalUrl={externalRedirectUrl} eventId={event.id} label={rsvpMode ? rsvpLabel : undefined} />
            </div>
        )
    }

    // ─── EDITORIAL LAYOUT ─ asymmetric magazine spread ───────────────────────
    if (pageLayout === 'editorial') {
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="editorial" className="min-h-screen bg-background pb-24" style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                <header className="border-b border-border">
                    <div className="container mx-auto px-4 flex h-16 items-center justify-between">
                        <OrganizerHeaderLink />
                        <ShareButton title={event.title} description={event.description} eventId={event.id} />
                    </div>
                </header>

                {/* Two-column spread: story left, tall poster column right */}
                <section className="container mx-auto px-4 pt-10 md:pt-16">
                    <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-14 items-start">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground border-b border-foreground/80 pb-3 mb-6">
                                <span>{event.organizer?.business_name || 'HangHut'}</span>
                                <span className="ml-auto">{formatInManila(event.start_datetime, { month: 'long', year: 'numeric' })}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Badge data-hh-badge variant="secondary">{event.event_type || 'Event'}</Badge>
                                {event.is_featured && <Badge data-hh-badge className="bg-yellow-500 text-white">Featured</Badge>}
                            </div>
                            <h1 data-hh-title className="font-bold leading-[1.02] tracking-[-0.01em]" style={{ fontSize: 'clamp(2.6rem, 6vw, 5rem)', fontFamily: 'var(--font-heading)' }}>
                                {event.title}
                            </h1>
                            <div className="flex items-center gap-3 text-muted-foreground text-sm mt-6 flex-wrap">
                                <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formattedDate}</span>
                                {event.venue_name && venueVisible && (
                                    <><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span></>
                                )}
                            </div>
                            {showCountdown && <div className="mt-6"><EventCountdown targetDate={event.start_datetime} label={countdownLabel} /></div>}
                        </div>
                        {showHero && (
                            <div className="relative w-full aspect-[3/4] overflow-hidden bg-muted md:sticky md:top-6">
                                {event.cover_image_url ? (
                                    <Image src={event.cover_image_url} alt={event.title} fill priority sizes="(max-width:768px) 100vw, 40vw" className="object-cover" />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20" />
                                )}
                            </div>
                        )}
                    </div>
                    {showSocialProof && recentNames.length > 0 && <div className="mt-8"><SocialProofTicker names={recentNames} /></div>}
                </section>

                <main className="container mx-auto px-4 max-w-3xl mt-4">
                    {mainContentOrder.map(sectionId => (
                        <div key={sectionId}>{renderSection(sectionId)}</div>
                    ))}
                    {showTickets && <TicketsSection />}
                </main>

                <MobileTicketButton showTickets={showTickets} isSoldOut={isSoldOut} isExternal={event.is_external} externalUrl={externalRedirectUrl} eventId={event.id} label={rsvpMode ? rsvpLabel : undefined} />
            </div>
        )
    }

    // ─── CINEMATIC LAYOUT ─ immersive full-bleed poster + glass content ──────
    if (pageLayout === 'cinematic') {
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="cinematic" className={cn("min-h-screen bg-black", !textColor && "text-white")} style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                {/* Fixed full-bleed poster background */}
                {bgStyle !== 'default' ? (
                    <EventPageBackground bgStyle={bgStyle} themeColor={event.theme_color || '#6366f1'} coverImageUrl={event.cover_image_url || undefined} bgImageUrl={bgImageUrl} videoUrl={event.video_url ? (getYouTubeEmbedUrl(event.video_url) ? undefined : event.video_url) : undefined} className="fixed inset-0 z-0" />
                ) : event.cover_image_url ? (
                    <div className="fixed inset-0 z-0">
                        <Image src={event.cover_image_url} alt="" fill priority sizes="100vw" className="object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
                    </div>
                ) : (
                    <div className="fixed inset-0 z-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />
                )}

                <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
                    <OrganizerHeaderLink dark />
                    <ShareButton title={event.title} description={event.description} eventId={event.id} dark />
                </header>

                {/* Hero: content floats bottom-left over the poster */}
                <section className="relative z-10 min-h-screen flex flex-col justify-end px-6 md:px-10 pb-16 pt-24 max-w-4xl">
                    <div className="flex flex-wrap gap-2 mb-5">
                        <span data-hh-badge className="bg-white/12 backdrop-blur border border-white/25 text-white text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full">{event.event_type || 'Event'}</span>
                        {event.is_featured && <span data-hh-badge className="bg-yellow-400/90 text-yellow-900 text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full">⭐ Featured</span>}
                    </div>
                    <h1 data-hh-title className="font-black text-white drop-shadow-2xl leading-[0.95] tracking-[-0.02em]" style={{ fontSize: 'clamp(2.6rem, 8vw, 7rem)', fontFamily: 'var(--font-heading)' }}>
                        {event.title}
                    </h1>
                    <div className="flex items-center gap-4 text-white/80 text-sm mt-6 flex-wrap">
                        <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formattedDate}</span>
                        {event.venue_name && venueVisible && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span>}
                    </div>
                    {showCountdown && <div className="mt-6"><EventCountdown targetDate={event.start_datetime} label={countdownLabel} /></div>}
                    {showSocialProof && recentNames.length > 0 && <div className="mt-4"><SocialProofTicker names={recentNames} /></div>}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/40 text-xs animate-bounce">
                        <span>Scroll</span><span>↓</span>
                    </div>
                </section>

                {/* Content floats over the still-fixed poster */}
                <div className="relative z-20 px-4 md:px-6 pb-24 max-w-3xl mx-auto">
                    {mainContentOrder.map(sectionId => (
                        <div key={sectionId}>{renderSection(sectionId)}</div>
                    ))}
                    {showTickets && <TicketsSection />}
                </div>

                <MobileTicketButton showTickets={showTickets} isSoldOut={isSoldOut} isExternal={event.is_external} externalUrl={externalRedirectUrl} eventId={event.id} label={rsvpMode ? rsvpLabel : undefined} />
            </div>
        )
    }

    // ─── BOUTIQUE LAYOUT ─ centered invitation, all air ──────────────────────
    if (pageLayout === 'boutique') {
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="boutique" className="min-h-screen bg-background pb-24" style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                <header className="border-b border-border/60">
                    <div className="container mx-auto px-4 flex h-16 items-center justify-center">
                        <OrganizerHeaderLink />
                    </div>
                </header>

                <main className="container mx-auto px-4 max-w-2xl">
                    {/* Centered invitation hero */}
                    {showHero && (
                        <div className="text-center pt-16 pb-4">
                            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">You&apos;re invited</p>
                            {event.cover_image_url ? (
                                <div className="relative w-24 h-24 rounded-full overflow-hidden mx-auto my-8 shadow-lg">
                                    <Image src={event.cover_image_url} alt={event.title} fill sizes="96px" className="object-cover" />
                                </div>
                            ) : <div className="h-8" />}
                            <h1 data-hh-title className="font-medium leading-[1.1] tracking-[0.005em] max-w-xl mx-auto" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', fontFamily: 'var(--font-heading)' }}>
                                {event.title}
                            </h1>
                            <div className="w-10 h-px bg-border mx-auto my-7" />
                            <div className="text-muted-foreground leading-loose" style={{ fontFamily: 'var(--font-heading)' }}>
                                <p>{formatEventDate(event.start_datetime)}</p>
                                <p>{formatEventTime(event.start_datetime)}</p>
                                {venueVisible && event.venue_name && <p>{event.venue_name}{event.city ? ` · ${event.city}` : ''}</p>}
                            </div>
                            {showCountdown && <div className="mt-8 flex justify-center"><EventCountdown targetDate={event.start_datetime} label={countdownLabel} /></div>}
                            {showSocialProof && recentNames.length > 0 && <div className="mt-6 flex justify-center"><SocialProofTicker names={recentNames} /></div>}
                        </div>
                    )}

                    {mainContentOrder.map(sectionId => (
                        <div key={sectionId}>{renderSection(sectionId)}</div>
                    ))}
                    {showTickets && <TicketsSection />}
                </main>

                <MobileTicketButton showTickets={showTickets} isSoldOut={isSoldOut} isExternal={event.is_external} externalUrl={externalRedirectUrl} eventId={event.id} label={rsvpMode ? rsvpLabel : undefined} />
            </div>
        )
    }

    // ─── POSTER LAYOUT ───────────────────────────────────────────────────────
    if (pageLayout === 'poster') {
        const formattedPosterDate = formatEventDateTime(event.start_datetime)
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="poster" className={cn("min-h-screen bg-black", !textColor && "text-white")} style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                {/* Fixed background effect */}
                {bgStyle !== 'default' ? (
                    <EventPageBackground
                        bgStyle={bgStyle}
                        themeColor={event.theme_color || '#6366f1'}
                        coverImageUrl={event.cover_image_url || undefined}
                        bgImageUrl={bgImageUrl}
                        videoUrl={event.video_url ? (getYouTubeEmbedUrl(event.video_url) ? undefined : event.video_url) : undefined}
                        className="fixed inset-0 z-0"
                    />
                ) : event.cover_image_url ? (
                    <div className="fixed inset-0 z-0">
                        <Image src={event.cover_image_url} alt="" fill priority sizes="100vw" className="object-cover" />
                        <div className="absolute inset-0 bg-black/65" />
                    </div>
                ) : (
                    <div className="fixed inset-0 z-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black" />
                )}

                {/* Transparent sticky header */}
                <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
                    {event.organizer ? (
                        <a
                            href={`https://${event.organizer.slug}.hanghut.com`}
                            className="flex items-center gap-3 font-bold text-white/80 hover:text-white transition-colors"
                        >
                            {event.organizer.profile_photo_url ? (
                                <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/30">
                                    <Image src={event.organizer.profile_photo_url} alt={event.organizer.business_name} fill className="object-cover" />
                                </div>
                            ) : (
                                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                                    {event.organizer.business_name.charAt(0)}
                                </div>
                            )}
                            <span className="text-sm">{event.organizer.business_name}</span>
                        </a>
                    ) : (
                        <Link href="/" className="bg-white/15 backdrop-blur px-3 py-1 rounded-md text-white font-black text-sm">
                            HANGHUT
                        </Link>
                    )}
                    <ShareButton title={event.title} description={event.description} eventId={event.id} dark />
                </header>

                {/* Full-viewport poster hero */}
                <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-4 pt-24 pb-16 gap-6">
                    {/* Badges */}
                    <div className="flex gap-2 justify-center">
                        <span data-hh-badge className="bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full">
                            {event.event_type || 'Event'}
                        </span>
                        {event.is_featured && (
                            <span data-hh-badge className="bg-yellow-400/90 text-yellow-900 text-xs font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full">
                                ⭐ Featured
                            </span>
                        )}
                    </div>

                    {/* Giant title */}
                    <h1
                        data-hh-title
                        className="font-black text-white drop-shadow-2xl leading-[0.95] tracking-[-0.03em]"
                        style={{ fontSize: 'clamp(2.8rem, 9vw, 8.5rem)', fontFamily: 'var(--font-heading)' }}
                    >
                        {event.title}
                    </h1>

                    {/* Date + venue */}
                    <div className="flex items-center gap-3 text-white/70 text-sm font-medium flex-wrap justify-center">
                        <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formattedPosterDate}</span>
                        {event.venue_name && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/35" />
                                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span>
                            </>
                        )}
                    </div>

                    {/* Countdown */}
                    {showCountdown && (
                        <EventCountdown targetDate={event.start_datetime} label={countdownLabel} />
                    )}

                    {/* Social proof */}
                    {showSocialProof && recentNames.length > 0 && (
                        <SocialProofTicker names={recentNames} />
                    )}

                    {/* Ticket CTA */}
                    {showTickets && (
                        <div className="mt-2">
                            <TicketsSection />
                        </div>
                    )}

                    {/* Scroll cue */}
                    <div className="absolute bottom-8 flex flex-col items-center gap-1 text-white/40 text-xs animate-bounce">
                        <span>Scroll</span>
                        <span>↓</span>
                    </div>
                </section>

                {/* Content section slides up over the fixed bg.
                    text-foreground is REQUIRED, not cosmetic: the layout root sets
                    `text-white` for the dark hero, and colour inherits straight into
                    this light panel. Anything inside without its own colour class —
                    the organizer name, section headings — rendered white on white.
                    <Card> was immune (it carries text-card-foreground), which is why
                    the tickets box looked fine while the organizer block vanished. */}
                <div className="relative z-20 bg-background text-foreground rounded-t-3xl shadow-2xl">
                    <div className="container mx-auto px-4 py-16 max-w-3xl">
                        {mainContentOrder.map(sectionId => (
                            <div key={sectionId}>{renderSection(sectionId)}</div>
                        ))}
                    </div>
                </div>

                <MobileTicketButton
                    showTickets={showTickets}
                    isSoldOut={isSoldOut}
                    isExternal={event.is_external}
                    externalUrl={externalRedirectUrl}
                    eventId={event.id}
                    label={rsvpMode ? rsvpLabel : undefined}
                />
            </div>
        )
    }

    // ─── MINIMAL LAYOUT ──────────────────────────────────────────────────────
    if (pageLayout === 'minimal') {
        return (
            <div data-hh-event data-hh-theme={pageTheme} data-hh-layout="minimal" className="min-h-screen bg-background pb-20" style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}>
                <PageHead />
                <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container mx-auto px-4 flex h-16 items-center justify-between">
                        {event.organizer ? (
                            <a href={`https://${event.organizer.slug}.hanghut.com`} className="flex items-center gap-3 font-bold text-xl hover:opacity-80 transition-opacity">
                                {event.organizer.profile_photo_url ? (
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-border">
                                        <Image src={event.organizer.profile_photo_url} alt={event.organizer.business_name} fill className="object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                                        {event.organizer.business_name.charAt(0)}
                                    </div>
                                )}
                                <span className="truncate max-w-[180px] text-base">{event.organizer.business_name}</span>
                            </a>
                        ) : (
                            <Link href="/" className="font-bold text-xl">HANGHUT</Link>
                        )}
                        <ShareButton title={event.title} description={event.description} eventId={event.id} />
                    </div>
                </header>

                <main className="container mx-auto px-4 py-16 max-w-2xl">
                    {/* Compact title block */}
                    <div className="space-y-3 mb-10">
                        <div className="flex gap-2">
                            <Badge data-hh-badge variant="secondary">{event.event_type || 'Event'}</Badge>
                            {event.is_featured && <Badge data-hh-badge className="bg-yellow-500 text-white">Featured</Badge>}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">{event.title}</h1>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm pt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatEventDateTime(event.start_datetime)}</span>
                            {event.venue_name && (
                                <>
                                    <span>·</span>
                                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Countdown if enabled */}
                    {showCountdown && (
                        <div className="mb-10 p-6 bg-muted rounded-2xl flex flex-col items-center">
                            <EventCountdown targetDate={event.start_datetime} label={countdownLabel} />
                        </div>
                    )}

                    {/* Cover image (small, optional) */}
                    {event.cover_image_url && (
                        <div className="mb-10 rounded-2xl overflow-hidden aspect-video">
                            <Image src={event.cover_image_url} alt={event.title} width={672} height={378} className="w-full h-full object-cover" />
                        </div>
                    )}

                    {/* Content sections inline */}
                    {mainContentOrder.map(sectionId => (
                        <div key={sectionId}>{renderSection(sectionId)}</div>
                    ))}

                    {/* Tickets full width */}
                    {showTickets && <TicketsSection />}
                </main>

                <MobileTicketButton
                    showTickets={showTickets}
                    isSoldOut={isSoldOut}
                    isExternal={event.is_external}
                    externalUrl={externalRedirectUrl}
                    eventId={event.id}
                    label={rsvpMode ? rsvpLabel : undefined}
                />
            </div>
        )
    }

    // ─── DEFAULT LAYOUT ──────────────────────────────────────────────────────
    return (
        <div
            data-hh-event
            data-hh-theme={pageTheme}
            className="min-h-screen bg-background pb-20 relative"
            style={{ ...fontStyle, fontFamily: 'var(--font-body)' }}
        >
            {/* Analytics: log a page view (once per session per event) */}
            <EventViewTracker eventId={event.id} />
            {/* Attribution: unconditionally (re-)capture channel/ref on every visit,
                so an influencer /r/<code> ?ref link stamps even for returning viewers
                that EventViewTracker's session-dedup would otherwise skip. */}
            <CaptureAttribution surface="event" />
            {/* SEO: Event structured data for rich search results (skipped for private/unlisted) */}
            {!(event.status === 'hidden' || event.is_subscriber_only || event.invite_only) && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'Event',
                            name: event.title,
                            startDate: event.start_datetime,
                            ...(event.end_datetime ? { endDate: event.end_datetime } : {}),
                            eventStatus: 'https://schema.org/EventScheduled',
                            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
                            ...(event.cover_image_url ? { image: [event.cover_image_url] } : {}),
                            description:
                                (event.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) ||
                                `Get tickets for ${event.title} on HangHut.`,
                            ...(event.venue_name || event.address
                                ? {
                                      location: {
                                          '@type': 'Place',
                                          name: event.venue_name || event.address,
                                          address: {
                                              '@type': 'PostalAddress',
                                              ...(event.address ? { streetAddress: event.address } : {}),
                                              ...(event.city ? { addressLocality: event.city } : {}),
                                              addressCountry: 'PH',
                                          },
                                      },
                                  }
                                : {}),
                            ...(event.organizer?.business_name
                                ? {
                                      organizer: {
                                          '@type': 'Organization',
                                          name: event.organizer.business_name,
                                          ...(event.organizer.slug ? { url: `https://${event.organizer.slug}.hanghut.com` } : {}),
                                      },
                                  }
                                : {}),
                            offers: {
                                '@type': 'Offer',
                                url: `https://hanghut.com/events/${event.id}`,
                                price: (() => {
                                    const tiers = (event.ticket_tiers || []).filter((t: any) => t.is_active !== false)
                                    const prices = tiers.length
                                        ? tiers.map((t: any) => Number(t.price) || 0)
                                        : [Number(event.ticket_price) || 0]
                                    return Math.min(...prices)
                                })(),
                                priceCurrency: 'PHP',
                                availability: 'https://schema.org/InStock',
                            },
                        }),
                    }}
                />
            )}
            {/* Google Fonts */}
            {googleFontUrls.map(url => (
                <link key={url} rel="stylesheet" href={url} />
            ))}
            {/* Apply heading font to all headings within this page. The dark-bg block
                is split in two: the TEXT rules stand down when the organizer picked a
                text colour (they'd otherwise outrank it), while the structural glass/
                border/header rules always apply — a dark background still needs them. */}
            <style>{`[data-hh-event] h1,[data-hh-event] h2,[data-hh-event] h3,[data-hh-event] h4{font-family:var(--font-heading)}${isDarkBg && !textColor ? `
[data-hh-event]{color:#f1f5f9}
[data-hh-event] .text-foreground,[data-hh-event] .text-muted-foreground{color:rgba(248,250,252,0.9)}
[data-hh-event] [class*=prose] p,[data-hh-event] [class*=prose] li{color:rgba(226,232,240,0.9)}
[data-hh-event] [data-hh-card] p,[data-hh-event] [data-hh-card] span{color:rgba(248,250,252,0.85)}
[data-hh-event] [data-hh-card] .text-muted-foreground{color:rgba(203,213,225,0.8)}
` : ''}${isDarkBg ? `
[data-hh-event] .border-border\/50{border-color:rgba(255,255,255,0.12)}
[data-hh-event] .divide-x>*,[data-hh-event] .divide-y>*{border-color:rgba(255,255,255,0.1)}
[data-hh-event] [data-hh-card]{background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15)${textColor ? '' : ';color:#f1f5f9'}}
[data-hh-event] header{background:rgba(0,0,0,0.45)!important;border-color:rgba(255,255,255,0.1)!important;backdrop-filter:blur(20px)!important;color:#fff}
[data-hh-event] header a,[data-hh-event] header span{color:#fff!important}
` : ''}`}</style>
            {/* Art-directed theme CSS — after the base styles so theme rules win ties */}
            {themeCss && <style>{themeCss}</style>}
            {/* Organizer colour picks last (before custom CSS) so they outrank the
                theme + dark-bg rules that pin .text-foreground/.text-muted-foreground. */}
            {(textColor || headingColor) && (
                <style>{`${textColor ? `[data-hh-event]{color:var(--hh-text)}[data-hh-event] .text-foreground{color:var(--hh-text)}[data-hh-event] .text-muted-foreground{color:color-mix(in srgb,var(--hh-text) 70%,transparent)}` : ''}${headingColor ? `[data-hh-event] h1,[data-hh-event] h2,[data-hh-event] h3,[data-hh-event] h4{color:var(--hh-heading)!important}` : ''}`}</style>
            )}
            {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
            {isPreview && <StorefrontPreviewBridge />}

            {/* Full-page background — fixed so it covers the entire scroll */}
            {bgStyle !== 'default' && (
                <EventPageBackground
                    bgStyle={bgStyle}
                    themeColor={event.theme_color || '#6366f1'}
                    coverImageUrl={event.cover_image_url || undefined}
                    bgImageUrl={bgImageUrl}
                    videoUrl={event.video_url ? (getYouTubeEmbedUrl(event.video_url) ? undefined : event.video_url) : undefined}
                    className="fixed inset-0 z-0"
                />
            )}
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative z-50">
                <div className="container mx-auto px-4 flex h-16 items-center justify-between">
                    {event.organizer ? (
                        <a href={`https://${event.organizer.slug}.hanghut.com`} className="flex items-center gap-3 font-bold text-xl hover:opacity-80 transition-opacity">
                            {event.organizer.profile_photo_url ? (
                                <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border">
                                    <Image
                                        src={event.organizer.profile_photo_url}
                                        alt={event.organizer.business_name}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                                    {event.organizer.business_name.charAt(0)}
                                </div>
                            )}
                            <span className="truncate max-w-[200px]">{event.organizer.business_name}</span>
                        </a>
                    ) : (
                        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                            <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-lg">
                                HANGHUT
                            </div>
                        </Link>
                    )}
                </div>
            </header>

            <main className="relative z-10">
                {/* Hero: only show the section component when using default bg (no fixed full-page bg) */}
                {showHero && !isDarkBg && <HeroSection />}
                {/* When dark bg is active, show a compact title overlay instead of the hero */}
                {isDarkBg && (
                    <div className="w-full py-20 px-4 flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: '40vh' }}>
                        <div className="flex gap-2 justify-center">
                            <span data-hh-badge className="bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                                {event.event_type || 'Event'}
                            </span>
                            {event.is_featured && <span data-hh-badge className="bg-yellow-400/90 text-yellow-900 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">Featured</span>}
                        </div>
                        <h1 data-hh-title className="text-4xl md:text-6xl lg:text-7xl font-black text-white drop-shadow-2xl leading-tight tracking-tight max-w-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
                            {event.title}
                        </h1>
                        <div className="flex items-center gap-3 text-white/75 text-sm font-medium flex-wrap justify-center">
                            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatEventDateTime(event.start_datetime)}</span>
                            {event.venue_name && <><span className="w-1 h-1 rounded-full bg-white/40" /><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.venue_name}</span></>}
                        </div>
                        {showCountdown && <EventCountdown targetDate={event.start_datetime} label={countdownLabel} />}
                        {showSocialProof && recentNames.length > 0 && <SocialProofTicker names={recentNames} />}
                    </div>
                )}

                <div className={cn(
                    "container mx-auto px-4 relative z-10",
                    (!isDarkBg && showHero) ? "-mt-8 md:-mt-32" : "mt-4"
                )}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

                        {/* LEFT COLUMN: Main Content Stream */}
                        <div className="lg:col-span-2 space-y-8">
                            {mainContentOrder.map(sectionId => {
                                // Specific wrappers for sections could go here if needed
                                return (
                                    <div key={sectionId}>
                                        {renderSection(sectionId)}
                                    </div>
                                )
                            })}
                        </div>

                        {/* RIGHT COLUMN: Sticky Sidebar (Desktop) */}
                        {showTickets && (
                            <div className="lg:col-span-1 relative">
                                <div className="sticky top-24 space-y-6">
                                    <TicketsSection />

                                    <div className="flex justify-center">
                                        <ShareButton title={event.title} description={event.description} eventId={event.id} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Mobile Sticky Footer Action */}
            <MobileTicketButton
                showTickets={showTickets}
                isSoldOut={isSoldOut}
                isExternal={event.is_external}
                externalUrl={externalRedirectUrl}
                eventId={event.id}
            />
        </div>
    )
}
