'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import {
    Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Eye, MousePointerClick, ShoppingCart, TrendingUp, Users, Mail, Ticket, Share2, CalendarPlus, Armchair, Radio } from 'lucide-react'
import { format } from 'date-fns'

interface Analytics {
    totals: Record<string, number>
    unique_views: number
    daily: { date: string; views: number; get_tickets: number }[]
    funnel: { views: number; get_tickets: number; checkout_started: number; purchased: number; abandoned?: number }
    /** Added by 20261021120000. Optional so an older cached payload still renders. */
    sources?: { channel: string; visitors: number; checkouts: number; orders: number; revenue: number }[]
}
interface Customers {
    total_buyers: number
    returning_to_organizer: number
    new_to_organizer: number
    bought_this_event_before: number
}
interface EmailCampaign {
    id: string
    subject: string
    sent_at: string | null
    recipient_count: number
    sent_count: number
    delivered_count: number
    opened_count: number
    clicked_count: number
}
interface Props {
    analytics: Analytics | null
    customers: Customers | null
    emailCampaigns: EmailCampaign[]
}

const fmtPct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—')

/** Friendly names for the channels the tracker emits. Anything unmapped falls
 *  through as-is, so a new source never shows up as blank. */
const CHANNEL_LABEL: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    twitter: 'X / Twitter',
    youtube: 'YouTube',
    google: 'Google',
    search: 'Search',
    link_in_bio: 'Link in bio',
    email: 'Email',
    share: 'Shared link',
    embed: 'Embedded widget',
    storefront: 'Your storefront',
    landing: 'HangHut landing',
    discover: 'HangHut Discover',
    event: 'Event page',
    app: 'HangHut app',
    direct: 'Direct / unknown source',
    unknown: 'Not recorded',
    viber: 'Viber',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
}

const peso = (n: number) =>
    `\u20b1${Math.round(n).toLocaleString()}`

/**
 * Where the audience came from.
 *
 * Deliberately NO conversion column. `visitors` is a browser count that ad
 * blockers and the consent gate reduce, while `orders` comes from the orders
 * table and is complete — the funnel card above already explains that on this
 * very event more people bought than were recorded reaching checkout. Dividing
 * one by the other produces rates over 100%, so the two are shown side by side
 * and the organizer is told why they do not reconcile.
 */
