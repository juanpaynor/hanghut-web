'use client'

import { useState, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Generate time options in 30-min intervals
function generateTimeOptions() {
    const options: { value: string; label: string }[] = []
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
            const hh = String(h).padStart(2, '0')
            const mm = String(m).padStart(2, '0')
            const value = `${hh}:${mm}`
            const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
            const ampm = h < 12 ? 'AM' : 'PM'
            const label = `${hour12}:${mm} ${ampm}`
            options.push({ value, label })
        }
    }
    return options
}

const TIME_OPTIONS = generateTimeOptions()

function combineDateAndTime(day: Date, time: string, baseTime?: string): string {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(day)
    d.setHours(h, m, 0, 0)
    // If an end time is earlier than start time (overnight), push to next day
    if (baseTime) {
        const [bh, bm] = baseTime.split(':').map(Number)
        const baseMinutes = bh * 60 + bm
        const endMinutes = h * 60 + m
        if (endMinutes <= baseMinutes) d.setDate(d.getDate() + 1)
    }
    return d.toISOString()
}

function calcDuration(start: string, end: string): string {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins <= 0) mins += 24 * 60 // overnight
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}hr`
    return `${h}hr ${m}min`
}

function isOvernight(start: string, end: string): boolean {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    return (eh * 60 + em) <= (sh * 60 + sm)
}
import { useToast } from '@/hooks/use-toast'
import { createSlot, cancelSlot, deleteSlot } from '@/lib/organizer/experience-actions'
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
    addMonths, subMonths, isSameDay, isToday, isBefore, startOfDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Ban, Trash2, Loader2, CalendarClock, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Schedule {
    id: string
    table_id: string
    start_time: string
    end_time: string
    max_guests: number
    current_guests: number
    status: string
    price_per_person: number | null
}

interface Experience {
    id: string
    title: string
}

interface Props {
    experiences: Experience[]
    schedules: Schedule[]
}

const STATUS_COLORS: Record<string, string> = {
    open:      'bg-green-500',
    full:      'bg-orange-400',
    cancelled: 'bg-muted-foreground/30',
    completed: 'bg-blue-400',
}

const STATUS_BADGE: Record<string, string> = {
    open:      'text-green-700 bg-green-50 border-green-200',
    full:      'text-orange-700 bg-orange-50 border-orange-200',
    cancelled: 'text-muted-foreground bg-muted border-border',
    completed: 'text-blue-700 bg-blue-50 border-blue-200',
}

export function CalendarManager({ experiences, schedules }: Props) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [month, setMonth] = useState(new Date())
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)

    // Add slot form state
    const [selectedExp, setSelectedExp] = useState(experiences[0]?.id || '')
    const [startTime, setStartTime] = useState('10:00')
    const [endTime, setEndTime] = useState('12:00')
    const [maxGuests, setMaxGuests] = useState('8')
    const [priceOverride, setPriceOverride] = useState('')

    const expMap = useMemo(() => Object.fromEntries(experiences.map(e => [e.id, e.title])), [experiences])

    // Build a map of date string → slots
    const slotsByDate = useMemo(() => {
        const map: Record<string, Schedule[]> = {}
        for (const slot of schedules) {
            const key = format(new Date(slot.start_time), 'yyyy-MM-dd')
            if (!map[key]) map[key] = []
            map[key].push(slot)
        }
        return map
    }, [schedules])

    // Calendar grid
    const calendarDays = useMemo(() => {
        const start = startOfMonth(month)
        const end = endOfMonth(month)
        const days = eachDayOfInterval({ start, end })
        const padding = Array(getDay(start)).fill(null)
        return [...padding, ...days]
    }, [month])

    const selectedSlots = selectedDay
        ? (slotsByDate[format(selectedDay, 'yyyy-MM-dd')] ?? [])
        : []

    const handleDayClick = (day: Date) => {
        setSelectedDay(day)
        setShowAddForm(false)
        setStartTime('10:00')
        setEndTime('12:00')
    }

    const handleAddSlot = () => {
        if (!selectedDay) return
        startTransition(async () => {
            const result = await createSlot({
                table_id: selectedExp,
                start_time: combineDateAndTime(selectedDay, startTime),
                end_time: combineDateAndTime(selectedDay, endTime, startTime),
                max_guests: Number(maxGuests),
                price_per_person: priceOverride ? Number(priceOverride) : null,
            })

            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }

            toast({ title: 'Slot added' })
            setShowAddForm(false)
            setPriceOverride('')
            setMaxGuests('8')
        })
    }

    const handleCancel = (slotId: string) => {
        if (!confirm('Cancel this slot? Guests with existing bookings will not be automatically refunded.')) return
        startTransition(async () => {
            const result = await cancelSlot(slotId)
            if (result.error) toast({ title: 'Error', description: result.error, variant: 'destructive' })
            else toast({ title: 'Slot cancelled' })
        })
    }

    const handleDelete = (slotId: string) => {
        if (!confirm('Delete this slot permanently?')) return
        startTransition(async () => {
            const result = await deleteSlot(slotId)
            if (result.error) toast({ title: 'Error', description: result.error, variant: 'destructive' })
            else { toast({ title: 'Slot deleted' }); setSelectedDay(null) }
        })
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

            {/* ── Calendar grid ── */}
            <div className="rounded-2xl border border-border overflow-hidden">
                {/* Month nav */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                    <button
                        onClick={() => setMonth(m => subMonths(m, 1))}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="font-semibold">{format(month, 'MMMM yyyy')}</span>
                    <button
                        onClick={() => setMonth(m => addMonths(m, 1))}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-border">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {calendarDays.map((day, i) => {
                        if (!day) return <div key={`pad-${i}`} className="border-b border-r border-border/50 min-h-[80px]" />

                        const key = format(day, 'yyyy-MM-dd')
                        const slots = slotsByDate[key] ?? []
                        const isSelected = selectedDay && isSameDay(day, selectedDay)
                        const isCurrentDay = isToday(day)
                        const isPast = isBefore(day, startOfDay(new Date())) && !isCurrentDay

                        return (
                            <button
                                key={key}
                                onClick={() => handleDayClick(day)}
                                className={cn(
                                    'relative min-h-[80px] p-2 text-left border-b border-r border-border/50 transition-colors flex flex-col',
                                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                                    isPast && 'opacity-50',
                                )}
                            >
                                {/* Day number */}
                                <span className={cn(
                                    'text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1',
                                    isCurrentDay && 'bg-primary text-primary-foreground',
                                    isSelected && !isCurrentDay && 'text-primary',
                                )}>
                                    {format(day, 'd')}
                                </span>

                                {/* Slot dots */}
                                {slots.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-auto">
                                        {slots.slice(0, 3).map(slot => (
                                            <span
                                                key={slot.id}
                                                className={cn('w-2 h-2 rounded-full shrink-0', STATUS_COLORS[slot.status] ?? 'bg-muted-foreground')}
                                                title={`${format(new Date(slot.start_time), 'h:mm a')} — ${slot.status}`}
                                            />
                                        ))}
                                        {slots.length > 3 && (
                                            <span className="text-[10px] text-muted-foreground leading-none">+{slots.length - 3}</span>
                                        )}
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="px-4 py-3 border-t border-border/50 flex items-center gap-4 flex-wrap">
                    {[['open', 'Open'], ['full', 'Full'], ['cancelled', 'Cancelled'], ['completed', 'Completed']].map(([status, label]) => (
                        <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={cn('w-2.5 h-2.5 rounded-full', STATUS_COLORS[status])} />
                            {label}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Day panel ── */}
            <div className="rounded-2xl border border-border overflow-hidden flex flex-col">
                {selectedDay ? (
                    <>
                        {/* Panel header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                            <div>
                                <p className="font-semibold">{format(selectedDay, 'EEEE')}</p>
                                <p className="text-xs text-muted-foreground">{format(selectedDay, 'MMMM d, yyyy')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" onClick={() => setShowAddForm(v => !v)} variant={showAddForm ? 'outline' : 'default'} className="h-8">
                                    {showAddForm ? <><X className="h-3.5 w-3.5 mr-1" />Cancel</> : <><Plus className="h-3.5 w-3.5 mr-1" />Add Slot</>}
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Add slot form */}
                            {showAddForm && (
                                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                                    <p className="text-sm font-semibold">New Slot</p>

                                    {experiences.length > 1 && (
                                        <div className="space-y-1">
                                            <Label className="text-xs">Experience</Label>
                                            <Select value={selectedExp} onValueChange={setSelectedExp}>
                                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {experiences.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* Time pickers */}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">Time <span className="text-destructive">*</span></Label>
                                            <div className="flex items-center gap-1.5">
                                                {isOvernight(startTime, endTime) && (
                                                    <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">ends +1 day</span>
                                                )}
                                                {calcDuration(startTime, endTime) && (
                                                    <span className="text-xs text-muted-foreground">{calcDuration(startTime, endTime)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Select value={startTime} onValueChange={setStartTime}>
                                                <SelectTrigger className="h-9 flex-1 text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent className="max-h-56">
                                                    {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <span className="text-xs text-muted-foreground shrink-0">to</span>
                                            <Select value={endTime} onValueChange={setEndTime}>
                                                <SelectTrigger className="h-9 flex-1 text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent className="max-h-56">
                                                    {TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Max Guests <span className="text-destructive">*</span></Label>
                                            <Input type="number" min={1} className="h-9 text-sm" value={maxGuests} onChange={e => setMaxGuests(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Price Override (₱)</Label>
                                            <Input type="number" min={0} className="h-9 text-sm" placeholder="Optional" value={priceOverride} onChange={e => setPriceOverride(e.target.value)} />
                                        </div>
                                    </div>

                                    <Button size="sm" className="w-full" onClick={handleAddSlot} disabled={isPending || !selectedExp || !startTime || !endTime}>
                                        {isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Adding…</> : 'Add Slot'}
                                    </Button>
                                </div>
                            )}

                            {/* Slots for this day */}
                            {selectedSlots.length === 0 && !showAddForm ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                    <CalendarClock className="h-8 w-8 text-muted-foreground/30" />
                                    <p className="text-sm text-muted-foreground">No slots on this day</p>
                                    <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />Add a slot
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedSlots.map(slot => {
                                        const start = new Date(slot.start_time)
                                        const end = slot.end_time ? new Date(slot.end_time) : null
                                        const spotsLeft = slot.max_guests - slot.current_guests
                                        const canDelete = slot.current_guests === 0
                                        const canCancel = slot.status === 'open' || slot.status === 'full'

                                        return (
                                            <div key={slot.id} className="rounded-xl border border-border p-3 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-sm font-semibold">
                                                            {format(start, 'h:mm a')}
                                                            {end && ` – ${format(end, 'h:mm a')}`}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">{expMap[slot.table_id]}</p>
                                                    </div>
                                                    <Badge variant="outline" className={cn('text-xs capitalize shrink-0', STATUS_BADGE[slot.status])}>
                                                        {slot.status}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {slot.current_guests}/{slot.max_guests} guests
                                                        {slot.status === 'open' && spotsLeft <= 3 && spotsLeft > 0 && (
                                                            <span className="text-orange-500 font-medium">({spotsLeft} left)</span>
                                                        )}
                                                    </span>
                                                    {slot.price_per_person && (
                                                        <span>₱{Number(slot.price_per_person).toLocaleString()}/person</span>
                                                    )}
                                                </div>

                                                {(canCancel || canDelete) && (
                                                    <div className="flex gap-2 pt-1">
                                                        {canCancel && (
                                                            <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-muted-foreground hover:text-destructive hover:border-destructive" onClick={() => handleCancel(slot.id)} disabled={isPending}>
                                                                <Ban className="h-3 w-3 mr-1" /> Cancel
                                                            </Button>
                                                        )}
                                                        {canDelete && (
                                                            <Button size="sm" variant="outline" className="h-7 text-xs text-muted-foreground hover:text-destructive hover:border-destructive" onClick={() => handleDelete(slot.id)} disabled={isPending}>
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
                        <CalendarClock className="h-10 w-10 text-muted-foreground/30" />
                        <div>
                            <p className="font-medium text-sm">Select a day</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Click any day on the calendar to view or add slots</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
