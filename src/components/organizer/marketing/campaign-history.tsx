'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, ShoppingBag, Megaphone, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Campaign {
    id: string
    subject: string
    status: 'draft' | 'sending' | 'sent' | 'partial_failure' | 'failed'
    sent_at: string | null
    recipient_count: number
    sent_count: number
    failed_count: number
    created_at: string
    trigger_type: string | null
    segment: string | null
    delivered_count: number
    opened_count: number
    clicked_count: number
    bounced_count: number
    complained_count: number
    // Revenue attribution (Phase 3): purchases by recipients within 7 days of send.
    attributed_orders: number
    attributed_revenue: number
}

interface RevenueSummary {
    influenced_orders: number
    influenced_revenue: number
    total_revenue: number
    campaigns_with_revenue: number
}

const AUTOMATION_LABEL: Record<string, string> = {
    welcome: 'Welcome',
    pre_event: 'Pre-event',
    post_event: 'Post-event',
    new_event: 'New event',
    abandoned_checkout: 'Abandoned cart',
    winback: 'Win-back',
}

const peso = (n: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0)

// Open/click rates are measured against delivered mail (industry standard).
function rate(numerator: number, denominator: number): string {
    if (!denominator) return '—'
    return `${Math.round((numerator / denominator) * 100)}%`
}

export function CampaignHistory() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [summary, setSummary] = useState<RevenueSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchCampaigns()
    }, [])

    const fetchCampaigns = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get partner ID (owner OR team member)
            let { data: partner } = await supabase
                .from('partners')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle()

            let partnerId = partner?.id

            if (!partnerId) {
                const { data: teamMember } = await supabase
                    .from('partner_team_members')
                    .select('partner_id')
                    .eq('user_id', user.id)
                    .maybeSingle()
                partnerId = teamMember?.partner_id
            }

            if (!partnerId) return

            // Per-campaign engagement + revenue attribution, and the partner-wide rollup.
            const [{ data: rows, error }, { data: sum }] = await Promise.all([
                supabase.rpc('get_campaign_performance', { p_partner_id: partnerId }),
                supabase.rpc('get_marketing_revenue_summary', { p_partner_id: partnerId }),
            ])
            if (error) throw error

            setCampaigns((rows as Campaign[]) || [])
            setSummary((Array.isArray(sum) ? sum[0] : sum) || null)
        } catch (error: any) {
            console.error('Error fetching campaigns:', error?.message || error?.error_description || JSON.stringify(error) || error)
        } finally {
            setLoading(false)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'sent': return 'bg-green-500'
            case 'sending': return 'bg-blue-500'
            case 'partial_failure': return 'bg-amber-500'
            case 'failed': return 'bg-red-500'
            default: return 'bg-slate-500'
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading history…</div>
    }

    const influencedPct = summary && summary.total_revenue > 0
        ? Math.round((summary.influenced_revenue / summary.total_revenue) * 100)
        : 0

    return (
        <div className="space-y-4">
            {/* Revenue summary strip */}
            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <TrendingUp className="h-4 w-4 text-emerald-600" /> Email-influenced revenue
                        </div>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{peso(summary.influenced_revenue)}</p>
                        <p className="text-xs text-muted-foreground">
                            {influencedPct}% of your {peso(summary.total_revenue)} total
                        </p>
                    </div>
                    <div className="rounded-xl border bg-gradient-to-br from-indigo-500/10 to-transparent p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <ShoppingBag className="h-4 w-4 text-indigo-600" /> Influenced orders
                        </div>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{summary.influenced_orders}</p>
                        <p className="text-xs text-muted-foreground">bought within 7 days of an email</p>
                    </div>
                    <div className="rounded-xl border bg-gradient-to-br from-fuchsia-500/10 to-transparent p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Megaphone className="h-4 w-4 text-fuchsia-600" /> Campaigns that sold
                        </div>
                        <p className="mt-1 text-2xl font-bold tracking-tight">{summary.campaigns_with_revenue}</p>
                        <p className="text-xs text-muted-foreground">drove at least one purchase</p>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Sent Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Sent At</TableHead>
                                    <TableHead className="text-right">Recipients</TableHead>
                                    <TableHead className="text-right">Delivered</TableHead>
                                    <TableHead className="text-right">Opened</TableHead>
                                    <TableHead className="text-right">Clicked</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {campaigns.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                                            No campaigns sent yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    campaigns.map((campaign) => (
                                        <TableRow key={campaign.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{campaign.subject}</span>
                                                    {campaign.trigger_type ? (
                                                        <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                                                            ⚡ {AUTOMATION_LABEL[campaign.trigger_type] ?? 'Automation'}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] font-normal shrink-0 text-muted-foreground">
                                                            Manual
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`${getStatusColor(campaign.status)} hover:${getStatusColor(campaign.status)}`}>
                                                    {campaign.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {campaign.sent_at
                                                    ? format(new Date(campaign.sent_at), 'MMM d, yyyy h:mm a')
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {campaign.recipient_count}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {campaign.delivered_count}
                                                <span className="text-muted-foreground ml-1 text-xs">
                                                    ({rate(campaign.delivered_count, campaign.sent_count)})
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {campaign.opened_count}
                                                <span className="text-muted-foreground ml-1 text-xs">
                                                    ({rate(campaign.opened_count, campaign.delivered_count)})
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {campaign.clicked_count}
                                                <span className="text-muted-foreground ml-1 text-xs">
                                                    ({rate(campaign.clicked_count, campaign.delivered_count)})
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {campaign.attributed_revenue > 0 ? (
                                                    <span className="font-semibold text-emerald-600">
                                                        {peso(campaign.attributed_revenue)}
                                                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                                                            ({campaign.attributed_orders})
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Revenue is attributed when a recipient buys within 7 days of receiving a campaign. A purchase can be
                        credited to more than one campaign, so per-campaign figures may overlap; the summary above counts each purchase once.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
