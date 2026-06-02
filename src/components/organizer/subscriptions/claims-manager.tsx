'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Gift, Megaphone, Check, X, PackageCheck } from 'lucide-react'
import { format } from 'date-fns'
import { updateClaimStatus } from '@/lib/subscriptions/actions'

export interface Claim {
    id: string
    perk_type: 'merch' | 'shoutout'
    perk_label: string
    claim_period: string | null
    details: Record<string, any>
    status: 'pending' | 'fulfilled' | 'rejected'
    organizer_note: string | null
    created_at: string
    fulfilled_at: string | null
    fan_name: string | null
    fan_email: string | null
}

const PERK_META: Record<Claim['perk_type'], { label: string; icon: typeof Gift }> = {
    merch:    { label: 'Merch',    icon: Gift },
    shoutout: { label: 'Shoutout', icon: Megaphone },
}

const STATUS_BADGE: Record<Claim['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending:   { label: 'Pending',   variant: 'secondary' },
    fulfilled: { label: 'Fulfilled', variant: 'default' },
    rejected:  { label: 'Rejected',  variant: 'destructive' },
}

function formatKey(key: string) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function ClaimsManager({ claims: initial }: { claims: Claim[] }) {
    const { toast } = useToast()
    const [claims, setClaims] = useState(initial)
    const [notes, setNotes] = useState<Record<string, string>>({})
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [, startTransition] = useTransition()

    const pending = claims.filter(c => c.status === 'pending')
    const resolved = claims.filter(c => c.status !== 'pending')

    const handleUpdate = (claim: Claim, status: 'fulfilled' | 'rejected') => {
        if (status === 'rejected' && !confirm(`Reject this ${PERK_META[claim.perk_type].label.toLowerCase()} claim from ${claim.fan_name || claim.fan_email || 'this fan'}?`)) {
            return
        }
        setPendingId(claim.id)
        const note = notes[claim.id]
        startTransition(async () => {
            const result = await updateClaimStatus(claim.id, status, note)
            setPendingId(null)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            setClaims(prev => prev.map(c => c.id === claim.id
                ? { ...c, status, organizer_note: note?.trim() || null, fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : null }
                : c
            ))
            toast({ title: status === 'fulfilled' ? 'Claim marked fulfilled' : 'Claim rejected' })
        })
    }

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Pending Claims', value: pending.length },
                    { label: 'Fulfilled', value: claims.filter(c => c.status === 'fulfilled').length },
                    { label: 'Total All-Time', value: claims.length },
                ].map(stat => (
                    <Card key={stat.label} className="p-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold">{stat.value}</p>
                    </Card>
                ))}
            </div>

            {claims.length === 0 ? (
                <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
                    <PackageCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="font-semibold">No claims yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        When subscribers claim merch or shoutout perks, they&apos;ll appear here for fulfilment
                    </p>
                </Card>
            ) : (
                <>
                    {/* Pending — actionable */}
                    {pending.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                Needs Action ({pending.length})
                            </h2>
                            {pending.map(claim => {
                                const meta = PERK_META[claim.perk_type]
                                const Icon = meta.icon
                                const isBusy = pendingId === claim.id
                                const detailEntries = Object.entries(claim.details || {}).filter(([, v]) => v != null && v !== '')
                                return (
                                    <Card key={claim.id} className="p-5">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <Icon className="h-4 w-4 text-primary shrink-0" />
                                                    <span className="font-semibold">{claim.perk_label}</span>
                                                    <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                                                    {claim.claim_period && (
                                                        <Badge variant="secondary" className="text-xs">{claim.claim_period}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {claim.fan_name || '—'}{claim.fan_email ? ` · ${claim.fan_email}` : ''}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Claimed {format(new Date(claim.created_at), 'MMM d, yyyy')}
                                                </p>
                                            </div>
                                        </div>

                                        {detailEntries.length > 0 && (
                                            <div className="rounded-md bg-muted/40 p-3 mb-3 space-y-1">
                                                {detailEntries.map(([key, value]) => (
                                                    <div key={key} className="flex gap-2 text-sm">
                                                        <span className="text-muted-foreground shrink-0">{formatKey(key)}:</span>
                                                        <span className="font-medium break-words">{String(value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <Textarea
                                            placeholder="Add a note for your records (optional) — e.g. tracking number, fulfilment details"
                                            value={notes[claim.id] ?? ''}
                                            onChange={e => setNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                                            rows={2}
                                            className="mb-3 text-sm"
                                            disabled={isBusy}
                                        />

                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => handleUpdate(claim, 'fulfilled')} disabled={isBusy}>
                                                <Check className="h-4 w-4 mr-1.5" />
                                                Mark Fulfilled
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => handleUpdate(claim, 'rejected')} disabled={isBusy}
                                                className="text-muted-foreground hover:text-destructive">
                                                <X className="h-4 w-4 mr-1.5" />
                                                Reject
                                            </Button>
                                        </div>
                                    </Card>
                                )
                            })}
                        </section>
                    )}

                    {/* Resolved — read-only history */}
                    {resolved.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                History ({resolved.length})
                            </h2>
                            {resolved.map(claim => {
                                const meta = PERK_META[claim.perk_type]
                                const Icon = meta.icon
                                const badge = STATUS_BADGE[claim.status]
                                return (
                                    <Card key={claim.id} className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-medium">{claim.perk_label}</span>
                                                    <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                                                    {claim.claim_period && (
                                                        <Badge variant="outline" className="text-xs">{claim.claim_period}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {claim.fan_name || '—'}{claim.fan_email ? ` · ${claim.fan_email}` : ''}
                                                </p>
                                                {claim.organizer_note && (
                                                    <p className="text-xs text-muted-foreground mt-1 italic">Note: {claim.organizer_note}</p>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground shrink-0 text-right">
                                                {claim.status === 'fulfilled' && claim.fulfilled_at
                                                    ? `Fulfilled ${format(new Date(claim.fulfilled_at), 'MMM d, yyyy')}`
                                                    : `Claimed ${format(new Date(claim.created_at), 'MMM d, yyyy')}`}
                                            </p>
                                        </div>
                                    </Card>
                                )
                            })}
                        </section>
                    )}
                </>
            )}
        </div>
    )
}
