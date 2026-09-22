import {
    UserPlus, CalendarClock, PartyPopper, Megaphone, ShoppingCart, HeartHandshake,
    type LucideIcon,
} from 'lucide-react'
import type { AutomationTrigger } from '@/lib/marketing/automation-actions'

/** `unit` picks how offset_minutes is shown and edited. */
export type OffsetCfg = { label: string; hint: string; unit: 'hours' | 'days' }

export interface TriggerMeta {
    title: string
    description: string
    icon: LucideIcon
    offset?: OffsetCfg
    tokens: string[]
    subjectPlaceholder: string
    /**
     * Half the brief, written once here rather than asked of the organizer every
     * time. The AI already knows what an abandoned-cart email is for; making
     * someone type that out is the difference between a button they use and one
     * they don't.
     */
    aiBrief: string
    aiPlaceholder: string
}

export const META: Record<AutomationTrigger, TriggerMeta> = {
    welcome: {
        title: 'Welcome email', icon: UserPlus,
        description: 'Sent automatically when someone subscribes to your list.',
        tokens: ['{{first_name}}', '{{business_name}}'],
        subjectPlaceholder: 'Welcome to {{business_name}}!',
        aiBrief: 'Write a warm welcome email for someone who just subscribed to this event organizer\'s mailing list. Thank them, say briefly what kind of events to expect, and invite them to browse what is on.',
        aiPlaceholder: 'e.g. mention we run stand-up nights every Thursday in Makati',
    },
    pre_event: {
        title: 'Pre-event reminder', icon: CalendarClock,
        offset: { label: 'Hours before the event', hint: 'e.g. 24 = one day before', unit: 'hours' },
        description: "Your own reminder sent before an event starts, to that event's attendees.",
        tokens: ['{{event_card}}', '{{first_name}}', '{{event_title}}', '{{event_date}}', '{{event_url}}', '{{event_venue}}', '{{business_name}}'],
        subjectPlaceholder: 'See you at {{event_title}}',
        aiBrief: 'Write a short reminder email to someone who already has a ticket for an upcoming event. Build anticipation and cover the practical things: when to arrive, to bring their ticket QR, and where to ask questions. Use the {{event_title}} and {{event_date}} placeholders literally.',
        aiPlaceholder: 'e.g. doors open 30 mins early, parking is at the back, no outside food',
    },
    post_event: {
        title: 'Post-event thank-you', icon: PartyPopper,
        offset: { label: 'Hours after the event', hint: 'e.g. 24 = one day after', unit: 'hours' },
        description: "Sent after an event ends, to that event's attendees.",
        tokens: ['{{first_name}}', '{{event_title}}', '{{event_date}}', '{{event_url}}', '{{business_name}}'],
        subjectPlaceholder: 'Thanks for coming to {{event_title}}',
        aiBrief: 'Write a warm thank-you email to someone who attended an event that has just finished. Thank them sincerely, invite feedback, and gently point them at what is coming up next. Use the {{event_title}} placeholder literally.',
        aiPlaceholder: 'e.g. ask them to tag us in photos, tease that the next show is in November',
    },
    new_event: {
        title: 'New event announcement', icon: Megaphone,
        description: 'Sent to all your subscribers when you publish a new event.',
        tokens: ['{{event_card}}', '{{first_name}}', '{{event_title}}', '{{event_date}}', '{{event_image}}', '{{event_url}}', '{{event_venue}}', '{{business_name}}'],
        subjectPlaceholder: 'Just announced: {{event_title}}',
        aiBrief: 'Write an announcement email telling subscribers that a new event has just gone on sale. Lead with excitement. Put the token {{event_card}} on its own line where the event should appear -- it expands into a poster, date, venue, price and a Get Tickets button, so do not write your own button or repeat those details around it. Use {{event_title}} literally if you mention the name in the copy.',
        aiPlaceholder: 'e.g. limited to 80 seats, early-bird pricing for the first week',
    },
    abandoned_checkout: {
        title: 'Abandoned checkout recovery', icon: ShoppingCart,
        offset: { label: 'Hours after checkout is abandoned', hint: 'e.g. 1 = nudge an hour later', unit: 'hours' },
        description: 'Nudges a shopper who started buying tickets but never finished.',
        tokens: ['{{first_name}}', '{{event_title}}', '{{checkout_url}}', '{{event_image}}', '{{event_url}}', '{{business_name}}'],
        subjectPlaceholder: 'You left something behind 👀',
        aiBrief: 'Write a short, light-touch email to someone who started buying tickets for an event but did not finish paying. Be helpful rather than pushy, note that their spot is not held indefinitely, and make the main button link to {{checkout_url}} with text like "Finish checkout". Use the {{event_title}} and {{checkout_url}} placeholders literally.',
        aiPlaceholder: 'e.g. mention we accept GCash and Maya, offer help if the payment failed',
    },
    winback: {
        title: 'Win-back quiet customers', icon: HeartHandshake,
        offset: { label: 'Days since last purchase', hint: 'e.g. 120 = quiet for 4 months', unit: 'days' },
        description: 'Re-engages past customers who have gone quiet. At most once per customer each quarter.',
        tokens: ['{{first_name}}', '{{business_name}}'],
        subjectPlaceholder: 'We miss you — here’s what’s new',
        aiBrief: 'Write a friendly email to a past customer who has not bought a ticket in several months. Acknowledge it has been a while without guilt-tripping, remind them what they enjoyed, and invite them back to see what is on.',
        aiPlaceholder: 'e.g. we have a new venue now, mention the monthly open-mic',
    },
}

export const ORDER: AutomationTrigger[] = [
    'welcome', 'new_event', 'pre_event', 'post_event', 'abandoned_checkout', 'winback',
]

/**
 * Example values for the preview. Real merge happens in the send worker; this
 * only exists so the organizer does not have to read raw {{tokens}} and imagine
 * the result.
 */
export const PREVIEW_TOKENS: Record<string, string> = {
    '{{first_name}}': 'Maria',
    '{{event_title}}': 'Friday Night Stand-Up',
    '{{event_date}}': 'Fri, 10 Oct · 8:00 PM',
    '{{event_venue}}': 'The Comedy Bar, Makati',
    '{{event_price}}': 'From ₱500',
    '{{event_url}}': '#',
    '{{event_image}}': 'https://placehold.co/600x300/4f46e5/ffffff?text=Event+poster',
    '{{checkout_url}}': '#',
    // Stand-in for the real block the send worker builds from the live event.
    // Shaped like the real one so the preview shows the actual layout.
    '{{event_card}}': `<table role="presentation" width="100%" style="margin:18px 0;border-collapse:separate;"><tr><td style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
<div style="background:#4f46e5;color:#fff;text-align:center;padding:42px 12px;font-weight:700;">Event poster</div>
<div style="padding:18px 20px;font-family:sans-serif;">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.05em;">From ₱500</p>
<h2 style="margin:0 0 10px;font-size:20px;font-weight:800;color:#111827;">Friday Night Stand-Up</h2>
<p style="margin:0 0 4px;font-size:14px;color:#475569;">📅 Fri, 10 Oct · 8:00 PM</p>
<p style="margin:0 0 16px;font-size:14px;color:#475569;">📍 The Comedy Bar, Makati</p>
<a href="#" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:11px 26px;border-radius:999px;">Get Tickets →</a>
</div></td></tr></table>`,
}

export function formatPeso(n: number): string {
    const v = Number(n) || 0
    if (!v) return '₱0'
    return '₱' + v.toLocaleString('en-PH', { maximumFractionDigits: 0 })
}
