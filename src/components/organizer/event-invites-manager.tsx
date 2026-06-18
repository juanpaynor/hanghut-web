'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Mail, Upload, Users, Crown, Trash2, Send, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import {
    listEventInvites,
    addEventInvites,
    importInviteesFromPastAttendees,
    importInviteesFromSubscribers,
    revokeEventInvite,
    resendEventInvite,
    type EventInvite,
} from '@/lib/organizer/event-invite-actions'

const STATUS_META: Record<EventInvite['status'], { label: string; cls: string; icon: typeof Clock }> = {
    invited: { label: 'Invited', cls: 'bg-slate-100 text-slate-600', icon: Clock },
    accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    declined: { label: 'Declined', cls: 'bg-red-100 text-red-600', icon: XCircle },
}

export function EventInvitesManager({ eventId }: { eventId: string }) {
    const { toast } = useToast()
    const [invites, setInvites] = useState<EventInvite[]>([])
    const [loading, setLoading] = useState(true)
    const [pasteValue, setPasteValue] = useState('')
    const [isPending, startTransition] = useTransition()
    const fileRef = useRef<HTMLInputElement>(null)

    const refresh = async () => {
        const data = await listEventInvites(eventId)
        setInvites(data)
        setLoading(false)
    }

    useEffect(() => { refresh() }, [eventId])

    const report = (r: { added: number; skipped: number; error?: string }) => {
        if (r.error && r.added === 0) {
            toast({ title: 'Could not add invitees', description: r.error, variant: 'destructive' })
        } else {
            toast({
                title: `${r.added} invite${r.added !== 1 ? 's' : ''} sent`,
                description: r.skipped > 0 ? `${r.skipped} already invited or invalid (skipped).` : undefined,
            })
        }
        refresh()
    }

    // Parse "Name <email>", "email,name", or bare emails — one per line/comma.
    const parseEntries = (raw: string) => {
        return raw
            .split(/[\n,;]+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const angle = line.match(/^(.*?)<([^>]+)>$/)
                if (angle) return { email: angle[2].trim(), name: angle[1].trim() || null }
                return { email: line, name: null }
            })
    }

    const handlePasteAdd = () => {
        const entries = parseEntries(pasteValue)
        if (entries.length === 0) {
            toast({ title: 'Enter at least one email', variant: 'destructive' })
            return
        }
        startTransition(async () => {
            const r = await addEventInvites(eventId, entries, 'manual')
            setPasteValue('')
            report(r)
        })
    }

    const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const text = String(reader.result || '')
            // CSV: take first column as email, optional second as name
            const entries = text
                .split(/\r?\n/)
                .map((row) => row.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
                .filter((cols) => cols[0] && cols[0].includes('@'))
                .map((cols) => ({ email: cols[0], name: cols[1] || null }))
            if (entries.length === 0) {
                toast({ title: 'No emails found in CSV', variant: 'destructive' })
                return
            }
            startTransition(async () => report(await addEventInvites(eventId, entries, 'csv')))
        }
        reader.readAsText(file)
        if (fileRef.current) fileRef.current.value = ''
    }

    const handleImport = (fn: typeof importInviteesFromPastAttendees, label: string) => {
        startTransition(async () => {
            const r = await fn(eventId)
            if (r.error && r.added === 0 && r.skipped === 0) {
                toast({ title: `No ${label} found`, variant: 'destructive' })
                refresh()
                return
            }
            report(r as any)
        })
    }

    const handleRevoke = (id: string) => {
        startTransition(async () => {
            await revokeEventInvite(eventId, id)
            refresh()
        })
    }

    const handleResend = (id: string) => {
        startTransition(async () => {
            const r = await resendEventInvite(eventId, id)
            toast({ title: r.error ? 'Resend failed' : 'Invite resent', description: r.error, variant: r.error ? 'destructive' : undefined })
        })
    }

    const counts = {
        total: invites.length,
        accepted: invites.filter((i) => i.status === 'accepted').length,
        declined: invites.filter((i) => i.status === 'declined').length,
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold flex items-center gap-2"><Mail className="h-5 w-5" /> Guest List</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Invite people by email. Only invited guests can register; others can request to join.
                </p>
            </div>

            {/* Add invitees */}
            <Card className="p-5 space-y-4">
                <div>
                    <label className="text-sm font-medium mb-1.5 block">Add by email</label>
                    <Textarea
                        value={pasteValue}
                        onChange={(e) => setPasteValue(e.target.value)}
                        placeholder="Paste emails — one per line or comma-separated.&#10;e.g. jane@acme.com, Juan Cruz <juan@xyz.com>"
                        rows={3}
                        className="font-mono text-sm"
                    />
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Button onClick={handlePasteAdd} disabled={isPending} size="sm">
                            {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                            Send Invites
                        </Button>
                        <Button onClick={() => fileRef.current?.click()} disabled={isPending} size="sm" variant="outline">
                            <Upload className="h-4 w-4 mr-1.5" /> Upload CSV
                        </Button>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleCsv} className="hidden" />
                        <Button onClick={() => handleImport(importInviteesFromPastAttendees, 'past attendees')} disabled={isPending} size="sm" variant="outline">
                            <Users className="h-4 w-4 mr-1.5" /> Past attendees
                        </Button>
                        <Button onClick={() => handleImport(importInviteesFromSubscribers, 'subscribers')} disabled={isPending} size="sm" variant="outline">
                            <Crown className="h-4 w-4 mr-1.5" /> Subscribers
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Summary */}
            {!loading && invites.length > 0 && (
                <div className="flex gap-3 text-sm">
                    <span className="text-muted-foreground">{counts.total} invited</span>
                    <span className="text-emerald-600">{counts.accepted} accepted</span>
                    <span className="text-red-500">{counts.declined} declined</span>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : invites.length === 0 ? (
                <Card className="p-10 text-center text-muted-foreground text-sm">
                    No invitees yet. Add people above to get started.
                </Card>
            ) : (
                <Card className="divide-y">
                    {invites.map((inv) => {
                        const meta = STATUS_META[inv.status]
                        const Icon = meta.icon
                        return (
                            <div key={inv.id} className="flex items-center gap-3 p-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{inv.name || inv.email}</p>
                                    {inv.name && <p className="text-xs text-muted-foreground truncate">{inv.email}</p>}
                                </div>
                                <Badge variant="secondary" className={`${meta.cls} gap-1 font-medium`}>
                                    <Icon className="h-3 w-3" /> {meta.label}
                                </Badge>
                                <button
                                    onClick={() => handleResend(inv.id)}
                                    disabled={isPending}
                                    title="Resend invite"
                                    className="text-muted-foreground hover:text-foreground transition-colors p-1.5"
                                >
                                    <Send className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => handleRevoke(inv.id)}
                                    disabled={isPending}
                                    title="Remove from list"
                                    className="text-muted-foreground hover:text-red-500 transition-colors p-1.5"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )
                    })}
                </Card>
            )}
        </div>
    )
}
