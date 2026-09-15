import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/landing/header'
import LandingFooter from '@/components/landing/scenes/footer'
import { MaskedLines, Reveal, SceneLabel } from '@/components/landing/scenes/primitives'
import {
    ArrowRight, ArrowUpRight, CalendarPlus, Armchair, Code2, CreditCard, ScanLine, Mail,
    Store, Users, Ticket, Compass, KeyRound, BookOpen, type LucideIcon,
} from 'lucide-react'

export const metadata: Metadata = {
    title: 'Docs — HangHut',
    description:
        'How to run an event on HangHut: tickets and tiers, seat maps, selling on your own site, payments and payouts, the door, marketing, your storefront, and the API.',
}

/**
 * The docs home. /docs/api is the reference for developers; this is the
 * page for everyone else — what the platform does and where each thing
 * lives in the dashboard. Each guide is a section on this one page, with an
 * anchor, so the whole thing is searchable and linkable without a docs
 * framework. /capabilities remains the terse, machine-readable statement of
 * scope; this is the human one.
 *
 * Every "Where" path is a real dashboard route. Keep it that way.
 */

interface Guide {
    id: string
    icon: LucideIcon
    n: string
    title: string
    lede: string
    where: string
    steps: string[]
    notes?: string[]
    links?: { label: string; href: string }[]
}

const GUIDES: Guide[] = [
    {
        id: 'events',
        icon: CalendarPlus,
        n: '01',
        title: 'Create an event',
        lede: 'Free or paid, one night or a weekend. The guided builder gets a sellable event live in a few minutes.',
        where: 'Dashboard → Events → New event',
        steps: [
            'Basics: title, category, cover image, description.',
            'When & where: date and time (Manila), venue and address. Multi-day events show as a date range.',
            'Tickets: add tiers with a price, quantity and per-order limit, or switch on free RSVP. Each tier can have a sales window (early bird, presale) and be paused with one switch.',
            'Settings: approval flow, invite-only, registration questions, custom terms.',
            'Publish as Active, or as Hidden to share by link only (useful for a dry run).',
        ],
        notes: [
            'Drafts autosave as you go.',
            'Registration questions — Discord handle, T-shirt size, dietary needs — are asked at registration and exported as a CSV from the event’s Responses tab.',
        ],
    },
    {
        id: 'seating',
        icon: Armchair,
        n: '02',
        title: 'Reserved seating',
        lede: 'Draw your venue once. Buyers pick their exact seat; held seats release automatically if a checkout is abandoned.',
        where: 'Event → Seat map',
        steps: [
            'Choose Assigned seating when creating the event; tiers become price categories.',
            'Build sections, rows and seats on the canvas, then assign a tier to each section or seat.',
            'Publish the map. Availability updates live while buyers browse.',
            'Seats are held for the length of checkout, so two people can never buy the same one.',
        ],
        notes: ['A virtual waiting room is available for high-demand on-sales.'],
    },
    {
        id: 'embed',
        icon: Code2,
        n: '03',
        title: 'Sell on your own site',
        lede: 'Paste one snippet and tickets sell on your website, in your colours, with checkout in an overlay.',
        where: 'Event → Embed, or Settings → Embed widget',
        steps: [
            'Copy the snippet: a <div class="hanghut-widget" data-event="…"> plus one <script src="https://hanghut.com/embed.js">.',
            'Or embed your whole storefront with data-partner="your-slug".',
            'Tune it with data attributes: primary colour, background, text colour, radius, theme, layout.',
            'Checkout opens in a modal over your page; the buyer never leaves your site.',
        ],
        links: [{ label: 'REST API & webhooks', href: '/docs/api' }],
    },
    {
        id: 'payments',
        icon: CreditCard,
        n: '04',
        title: 'Payments & payouts',
        lede: 'Local rails, one fee, honest settlement. 2% + ₱15 per paid ticket; free events cost nothing.',
        where: 'Dashboard → Payouts',
        steps: [
            'Buyers pay with QR Ph, GCash, Maya, GrabPay, cards, or direct debit from BPI, UnionBank and RCBC — as guests, no account needed.',
            'Choose whether the ₱15 and/or the 2% is passed to the buyer or absorbed by you (Settings → Pricing).',
            'Complete verification once to unlock payouts to your Philippine bank account.',
            'Request a payout from your available balance; settlement status is synced from the processor, not estimated.',
        ],
        notes: ['Processing fees (roughly 1.4–3.2% by method) are always the organizer’s and are itemised per transaction.'],
        links: [{ label: 'Pricing', href: '/pricing' }],
    },
    {
        id: 'door',
        icon: ScanLine,
        n: '05',
        title: 'At the door',
        lede: 'Scan, sell and check in. Door staff seats are unlimited on every account — the gate is never a billing decision.',
        where: '/scan · Event → Box office · Event → Check-in kiosk',
        steps: [
            'Scanner: open /scan on any phone, sign in as a scanner or cashier, point at the QR. Duplicates are rejected and the seat is shown.',
            'Box office: sell at the door — cash with tendered-amount tracking, or a payment link — with a till close-out at the end of the night.',
            'Kiosk: for free events, a walk-up name + email + party-size check-in on a tablet.',
            'Add staff under Team with the scanner or cashier role.',
        ],
    },
    {
        id: 'marketing',
        icon: Mail,
        n: '06',
        title: 'Marketing',
        lede: 'Fill the room and bring people back. Campaigns, automations and a customer list that already knows who’s who.',
        where: 'Dashboard → Marketing · Dashboard → Customers',
        steps: [
            'Campaigns: write once, send to all subscribers, one event’s attendees, a customer segment, or a hand-picked list. Schedule for later.',
            '"Skip anyone emailed in the last 7 days" is on by default so nobody gets two of your emails in a week.',
            'Automations: welcome, new-event announcements, pre- and post-event emails, open-cart recovery, win-back.',
            'Customers: revenue, lifetime value and segments — Champions, Loyal, At-risk, Open carts — with CSV export.',
            'Referral links for influencers and partners, with attributed sales.',
        ],
        notes: ['Transactional email (tickets, confirmations, reminders) is never metered.'],
    },
    {
        id: 'storefront',
        icon: Store,
        n: '07',
        title: 'Your storefront',
        lede: 'A brand page at hanghut.com/you — or on your own domain — with every upcoming event on it.',
        where: 'Dashboard → Settings → Branding · Settings → Custom domain',
        steps: [
            'Pick a theme, fonts and colours; add custom CSS if you want to go further.',
            'Add your logo, cover, socials and a newsletter sign-up.',
            'Connect a custom domain: add the CNAME (and a TXT record if asked) at your registrar and press Check status.',
        ],
    },
    {
        id: 'more',
        icon: Compass,
        n: '08',
        title: 'Beyond tickets',
        lede: 'The same account also runs the things around an event.',
        where: 'Dashboard → Experiences · Merch · Subscriptions · Team',
        steps: [
            'Experiences: bookable tours, classes and activities on their own schedule, with a hosted pass for guests.',
            'Merch: a catalog sold with tickets or on its own, collected at the venue.',
            'Subscriptions: paid memberships and fan tiers with perks and subscriber discounts.',
            'Team: owner, manager, finance, marketing, scanner and cashier roles.',
        ],
    },
]

