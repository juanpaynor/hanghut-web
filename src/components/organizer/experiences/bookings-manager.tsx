'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { updateCheckInStatus, sendHostMessage } from '@/lib/organizer/experience-actions'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import {
    BookOpen, Mail, Phone, Users, CheckCircle2, XCircle, Clock,
    ChevronDown, ChevronUp, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Booking {
    id: string
    quantity: number
    total_amount: number
    guest_name: string | null
    guest_email: string | null
    guest_phone: string | null
    created_at: string
    status: string
    check_in_status: string | null
    checked_in_at: string | null
    table: { id: string; title: string } | null
    schedule: { start_time: string; end_time: string | null } | null
    answers?: { question_id: string; label: string; answer: string }[] | null
}

// A multi_choice answer is stored as a JSON array string; everything else is plain.
function displayAnswer(raw: string): string {
    if (!raw) return '—'
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed.join(', ')
    } catch { /* plain string */ }
    return raw
}

interface Props {
    bookings: Booking[]
}

const CHECK_IN_STYLES: Record<string, string> = {
    checked_in: 'text-green-600 bg-green-50 border-green-200',
    no_show:    'text-red-500 bg-red-50 border-red-200',
    pending:    'text-muted-foreground bg-muted border-border',
}

const CHECK_IN_LABELS: Record<string, string> = {
    checked_in: 'Checked In',
    no_show:    'No Show',
    pending:    'Pending',
}

