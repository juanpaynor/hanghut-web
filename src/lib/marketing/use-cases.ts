/**
 * Use-case / solution content by event vertical. Drives the /use-cases hub and
 * the /use-cases/[slug] template. Add a `caseStudy` to any vertical later to
 * surface a real customer story on its page.
 */

export interface UseCaseSolution {
    /** Which HangHut capability this maps to. */
    title: string
    body: string
}

export interface UseCaseStudy {
    quote: string
    author: string
    role: string
    metrics?: { value: string; label: string }[]
}

export interface UseCase {
    slug: string
    /** Short chip label used on the hub grid. */
    name: string
    /** Playful emoji for the brand-forward design. */
    emoji: string
    /** lucide-react icon name. */
    icon: string
    /** Tailwind accent token, e.g. 'indigo' | 'orange' | 'emerald'. */
    accent: AccentName
    eyebrow: string
    headline: string
    subhead: string
    challenges: { title: string; body: string }[]
    solutions: UseCaseSolution[]
    /** Quick feature chips shown under the hero. */
    features: string[]
    /** Optional vertical-specific FAQs (merged with the generic set on the page). */
    faqs?: { q: string; a: string }[]
    caseStudy?: UseCaseStudy
}

export type AccentName = 'indigo' | 'orange' | 'emerald' | 'violet' | 'sky' | 'rose'