const QUICK: { icon: LucideIcon; label: string; href: string; hint: string }[] = [
    { icon: KeyRound, label: 'API reference', href: '/docs/api', hint: 'Events, checkout, tickets, orders, webhooks. curl, JS, Python, PHP, Ruby.' },
    { icon: BookOpen, label: 'Capabilities', href: '/capabilities', hint: 'The factual list of what the platform does — and does not — do.' },
    { icon: Ticket, label: 'Pricing', href: '/pricing', hint: '2% + ₱15 per paid ticket. No monthly fee.' },
]

export default function DocsPage() {
    return (
        <div className="landing-theme flex min-h-dvh flex-col font-body antialiased">
            <Header />
            <main className="flex-1">
                {/* ── Hero ───────────────────────────────────────────── */}
                <section className="relative overflow-hidden pt-20">
                    <div aria-hidden className="pointer-events-none absolute -right-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[var(--lp-brand)] opacity-[0.08] blur-[120px]" />
                    <div className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:px-12 md:pb-20 md:pt-24">
                        <Reveal className="flex flex-col gap-6">
                            <SceneLabel index="00" label="Docs" />
                            <h1 className="lp-display max-w-5xl text-5xl leading-[0.9] text-[var(--lp-text)] md:text-8xl">
                                <MaskedLines lines={['What it does,', 'and how to do it.']} />
                            </h1>
                            <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)] md:text-xl">
                                Eight guides that cover the whole platform, from the first event to the last payout.
                                Each one tells you where the thing lives in your dashboard.
                            </p>
                        </Reveal>

                        {/* Contents */}
                        <Reveal delay={0.1} className="mt-12">
                            <ol className="grid gap-px overflow-hidden rounded-[22px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-4">
                                {GUIDES.map((g) => {
                                    const Icon = g.icon
                                    return (
                                        <li key={g.id}>
                                            <a href={`#${g.id}`} className="group flex h-full items-center gap-4 bg-[var(--lp-void)] px-5 py-4 transition-colors hover:bg-[var(--lp-deep)]">
                                                <span className="lp-mono text-[11px] text-[var(--lp-brand-soft)]">{g.n}</span>
                                                <Icon className="h-4 w-4 text-[var(--lp-dim)]" />
                                                <span className="flex-1 text-[14px] font-semibold text-[var(--lp-text)]">{g.title}</span>
                                                <ArrowRight className="h-4 w-4 -translate-x-1 text-[var(--lp-dim)] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                                            </a>
                                        </li>
                                    )
                                })}
                            </ol>
                        </Reveal>

                        <Reveal delay={0.15} className="mt-4 grid gap-px overflow-hidden rounded-[22px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] sm:grid-cols-3">
                            {QUICK.map((q) => {
                                const Icon = q.icon
                                return (
                                    <Link key={q.href} href={q.href} className="group flex items-start gap-4 bg-[var(--lp-deep)] px-5 py-5 transition-colors hover:bg-[var(--lp-void)]">
                                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--lp-line-strong)] bg-[var(--lp-brand)]/10 text-[var(--lp-brand-soft)]">
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-text)]">
                                                {q.label}
                                                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--lp-dim)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                            </span>
                                            <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lp-muted)]">{q.hint}</span>
                                        </span>
                                    </Link>
                                )
                            })}
                        </Reveal>
                    </div>
                    <div className="lp-rule" />
                </section>

                {/* ── Guides ─────────────────────────────────────────── */}
                {GUIDES.map((g, i) => {
                    const Icon = g.icon
                    const alt = i % 2 === 1
                    return (
                        <section
                            key={g.id}
                            id={g.id}
                            className={`scroll-mt-24 py-20 md:py-28 ${alt ? 'border-y border-[var(--lp-line)] bg-[var(--lp-deep)]' : ''}`}
                        >
                            <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-[1fr_1.4fr] md:gap-16 md:px-12">
                                <Reveal className="flex flex-col gap-6 md:sticky md:top-28 md:self-start">
                                    <SceneLabel index={g.n} label={g.title} />
                                    <h2 className="lp-display text-4xl leading-[0.92] text-[var(--lp-text)] md:text-6xl">
                                        <MaskedLines lines={[g.title]} />
                                    </h2>
                                    <p className="max-w-md text-lg leading-relaxed text-[var(--lp-muted)]">{g.lede}</p>
                                    <div className="flex items-start gap-3 rounded-2xl border border-[var(--lp-line-strong)] bg-[var(--lp-void)] p-4">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--lp-brand)]/10 text-[var(--lp-brand-soft)]">
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span>
                                            <span className="lp-mono block text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">Where</span>
                                            <span className="mt-1 block text-[14px] font-medium text-[var(--lp-text)]">{g.where}</span>
                                        </span>
                                    </div>
                                </Reveal>

                                <Reveal delay={0.08}>
                                    <ol className="divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
                                        {g.steps.map((s, j) => (
                                            <li key={j} className="grid grid-cols-[2.5rem_1fr] gap-4 py-5">
                                                <span className="lp-mono pt-0.5 text-[12px] text-[var(--lp-brand-soft)]">{String(j + 1).padStart(2, '0')}</span>
                                                <p className="text-[15.5px] leading-relaxed text-[var(--lp-text)]">{s}</p>
                                            </li>
                                        ))}
                                    </ol>
                                    {g.notes && (
                                        <ul className="mt-6 space-y-2">
                                            {g.notes.map((n) => (
                                                <li key={n} className="flex gap-3 text-[14px] leading-relaxed text-[var(--lp-muted)]">
                                                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 rounded-[2px] bg-[var(--lp-brand)]" />
                                                    {n}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {g.links && (
                                        <div className="mt-6 flex flex-wrap gap-2">
                                            {g.links.map((l) => (
                                                <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lp-line-strong)] px-4 py-2 text-[13px] font-medium text-[var(--lp-text)] transition-colors hover:border-[var(--lp-brand-soft)] hover:bg-[var(--lp-void)]">
                                                    {l.label} <ArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </Reveal>
                            </div>
                        </section>
                    )
                })}

                {/* ── Close ──────────────────────────────────────────── */}
                <section className="px-6 py-24 md:px-12 md:py-32">
                    <Reveal className="mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-[var(--lp-line-strong)] bg-[var(--lp-void)] p-8 md:p-14">
                        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-end">
                            <div>
                                <p className="lp-mono text-[11px] uppercase tracking-[0.28em] text-[var(--lp-dim)]">Still stuck?</p>
                                <h2 className="lp-display mt-4 text-4xl leading-[0.92] text-[var(--lp-text)] md:text-5xl">
                                    Ask a person.
                                </h2>
                                <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--lp-muted)]">
                                    Message us from the support bubble in your dashboard and someone from the team picks it up. On the night of a show, that means fast.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3 md:justify-end">
                                <Link href="/organizer/login" className="group inline-flex items-center gap-2 rounded-full bg-[var(--lp-brand)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-brand-fg)]">
                                    <Users className="h-4 w-4" /> Open dashboard <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                                <a href="mailto:contact@hanghut.com" className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-line-strong)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-text)] transition-colors hover:bg-[var(--lp-deep)]">
                                    <Mail className="h-4 w-4" /> Email us
                                </a>
                            </div>
                        </div>
                    </Reveal>
                </section>
            </main>
            <LandingFooter />
        </div>
    )
}