function TrafficSources({
    sources,
}: {
    sources: { channel: string; visitors: number; checkouts: number; orders: number; revenue: number }[]
}) {
    if (!sources.length) return null

    const totalRevenue = sources.reduce((sum, s) => sum + (s.revenue || 0), 0)
    const totalVisitors = sources.reduce((sum, s) => sum + (s.visitors || 0), 0)

    return (
        <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
                <Radio className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Where your audience came from</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
                First touch — credited to whatever brought someone in, even if they came back later.
            </p>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                            <th className="pb-2 font-medium">Source</th>
                            <th className="pb-2 font-medium text-right">Visitors</th>
                            <th className="pb-2 font-medium text-right">Orders</th>
                            <th className="pb-2 font-medium text-right">Revenue</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {sources.map(s => {
                            const share = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0
                            return (
                                <tr key={s.channel}>
                                    <td className="py-2.5 pr-3">
                                        <span className="font-medium">
                                            {CHANNEL_LABEL[s.channel] ?? s.channel}
                                        </span>
                                        {/* A revenue share bar rather than a number: the
                                            eye reads relative size faster than it reads
                                            four percentages down a column. */}
                                        {share > 0 && (
                                            <div className="mt-1 h-1 w-full max-w-[140px] rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary/70"
                                                    style={{ width: `${Math.max(share, 2)}%` }}
                                                />
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                                        {s.visitors > 0 ? s.visitors.toLocaleString() : '—'}
                                    </td>
                                    <td className="py-2.5 text-right tabular-nums font-medium">
                                        {s.orders > 0 ? s.orders.toLocaleString() : '—'}
                                    </td>
                                    <td className="py-2.5 text-right tabular-nums font-medium">
                                        {s.revenue > 0 ? peso(s.revenue) : '—'}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                Visitors are counted in the browser, so ad blockers and privacy settings
                reduce them. Orders and revenue come from your actual sales and are complete —
                which is why a source can show orders with no visitors, and why we do not
                divide one by the other.
                {totalVisitors === 0 && ' No visitor data has been recorded for this event yet.'}
            </p>
        </Card>
    )
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
    return (
        <Card className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </Card>
    )
}

export function EventAnalytics({ analytics, customers, emailCampaigns }: Props) {
    const totals = analytics?.totals ?? {}
    const rawFunnel = analytics?.funnel ?? { views: 0, get_tickets: 0, checkout_started: 0, purchased: 0 }
    // `abandoned` was added to the RPC after this component shipped, so it is
    // optional: an organizer on a cached payload sees the rest, not a crash.
    const funnel = { ...rawFunnel, abandoned: rawFunnel.abandoned ?? 0 }
    /** Orders created, paid or not. The denominator for checkout completion. */
    const orders = funnel.purchased + funnel.abandoned
    const uniqueViews = analytics?.unique_views ?? 0
    const daily = (analytics?.daily ?? []).map(d => ({ ...d, label: format(new Date(d.date), 'MMM d') }))

    const presses = [
        { key: 'get_tickets', label: 'Get Tickets', icon: Ticket, value: totals.get_tickets ?? 0 },
        { key: 'pick_seats', label: 'Pick Seats', icon: Armchair, value: totals.pick_seats ?? 0 },
        { key: 'share', label: 'Share', icon: Share2, value: totals.share ?? 0 },
        { key: 'add_to_calendar', label: 'Add to Calendar', icon: CalendarPlus, value: totals.add_to_calendar ?? 0 },
    ]

    const funnelSteps = [
        { label: 'Page views', value: funnel.views, color: 'bg-blue-500' },
        { label: 'Get Tickets', value: funnel.get_tickets, color: 'bg-indigo-500' },
        { label: 'Checkout started', value: funnel.checkout_started, color: 'bg-violet-500' },
        { label: 'Purchased', value: funnel.purchased, color: 'bg-emerald-500' },
    ]
    const funnelMax = Math.max(funnel.views, 1)

    const newCount = customers?.new_to_organizer ?? 0
    const returningCount = customers?.returning_to_organizer ?? 0
    const customerPie = [
        { name: 'New', value: newCount, color: '#6366f1' },
        { name: 'Returning', value: returningCount, color: '#10b981' },
    ]
    const hasCustomers = (customers?.total_buyers ?? 0) > 0

    return (
        <div className="space-y-6">
            {/* ── Stat cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Eye} label="Page Views" value={funnel.views.toLocaleString()} sub={`${uniqueViews.toLocaleString()} unique`} />
                <StatCard icon={MousePointerClick} label="Get Tickets" value={(totals.get_tickets ?? 0).toLocaleString()} sub="CTA presses" />
                <StatCard icon={ShoppingCart} label="Checkout Started" value={funnel.checkout_started.toLocaleString()} />
                <StatCard icon={TrendingUp} label="Conversion" value={fmtPct(funnel.purchased, funnel.views)} sub={`${funnel.purchased} purchased`} />
            </div>

            {/* ── Views over time ──────────────────────────────────── */}
            <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><Eye className="h-4 w-4" /> Views over time (30 days)</h3>
                {daily.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No views recorded yet.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={daily}>
                            <defs>
                                <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                            <Tooltip />
                            <Area type="monotone" dataKey="views" name="Views" stroke="#6366f1" fill="url(#vGrad)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* ── Funnel ───────────────────────────────────────── */}
                <Card className="p-5">
                    <h3 className="font-semibold mb-4">Conversion funnel</h3>
                    <div className="space-y-3">
                        {funnelSteps.map((s, i) => (
                            <div key={s.label}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>{s.label}</span>
                                    <span className="font-medium">
                                        {s.value.toLocaleString()}
                                        {i > 0 && <span className="text-muted-foreground ml-2 text-xs">{fmtPct(s.value, funnel.views)}</span>}
                                    </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full ${s.color}`} style={{ width: `${Math.max((s.value / funnelMax) * 100, s.value > 0 ? 4 : 0)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Abandoned orders are NOT a fifth bar: they are not a stage
                        below Purchased, they are the leak out of it. Shown here
                        instead, and compared only against Purchased — both come
                        from the orders table, so the two can honestly be divided.
                        The three steps above are browser events, which ad blockers
                        and the consent gate drop; on this very event more people
                        bought than were ever recorded reaching checkout, so
                        `checkout_started − purchased` is not a drop-off. */}
                    {orders > 0 && (
                        <div className="mt-5 pt-4 border-t">
                            <div className="flex items-baseline justify-between text-sm">
                                <span className="text-muted-foreground">Checkout completion</span>
                                <span className="font-semibold">{fmtPct(funnel.purchased, orders)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {funnel.purchased.toLocaleString()} paid
                                {funnel.abandoned > 0 && (
                                    <> · {funnel.abandoned.toLocaleString()} started an order but never paid</>
                                )}
                            </p>
                        </div>
                    )}
                </Card>

                {/* ── New vs returning customers ───────────────────── */}
                <Card className="p-5">
                    <h3 className="font-semibold mb-1 flex items-center gap-2"><Users className="h-4 w-4" /> Customers</h3>
                    {!hasCustomers ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No purchases yet.</p>
                    ) : (
                        <div className="flex items-center gap-4">
                            <ResponsiveContainer width="50%" height={160}>
                                <PieChart>
                                    <Pie data={customerPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                                        {customerPie.map((e) => <Cell key={e.name} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2 text-sm">
                                <p><span className="font-bold text-lg">{newCount}</span> new to organizer</p>
                                <p><span className="font-bold text-lg">{returningCount}</span> returning to organizer</p>
                                <p className="text-muted-foreground pt-2 border-t">
                                    <span className="font-semibold text-foreground">{customers?.bought_this_event_before ?? 0}</span> bought this event before
                                </p>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Where the audience came from ─────────────────────── */}
            <TrafficSources sources={analytics?.sources ?? []} />

            {/* ── Press breakdown ──────────────────────────────────── */}
            <Card className="p-5">
                <h3 className="font-semibold mb-4">Interaction breakdown</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {presses.map(p => (
                        <div key={p.key} className="flex items-center gap-3 rounded-lg border p-3">
                            <p.icon className="h-5 w-5 text-primary shrink-0" />
                            <div>
                                <p className="text-lg font-bold leading-none">{p.value.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground mt-1">{p.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* ── Email campaigns for this event ───────────────────── */}
            <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><Mail className="h-4 w-4" /> Email campaigns for this event</h3>
                {emailCampaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        No campaigns sent for this event yet.{' '}
                        <Link href="/organizer/marketing" className="text-primary hover:underline">Send one →</Link>
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted-foreground border-b">
                                    <th className="pb-2 font-medium">Subject</th>
                                    <th className="pb-2 font-medium text-right">Sent</th>
                                    <th className="pb-2 font-medium text-right">Delivered</th>
                                    <th className="pb-2 font-medium text-right">Open rate</th>
                                    <th className="pb-2 font-medium text-right">Click rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emailCampaigns.map(c => (
                                    <tr key={c.id} className="border-b last:border-0">
                                        <td className="py-2.5 pr-2">
                                            <span className="font-medium">{c.subject}</span>
                                            {c.sent_at && <span className="block text-xs text-muted-foreground">{format(new Date(c.sent_at), 'MMM d, yyyy')}</span>}
                                        </td>
                                        <td className="py-2.5 text-right">{(c.sent_count ?? 0).toLocaleString()}</td>
                                        <td className="py-2.5 text-right">{(c.delivered_count ?? 0).toLocaleString()}</td>
                                        <td className="py-2.5 text-right font-medium">{fmtPct(c.opened_count ?? 0, c.delivered_count ?? 0)}</td>
                                        <td className="py-2.5 text-right font-medium">{fmtPct(c.clicked_count ?? 0, c.delivered_count ?? 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground mt-3">Open & click rates are measured against delivered mail.</p>
                    </div>
                )}
            </Card>
        </div>
    )
}