export const ACCENT: Record<AccentName, { text: string; bg: string; ring: string; dot: string; grad: string; soft: string; glow: string; border: string }> = {
    indigo: { text: 'text-indigo-600', bg: 'bg-indigo-50', ring: 'ring-indigo-200', dot: 'bg-indigo-500', grad: 'from-indigo-500 to-violet-500', soft: 'from-indigo-100', glow: 'bg-indigo-400', border: 'border-indigo-200' },
    orange: { text: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-200', dot: 'bg-orange-500', grad: 'from-orange-500 to-amber-500', soft: 'from-orange-100', glow: 'bg-orange-400', border: 'border-orange-200' },
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200', dot: 'bg-emerald-500', grad: 'from-emerald-500 to-teal-500', soft: 'from-emerald-100', glow: 'bg-emerald-400', border: 'border-emerald-200' },
    violet: { text: 'text-violet-600', bg: 'bg-violet-50', ring: 'ring-violet-200', dot: 'bg-violet-500', grad: 'from-violet-500 to-fuchsia-500', soft: 'from-violet-100', glow: 'bg-violet-400', border: 'border-violet-200' },
    sky: { text: 'text-sky-600', bg: 'bg-sky-50', ring: 'ring-sky-200', dot: 'bg-sky-500', grad: 'from-sky-500 to-cyan-500', soft: 'from-sky-100', glow: 'bg-sky-400', border: 'border-sky-200' },
    rose: { text: 'text-rose-600', bg: 'bg-rose-50', ring: 'ring-rose-200', dot: 'bg-rose-500', grad: 'from-rose-500 to-pink-500', soft: 'from-rose-100', glow: 'bg-rose-400', border: 'border-rose-200' },
}

export const USE_CASES: UseCase[] = [
    {
        slug: 'live-music',
        emoji: '🎤',
        name: 'Live Music & Concerts',
        icon: 'Music',
        accent: 'violet',
        eyebrow: 'For promoters & venues',
        headline: 'Sell out your next show',
        subhead: 'Reserved seating, tiered pricing, and instant mobile check-in — everything a live-music promoter needs to run a smooth door.',
        challenges: [
            { title: 'Reserved seating is a nightmare', body: 'Spreadsheets and manual seat assignments fall apart the moment a show gets popular.' },
            { title: 'Tiered pricing gets messy', body: 'VIP, GA, early-bird — juggling prices and inventory across tiers invites overselling.' },
            { title: 'Slow entry lines', body: 'Paper lists and screenshot-checking create bottlenecks at the door.' },
        ],
        solutions: [
            { title: 'Interactive seat maps', body: 'Build your venue once, set per-tier pricing, and let fans pick their exact seat. Held seats release automatically if checkout is abandoned.' },
            { title: 'Multiple ticket tiers', body: 'VIP, GA, early-bird, tables — each with its own price and inventory, sold in one flow.' },
            { title: 'Seconds-fast QR check-in', body: 'Scan tickets at the gate; the app rejects duplicates and shows the seat instantly.' },
        ],
        features: ['Seat maps', 'Tiered pricing', 'QR check-in', 'GCash / cards / QRPh', 'Embed on your site'],
    },
    {
        slug: 'sports-fitness',
        emoji: '🏃',
        name: 'Sports & Fitness',
        icon: 'Dumbbell',
        accent: 'emerald',
        eyebrow: 'For gyms, leagues & race organizers',
        headline: 'Fill every class, match, and race',
        subhead: 'From weekly classes to marathon registrations, take bookings and payments without the back-and-forth.',
        challenges: [
            { title: 'Recurring sessions are hard to manage', body: 'Weekly classes and leagues mean constant re-posting and manual headcounts.' },
            { title: 'Free events still need RSVPs', body: 'Community runs and open gyms need a headcount even when there’s no ticket to sell.' },
            { title: 'Waivers and details scattered', body: 'Collecting participant info happens over DMs and forms that don’t sync.' },
        ],
        solutions: [
            { title: 'RSVP for free events', body: 'Turn on one-tap RSVP for no-cost sessions — collect a headcount and attendee details with no checkout.' },
            { title: 'Custom registration questions', body: 'Ask for shirt size, waiver acknowledgement, or emergency contact right at sign-up.' },
            { title: 'Fast repeat scheduling', body: 'Spin up the next session in minutes and reuse your setup.' },
        ],
        features: ['Free-event RSVP', 'Registration questions', 'QR check-in', 'Attendee insights'],
    },
    {
        slug: 'markets-popups',
        emoji: '🛍️',
        name: 'Markets & Pop-ups',
        icon: 'ShoppingBag',
        accent: 'orange',
        eyebrow: 'For organizers & brands',
        headline: 'Drive foot traffic to your pop-up',
        subhead: 'Free-entry or paid, get people through the door and put your event on the map — literally.',
        challenges: [
            { title: 'Hard to get discovered', body: 'A great market means nothing if the right crowd never hears about it.' },
            { title: 'Entry can be free — but you still want data', body: 'You want to know who’s coming without forcing a checkout.' },
            { title: 'Promoting across channels is tedious', body: 'Copy-pasting event links to every platform eats your time.' },
        ],
        solutions: [
            { title: 'Discovery on the HangHut map', body: 'Your event shows up when locals browse what’s happening near them, sorted by category.' },
            { title: 'One-tap RSVP', body: 'Capture interest and a headcount for free-entry pop-ups without a payment step.' },
            { title: 'Embed on your own site', body: 'Drop your events straight onto your website or Linktree with a copy-paste widget.' },
        ],
        features: ['Map discovery', 'Free-event RSVP', 'Embed widget', 'Categories & tags'],
    },
    {
        slug: 'workshops-classes',
        emoji: '🎨',
        name: 'Workshops & Classes',
        icon: 'GraduationCap',
        accent: 'sky',
        eyebrow: 'For creators & educators',
        headline: 'Book out every seat in the room',
        subhead: 'Limited-capacity workshops with clean sign-ups, prerequisites, and follow-up — without the admin.',
        challenges: [
            { title: 'Capacity limits are strict', body: 'Overbooking a hands-on class ruins the experience for everyone.' },
            { title: 'You need info before the session', body: 'Skill level, dietary needs, materials — you need answers up front.' },
            { title: 'Keeping attendees warm', body: 'Reminders and repeat bookings usually mean manual messaging.' },
        ],
        solutions: [
            { title: 'Hard capacity caps', body: 'Set a limit and HangHut stops sales the moment you’re full — no overbooking.' },
            { title: 'Custom sign-up questions', body: 'Collect exactly what you need at registration, tied to each attendee.' },
            { title: 'Built-in email marketing', body: 'Send reminders and announce your next class with lifecycle emails and drafts.' },
        ],
        features: ['Capacity limits', 'Registration questions', 'Email marketing', 'Custom ticket design'],
    },
    {
        slug: 'business-conferences',
        emoji: '💼',
        name: 'Business & Conferences',
        icon: 'Briefcase',
        accent: 'indigo',
        eyebrow: 'For summits, expos & networking',
        headline: 'Run a professional event end-to-end',
        subhead: 'Multi-tier passes, branded tickets, and a polished on-site experience that reflects your brand.',
        challenges: [
            { title: 'Your brand has to look the part', body: 'Generic tickets and checkout undercut a premium, professional event.' },
            { title: 'Complex pass structures', body: 'Delegate, speaker, VIP, group — pricing gets complicated fast.' },
            { title: 'On-site check-in must be flawless', body: 'Long lines at a corporate event are a bad first impression.' },
        ],
        solutions: [
            { title: 'Custom-designed tickets', body: 'Your logo, colors, banner, and message on the ticket page attendees actually see.' },
            { title: 'Multiple pass tiers', body: 'Sell delegate, speaker, and VIP passes with separate inventory in one storefront.' },
            { title: 'Embeddable checkout', body: 'Sell tickets directly on your event’s own website with the embed widget — no redirect.' },
        ],
        features: ['Branded ticket design', 'Multi-tier passes', 'Embed widget', 'QR check-in'],
    },
    {
        slug: 'community-social',
        emoji: '🎉',
        name: 'Community & Social',
        icon: 'Users',
        accent: 'rose',
        eyebrow: 'For hosts & clubs',
        headline: 'Turn your community into a crew',
        subhead: 'From casual meetups to member socials, gather your people and grow the group every time.',
        challenges: [
            { title: 'Meetups live and die by turnout', body: 'You need an easy way to rally people and confirm who’s actually coming.' },
            { title: 'Growing beyond your existing circle', body: 'Reaching new people outside your DMs is the hard part.' },
            { title: 'Keeping momentum between events', body: 'It’s easy to lose the crowd after one great night.' },
        ],
        solutions: [
            { title: 'One-tap RSVP + join flow', body: 'Free meetups get a simple RSVP; hosts approve joiners into the crew.' },
            { title: 'Discovery to reach new faces', body: 'Show up on the map so nearby people can find and join your hangouts.' },
            { title: 'Re-engage your audience', body: 'Your attendee list carries over — announce the next one with built-in email tools.' },
        ],
        features: ['RSVP & join', 'Map discovery', 'Attendee list', 'Email marketing'],
    },
]

export function getUseCase(slug: string): UseCase | undefined {
    return USE_CASES.find((u) => u.slug === slug)
}
