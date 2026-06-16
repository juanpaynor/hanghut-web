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
    // null for manual blasts; set for automation-generated campaigns (Phase 5).
    trigger_type: 'welcome' | 'pre_event' | 'post_event' | 'new_event' | null
    // Engagement rollup from email_campaign_stats (Phase 2 — Resend webhooks).
    delivered_count: number
    opened_count: number
    clicked_count: number
    bounced_count: number
    complained_count: number
}

const AUTOMATION_LABEL: Record<string, string> = {
    welcome: 'Welcome',
    pre_event: 'Pre-event',
    post_event: 'Post-event',
    new_event: 'New event',
}

// Open/click rates are measured against delivered mail (industry standard).
function rate(numerator: number, denominator: number): string {
    if (!denominator) return '—'
    return `${Math.round((numerator / denominator) * 100)}%`
}

export function CampaignHistory() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
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

            // Get partner ID (Check Owner OR Team Member)
            let { data: partner } = await supabase
                .from('partners')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle()

            let partnerId = partner?.id

            if (!partnerId) {
                // Check if team member
                const { data: teamMember } = await supabase
                    .from('partner_team_members')
                    .select('partner_id')
                    .eq('user_id', user.id)
                    .maybeSingle()

                partnerId = teamMember?.partner_id
            }

            if (!partnerId) return

            const { data, error } = await supabase
                .from('email_campaign_stats')
                .select('*')
                .eq('partner_id', partnerId)
                .neq('status', 'draft') // drafts live in the composer, not Sent History
                .order('created_at', { ascending: false })

            if (error) throw error

            setCampaigns(data || [])
        } catch (error) {
            console.error('Error fetching campaigns:', error)
        } finally {
            setLoading(false)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'sent':
                return 'bg-green-500'
            case 'sending':
                return 'bg-blue-500'
            case 'partial_failure':
                return 'bg-amber-500'
            case 'failed':
                return 'bg-red-500'
            default:
                return 'bg-slate-500'
        }
    }

    if (loading) {
        return <div>Loading history...</div>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sent Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
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
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {campaigns.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
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
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
