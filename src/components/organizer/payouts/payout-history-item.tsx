'use client'

import { useState } from 'react'
import Link from 'next/link'
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
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { cancelPayoutRequest } from '@/lib/organizer/payout-actions'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

interface PayoutHistoryItemProps {
    payout: {
        id: string
        amount: number
        status: string
        bank_name: string
        requested_at: string
        admin_notes?: string | null
        rejection_reason?: string | null
    }
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-green-500/10 text-green-600'
        case 'pending_request': return 'bg-yellow-500/10 text-yellow-600'
        case 'approved': return 'bg-blue-500/10 text-blue-600'
        case 'processing': return 'bg-purple-500/10 text-purple-600'
        case 'rejected': return 'bg-red-500/10 text-red-600'
        case 'cancelled': return 'bg-slate-500/10 text-slate-500'
        default: return 'bg-slate-500/10 text-slate-600'
    }
}

export function PayoutHistoryItem({ payout }: PayoutHistoryItemProps) {
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()
    const canCancel = payout.status === 'pending_request'

    const handleCancel = async () => {
        setLoading(true)
        try {
            const result = await cancelPayoutRequest(payout.id)
            if (result.success) {
                toast({ title: 'Request Cancelled', description: result.message })
                router.refresh()
            } else {
                toast({ title: 'Error', description: result.message, variant: 'destructive' })
            }
        } catch {
            toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-border hover:bg-muted/30 transition-all">
            <Link href={`/organizer/payouts/${payout.id}`} className="flex-1 min-w-0">
                <p className="font-semibold">₱{Number(payout.amount).toLocaleString()}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{format(new Date(payout.requested_at), 'MMM d, yyyy')}</span>
                    <span className="opacity-40">•</span>
                    <span>{payout.bank_name}</span>
                </div>
                {payout.admin_notes && (
                    <p className="text-xs text-yellow-600 mt-1">{payout.admin_notes}</p>
                )}
                {payout.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {payout.rejection_reason}</p>
                )}
            </Link>

            <div className="flex items-center gap-2 ml-3 shrink-0">
                <Badge className={`text-[10px] ${getStatusColor(payout.status)}`}>
                    {payout.status.replace('_', ' ').toUpperCase()}
                </Badge>

                {canCancel && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                disabled={loading}
                            >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Cancel
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancel Payout Request?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will cancel your payout request of{' '}
                                    <strong>₱{Number(payout.amount).toLocaleString()}</strong>.
                                    The funds will be returned to your available balance and you can
                                    submit a new request at any time.
                                    <br /><br />
                                    <span className="text-yellow-600 font-medium">
                                        Note: Once a payout is approved or processing, it cannot be cancelled.
                                    </span>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep Request</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleCancel}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    Yes, Cancel It
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        </div>
    )
}
