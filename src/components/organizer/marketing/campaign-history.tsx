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
    status: 'draft' | 'sending' | 'sent' | 'failed'
    sent_at: string | null
    recipient_count: number
    sent_count: number
    failed_count: number
    created_at: string
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
                .from('email_campaigns')
                .select('*')
                .eq('partner_id', partnerId)
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
                            <TableHead className="text-right">Success Rate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {campaigns.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                                    No campaigns sent yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            campaigns.map((campaign) => (
                                <TableRow key={campaign.id}>
                                    <TableCell className="font-medium">{campaign.subject}</TableCell>
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
                                    <TableCell className="text-right">
                                        {campaign.sent_count > 0
                                            ? `${Math.round((campaign.sent_count / (campaign.sent_count + campaign.failed_count)) * 100)}%`
                                            : '-'}
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
