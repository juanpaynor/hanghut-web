'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Check, X, Clock, Users, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'
import { approveRegistration, rejectRegistration, EventRegistration } from '@/lib/organizer/registration-management-actions'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface Props {
    eventId: string
    initialRegistrations: EventRegistration[]
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    auto_approved: { label: 'Auto-approved', variant: 'outline' },
    cancelled: { label: 'Cancelled', variant: 'outline' },
}

function RegistrationCard({
    reg,
    eventId,
    onUpdate,
}: {
    reg: EventRegistration
    eventId: string
    onUpdate: (id: string, newStatus: string) => void
}) {
    const { toast } = useToast()
    const [expanded, setExpanded] = useState(false)
    const [showReject, setShowReject] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [isPending, startTransition] = useTransition()

    const name = reg.user?.full_name || reg.guest_name || 'Unknown'
    const email = reg.user?.email || reg.guest_email || '—'
    const badge = STATUS_BADGE[reg.status] || { label: reg.status, variant: 'outline' as const }

    const handleApprove = () => {
        startTransition(async () => {
            const result = await approveRegistration(reg.id, eventId)
            if (result.success) {
                toast({ title: 'Approved', description: `${name}'s registration has been approved.` })
                onUpdate(reg.id, 'approved')
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    const handleReject = () => {
        startTransition(async () => {
            const result = await rejectRegistration(reg.id, eventId, rejectReason)
            if (result.success) {
                toast({ title: 'Rejected', description: `${name}'s registration has been rejected.` })
                onUpdate(reg.id, 'rejected')
                setShowReject(false)
            } else {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            }
        })
    }

    return (
        <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{name}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {reg.tier && (
                            <Badge variant="outline" className="text-xs">{reg.tier.name}</Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted {new Date(reg.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit'
                        })}
                    </p>
                </div>

                {reg.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500 text-green-600 hover:bg-green-50"
                            onClick={handleApprove}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span className="ml-1">Approve</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-red-400 text-red-500 hover:bg-red-50"
                            onClick={() => setShowReject(v => !v)}
                            disabled={isPending}
                        >
                            <X className="h-3.5 w-3.5" />
                            <span className="ml-1">Reject</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Reject form */}
            {showReject && reg.status === 'pending' && (
                <div className="space-y-2 border-t pt-3">
                    <Textarea
                        placeholder="Reason for rejection (optional — will be shown to the user)"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        rows={2}
                        className="text-sm"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={handleReject} disabled={isPending}>
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Confirm Rejection
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Rejection reason display */}
            {reg.status === 'rejected' && reg.rejection_reason && (
                <p className="text-xs text-red-500 border-t pt-2">Reason: {reg.rejection_reason}</p>
            )}

            {/* Answers */}
            {reg.answers.length > 0 && (
                <div className="border-t pt-2">
                    <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setExpanded(v => !v)}
                    >
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {expanded ? 'Hide' : 'Show'} {reg.answers.length} answer{reg.answers.length !== 1 ? 's' : ''}
                    </button>

                    {expanded && (
                        <div className="mt-2 space-y-2">
                            {reg.answers.map((a, i) => (
                                <div key={i} className="bg-muted/50 rounded p-2">
                                    <p className="text-xs font-medium text-muted-foreground">{a.question_label}</p>
                                    <p className="text-sm mt-0.5">
                                        {Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer ?? '—')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
}

export function RegistrationsManager({ eventId, initialRegistrations }: Props) {
    const router = useRouter()
    const [registrations, setRegistrations] = useState<EventRegistration[]>(initialRegistrations)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh()
        }, 30000)
        return () => clearInterval(interval)
    }, [router])

    // Sync when server re-renders with fresh data
    useEffect(() => {
        setRegistrations(initialRegistrations)
    }, [initialRegistrations])

    const handleRefresh = () => {
        setIsRefreshing(true)
        router.refresh()
        setTimeout(() => setIsRefreshing(false), 1000)
    }

    const handleUpdate = (id: string, newStatus: string) => {
        setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus as any } : r))
    }

    const pending = registrations.filter(r => r.status === 'pending')
    const approved = registrations.filter(r => r.status === 'approved' || r.status === 'auto_approved')
    const rejected = registrations.filter(r => r.status === 'rejected')

    if (registrations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Users className="h-10 w-10 mb-3 opacity-40" />
                <p className="font-semibold text-foreground">No registrations yet</p>
                <p className="text-sm mt-1 max-w-xs">Once people submit registration requests for this event, they'll appear here.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <Clock className="h-4 w-4" />
                    <span><strong>{pending.length}</strong> pending</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    <span><strong>{approved.length}</strong> approved</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    <X className="h-4 w-4" />
                    <span><strong>{rejected.length}</strong> rejected</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto gap-1.5">
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <Tabs defaultValue="pending">
                <TabsList>
                    <TabsTrigger value="pending">
                        Pending {pending.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{pending.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="approved">Approved</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="mt-4 space-y-3">
                    {pending.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No pending requests.</p>
                    ) : pending.map(reg => (
                        <RegistrationCard key={reg.id} reg={reg} eventId={eventId} onUpdate={handleUpdate} />
                    ))}
                </TabsContent>

                <TabsContent value="approved" className="mt-4 space-y-3">
                    {approved.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No approved registrations yet.</p>
                    ) : approved.map(reg => (
                        <RegistrationCard key={reg.id} reg={reg} eventId={eventId} onUpdate={handleUpdate} />
                    ))}
                </TabsContent>

                <TabsContent value="rejected" className="mt-4 space-y-3">
                    {rejected.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No rejected registrations.</p>
                    ) : rejected.map(reg => (
                        <RegistrationCard key={reg.id} reg={reg} eventId={eventId} onUpdate={handleUpdate} />
                    ))}
                </TabsContent>
            </Tabs>
        </div>
    )
}
