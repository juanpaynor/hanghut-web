'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/dialog' // Shadcn names might vary, using AlertDialog
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Ticket {
    id: string
    ticket_number: string
    status: string
    purchase_intent_id?: string
    user: {
        display_name: string | null
        email: string | null
    } | null
    guest_info?: {
        name: string
        email: string
    } | null
    tier_name?: string
    price?: number
    purchase_intent?: {
        status: string
        payment_method: string
        refunded_amount?: number
        refunded_at?: string
    }
}

interface AdminTicketListProps {
    tickets: Ticket[]
    eventId: string
}

export function AdminTicketList({ tickets, eventId }: AdminTicketListProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
    const [isRefunding, setIsRefunding] = useState(false)

    const handleRefund = async () => {
        if (!selectedTicket?.purchase_intent_id) {
            toast({ title: 'Error', description: 'Missing Order ID (Purchase Intent)', variant: 'destructive' })
            return
        }

        setIsRefunding(true)
        const supabase = createClient()

        try {
            // 1. Call Edge Function
            const { data, error } = await supabase.functions.invoke('request-refund', {
                body: {
                    intent_id: selectedTicket.purchase_intent_id,
                    reason: 'Requested by Admin via Dashboard'
                }
            })

            if (error) throw error
            if (data && data.error) throw new Error(data.error.message || 'Refund failed')

            // 2. Client-side Email Trigger
            try {
                await supabase.functions.invoke('send-transaction-email', {
                    body: {
                        type: 'refund_initiated',
                        intent_id: selectedTicket.purchase_intent_id
                    }
                })
            } catch (ignore) {
                console.warn('Email trigger failed', ignore)
            }

            toast({ title: 'Success', description: 'Refund processed successfully.' })
            router.refresh()
        } catch (error: any) {
            console.error('Refund failed:', error)
            toast({
                title: 'Refund Failed',
                description: error.message || 'Could not process refund.',
                variant: 'destructive'
            })
        } finally {
            setIsRefunding(false)
            setSelectedTicket(null)
        }
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Recent Tickets ({tickets.length})</h2>

            {tickets.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No tickets sold yet</p>
            ) : (
                <div className="space-y-2">
                    {tickets.slice(0, 50).map((ticket) => (
                        <div
                            key={ticket.id}
                            className="flex items-center justify-between p-3 bg-card rounded-lg border border-transparent hover:border-border transition-colors"
                        >
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">
                                        {ticket.user?.display_name || ticket.guest_info?.name || 'Guest'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">({ticket.ticket_number})</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {ticket.user?.email || ticket.guest_info?.email || '-'}
                                    {ticket.tier_name && ` • ${ticket.tier_name}`}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1 items-end">
                                    <span className="text-sm font-medium uppercase text-muted-foreground">
                                        {ticket.purchase_intent?.payment_method || '-'}
                                    </span>
                                    {ticket.status === 'refunded' && ticket.purchase_intent?.refunded_amount ? (
                                        <span className="text-xs text-orange-500 font-medium">
                                            -₱{ticket.purchase_intent.refunded_amount.toLocaleString()}
                                        </span>
                                    ) : null}
                                </div>
                                <Badge
                                    variant="outline"
                                    className={
                                        ticket.status === 'used'
                                            ? 'bg-green-500/10 text-green-500'
                                            : ticket.status === 'valid'
                                                ? 'bg-blue-500/10 text-blue-500'
                                                : ticket.status === 'refunded'
                                                    ? 'bg-orange-500/10 text-orange-500' // Refunded
                                                    : 'bg-red-500/10 text-red-500'
                                    }
                                >
                                    {ticket.status.toUpperCase()}
                                </Badge>

                                {['valid', 'paid', 'checked_in'].includes(ticket.status) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => setSelectedTicket(ticket)}
                                        title="Refund Order"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        <span className="sr-only">Refund</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AlertDialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Refund Order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will refund the <strong>ENTIRE ORDER</strong> associated with Ticket #{selectedTicket?.ticket_number}.
                            <br /><br />
                            <span className="flex items-center gap-2 text-destructive font-medium">
                                <AlertCircle className="w-4 h-4" />
                                This action cannot be undone.
                            </span>
                            <br />
                            This will also return the funds to the customer and deduct the amount from the organizer's balance.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRefunding}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleRefund(); }}
                            disabled={isRefunding}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRefunding ? 'Processing...' : 'Confirm Refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