export function BookingsManager({ bookings }: Props) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [localStatus, setLocalStatus] = useState<Record<string, string>>({})
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [composeBooking, setComposeBooking] = useState<Booking | null>(null)
    const [msgSubject, setMsgSubject] = useState('')
    const [msgBody, setMsgBody] = useState('')
    const [sending, setSending] = useState(false)

    const totalGuests = bookings.reduce((sum: number, b) => sum + (b.quantity ?? 0), 0)
    const totalRevenue = bookings.reduce((sum: number, b) => sum + Number(b.total_amount ?? 0), 0)
    const checkedIn = bookings.filter(b => (localStatus[b.id] ?? b.check_in_status ?? 'pending') === 'checked_in').length

    const getStatus = (booking: Booking) => localStatus[booking.id] ?? booking.check_in_status ?? 'pending'

    const handleCheckIn = (bookingId: string, status: 'checked_in' | 'no_show' | 'pending') => {
        setLocalStatus(prev => ({ ...prev, [bookingId]: status }))
        startTransition(async () => {
            const result = await updateCheckInStatus(bookingId, status)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                setLocalStatus(prev => ({ ...prev, [bookingId]: '' }))
            }
        })
    }

    const openCompose = (booking: Booking) => {
        setComposeBooking(booking)
        setMsgSubject(`Message from your host — ${booking.table?.title ?? 'Experience'}`)
        setMsgBody('')
    }

    const handleSendMessage = async () => {
        if (!composeBooking || !msgBody.trim()) return
        setSending(true)
        const result = await sendHostMessage(composeBooking.id, msgSubject, msgBody)
        setSending(false)
        if (result.error) {
            toast({ title: 'Failed to send', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Message sent', description: `Email delivered to ${composeBooking.guest_email}` })
            setComposeBooking(null)
        }
    }

    if (bookings.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3 border-2 border-dashed border-border rounded-2xl">
                <BookOpen className="h-12 w-12 text-muted-foreground/30" />
                <div>
                    <p className="font-semibold">No bookings yet</p>
                    <p className="text-muted-foreground text-sm">Confirmed bookings will appear here.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Total Bookings', value: bookings.length },
                    { label: 'Total Guests', value: totalGuests },
                    { label: 'Checked In', value: checkedIn },
                    { label: 'Revenue', value: `₱${totalRevenue.toLocaleString()}` },
                ].map(stat => (
                    <div key={stat.label} className="rounded-xl border border-border p-4">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Booking cards */}
            <div className="space-y-2">
                {bookings.map(booking => {
                    const startTime = booking.schedule?.start_time ? new Date(booking.schedule.start_time) : null
                    const endTime = booking.schedule?.end_time ? new Date(booking.schedule.end_time) : null
                    const status = getStatus(booking)
                    const isExpanded = expandedId === booking.id

                    return (
                        <div
                            key={booking.id}
                            className={cn(
                                'rounded-xl border border-border overflow-hidden transition-all',
                                isExpanded && 'border-primary/30 shadow-sm'
                            )}
                        >
                            {/* Row — always visible */}
                            <button
                                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                                onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                            >
                                {/* Guest info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{booking.guest_name || 'Guest'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{booking.table?.title}</p>
                                </div>

                                {/* Date */}
                                {startTime && (
                                    <div className="text-right shrink-0 hidden sm:block">
                                        <p className="text-sm font-medium">{format(startTime, 'MMM d')}</p>
                                        <p className="text-xs text-muted-foreground">{format(startTime, 'h:mm a')}</p>
                                    </div>
                                )}

                                {/* Guests */}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                    <Users className="h-3.5 w-3.5" />
                                    {booking.quantity}
                                </div>

                                {/* Check-in status badge */}
                                <Badge variant="outline" className={cn('text-xs shrink-0', CHECK_IN_STYLES[status])}>
                                    {CHECK_IN_LABELS[status] ?? 'Pending'}
                                </Badge>

                                {/* Expand chevron */}
                                {isExpanded
                                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                }
                            </button>

                            {/* Expanded detail panel */}
                            {isExpanded && (
                                <div className="border-t border-border bg-muted/20 p-4 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Guest details */}
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest Details</p>
                                            <div className="space-y-1.5">
                                                <p className="text-sm font-medium">{booking.guest_name || '—'}</p>
                                                {booking.guest_email && (
                                                    <a
                                                        href={`mailto:${booking.guest_email}`}
                                                        className="text-sm text-primary flex items-center gap-1.5 hover:underline"
                                                    >
                                                        <Mail className="h-3.5 w-3.5" />
                                                        {booking.guest_email}
                                                    </a>
                                                )}
                                                {booking.guest_phone && (
                                                    <a
                                                        href={`tel:${booking.guest_phone}`}
                                                        className="text-sm text-muted-foreground flex items-center gap-1.5 hover:text-foreground"
                                                    >
                                                        <Phone className="h-3.5 w-3.5" />
                                                        {booking.guest_phone}
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Slot details */}
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking Details</p>
                                            <div className="space-y-1">
                                                {startTime && (
                                                    <p className="text-sm">
                                                        {format(startTime, 'EEEE, MMMM d, yyyy')}
                                                        <br />
                                                        <span className="text-muted-foreground">
                                                            {format(startTime, 'h:mm a')}
                                                            {endTime && ` – ${format(endTime, 'h:mm a')}`}
                                                        </span>
                                                    </p>
                                                )}
                                                <p className="text-sm">
                                                    <span className="text-muted-foreground">Guests: </span>
                                                    {booking.quantity}
                                                </p>
                                                <p className="text-sm font-semibold">
                                                    ₱{Number(booking.total_amount).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom question answers */}
                                    {booking.answers && booking.answers.length > 0 && (
                                        <div className="space-y-2 pt-2 border-t border-border">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Answers</p>
                                            <div className="space-y-2">
                                                {booking.answers.map((a, i) => (
                                                    <div key={a.question_id || i} className="text-sm">
                                                        <span className="text-muted-foreground">{a.label}: </span>
                                                        <span className="font-medium">{displayAnswer(a.answer)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-2">Check-in</p>

                                        <Button
                                            size="sm"
                                            variant={status === 'checked_in' ? 'default' : 'outline'}
                                            className={cn('h-8 gap-1.5', status === 'checked_in' && 'bg-green-600 hover:bg-green-700')}
                                            disabled={isPending}
                                            onClick={() => handleCheckIn(booking.id, status === 'checked_in' ? 'pending' : 'checked_in')}
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Checked In
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant={status === 'no_show' ? 'destructive' : 'outline'}
                                            className="h-8 gap-1.5"
                                            disabled={isPending}
                                            onClick={() => handleCheckIn(booking.id, status === 'no_show' ? 'pending' : 'no_show')}
                                        >
                                            <XCircle className="h-3.5 w-3.5" />
                                            No Show
                                        </Button>

                                        {status !== 'pending' && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 gap-1.5 text-muted-foreground"
                                                disabled={isPending}
                                                onClick={() => handleCheckIn(booking.id, 'pending')}
                                            >
                                                <Clock className="h-3.5 w-3.5" />
                                                Reset
                                            </Button>
                                        )}

                                        {booking.guest_email && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-1.5 ml-auto"
                                                onClick={() => openCompose(booking)}
                                            >
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                Email Guest
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Compose modal */}
            <Dialog open={!!composeBooking} onOpenChange={open => !open && setComposeBooking(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Email Guest</DialogTitle>
                    </DialogHeader>
                    {composeBooking && (
                        <div className="space-y-4 pt-1">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">{composeBooking.guest_name}</span>
                                <span className="text-muted-foreground truncate">{composeBooking.guest_email}</span>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Subject</Label>
                                <Input
                                    value={msgSubject}
                                    onChange={e => setMsgSubject(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Message <span className="text-destructive">*</span></Label>
                                <Textarea
                                    rows={5}
                                    placeholder="Type your message to the guest…"
                                    value={msgBody}
                                    onChange={e => setMsgBody(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <Button
                                    className="flex-1"
                                    onClick={handleSendMessage}
                                    disabled={sending || !msgBody.trim()}
                                >
                                    {sending ? 'Sending…' : 'Send Email'}
                                </Button>
                                <Button variant="outline" onClick={() => setComposeBooking(null)}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
