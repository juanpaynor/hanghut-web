'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge as UiBadge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    saveCreatorBadge, deleteCreatorBadge, evaluateBadge, grantBadgeToEmails,
    uploadBadgeArt, previewBadgeEarners, searchOrganizerCustomers,
    type CreatorBadge, type BadgeCriteria, type BadgeCriteriaType, type CustomerHit,
} from '@/lib/organizer/badge-actions'
import { CUSTOMER_SEGMENTS } from '@/lib/organizer/badge-constants'
import { Award, Check, Loader2, Plus, Trash2, Upload, Users, Wand2 } from 'lucide-react'

interface EventOption { id: string; title: string }
interface TierOption { id: string; name: string; eventTitle: string }

/**
 * Criteria vocabulary, in the order a partner should meet it: the ones that fire
 * on data every partner already has come first. That ordering is the honest
 * version of the app team's "lead with what works" instinct — without hiding the
 * attendance types, which are earnable today (team_comms #294).
 */
const CRITERIA: { value: BadgeCriteriaType; label: string; blurb: string }[] = [
    { value: 'manual_grant',     label: 'You choose who gets it', blurb: 'Hand it out yourself by email. Never awarded automatically.' },
    { value: 'first_n_buyers',   label: 'First N buyers',         blurb: 'The earliest people to buy. Once the first N are set, they stay set.' },
    { value: 'spend_total',      label: 'Total spent',            blurb: 'Lifetime spend with you, net of refunds.' },
    { value: 'group_buyer',      label: 'Group booking',          blurb: 'Bought several tickets in one order.' },
    { value: 'attendance_count', label: 'Events attended',        blurb: 'Checked in at this many different events of yours.' },
    { value: 'checkin_count',    label: 'Total check-ins',        blurb: 'Total scans, so a multi-day event counts more than once.' },
    { value: 'specific_event',   label: 'A specific event',       blurb: 'Attended (or bought for) one particular event.' },
    { value: 'streak_months',    label: 'Monthly streak',         blurb: 'Bought in this many consecutive calendar months.' },
    { value: 'event_count_purchased', label: 'Events bought for',  blurb: 'Bought for this many different events — counts even when nobody scanned the ticket.' },
    { value: 'tier_purchased',   label: 'Bought a specific tier',  blurb: 'Bought a particular ticket type. The natural VIP badge.' },
    { value: 'customer_segment', label: 'Customer segment',        blurb: 'The same segments as your Customers page: Champions, Loyal, At risk and so on.' },
]

const TIERS = ['bronze', 'silver', 'gold', 'platinum']

function defaultParams(type: BadgeCriteriaType, firstEventId?: string): Record<string, unknown> {
    switch (type) {
        case 'attendance_count': return { n: 3 }
        case 'checkin_count':    return { n: 5 }
        case 'spend_total':      return { amount: 5000, currency: 'PHP' }
        case 'specific_event':   return { event_id: firstEventId ?? '', mode: 'attended' }
        case 'first_n_buyers':   return { scope: 'partner', n: 50 }
        case 'group_buyer':      return { min_quantity: 5 }
        case 'streak_months':    return { n: 3 }
        case 'event_count_purchased': return { n: 2 }
        case 'tier_purchased':   return { tier_id: '' }
        case 'customer_segment': return { segment: 'champion' }
        default:                 return {}
    }
}

/** Plain-English summary of a stored criteria object, for the list rows. */
function describe(c: BadgeCriteria): string {
    const p = (c.params ?? {}) as any
    switch (c.type) {
        case 'manual_grant':     return 'Granted by you'
        case 'attendance_count': return `Attended ${p.n} of your events`
        case 'checkin_count':    return `${p.n} total check-ins`
        case 'spend_total':      return `Spent ₱${Number(p.amount ?? 0).toLocaleString()} with you`
        case 'specific_event':   return p.mode === 'purchased' ? 'Bought for a specific event' : 'Attended a specific event'
        case 'first_n_buyers':   return `First ${p.n} buyers${p.scope === 'event' ? ' of an event' : ''}`
        case 'group_buyer':      return `Bought ${p.min_quantity}+ tickets in one order`
        case 'streak_months':    return `Bought in ${p.n} months running`
        case 'event_count_purchased': return `Bought for ${p.n} of your events`
        case 'tier_purchased':   return 'Bought a specific ticket type'
        case 'customer_segment': return `${CUSTOMER_SEGMENTS.find(x => x.value === p.segment)?.label ?? p.segment} (segment)`
        default:                 return c.type
    }
}

export function BadgeManager({
    organizerId, initialBadges, events, tiers,
}: { organizerId: string; initialBadges: CreatorBadge[]; events: EventOption[]; tiers: TierOption[] }) {
    const { toast } = useToast()
    const [badges, setBadges] = useState(initialBadges)
    const [editing, setEditing] = useState<CreatorBadge | null>(null)
    const [open, setOpen] = useState(false)
    const [granting, setGranting] = useState<CreatorBadge | null>(null)

    useEffect(() => setBadges(initialBadges), [initialBadges])

    const startNew = () => { setEditing(null); setOpen(true) }
    const startEdit = (b: CreatorBadge) => { setEditing(b); setOpen(true) }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                    {badges.length === 0
                        ? 'No badges yet.'
                        : `${badges.length} badge${badges.length === 1 ? '' : 's'}`}
                </p>
                <Button onClick={startNew} size="sm">
                    <Plus className="h-4 w-4 mr-1.5" /> New badge
                </Button>
            </div>

            {badges.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Award className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="font-medium">Reward the people who keep showing up</p>
                        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                            Design a badge, decide how it&apos;s earned, and it appears on your
                            fans&apos; profiles. Past behaviour counts — a new badge finds the
                            people who already qualified.
                        </p>
                        <Button onClick={startNew} className="mt-4" size="sm">Create your first badge</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {badges.map(b => (
                        <BadgeRow
                            key={b.id}
                            badge={b}
                            organizerId={organizerId}
                            onEdit={() => startEdit(b)}
                            onGrant={() => setGranting(b)}
                            onChanged={(next) => setBadges(prev => prev.map(x => x.id === next.id ? next : x))}
                            onDeleted={() => setBadges(prev => prev.filter(x => x.id !== b.id))}
                        />
                    ))}
                </div>
            )}

            <BadgeDialog
                key={editing?.id ?? 'new'}
                open={open}
                onOpenChange={setOpen}
                organizerId={organizerId}
                events={events}
                tiers={tiers}
                badge={editing}
                onSaved={(saved) => {
                    setBadges(prev => {
                        const exists = prev.some(x => x.id === saved.id)
                        return exists ? prev.map(x => x.id === saved.id ? saved : x) : [saved, ...prev]
                    })
                    setOpen(false)
                    toast({ title: editing ? 'Badge updated' : 'Badge created' })
                }}
            />

            <GrantDialog
                badge={granting}
                organizerId={organizerId}
                onClose={() => setGranting(null)}
            />
        </div>
    )
}

function BadgeRow({
    badge, organizerId, onEdit, onGrant, onChanged, onDeleted,
}: {
    badge: CreatorBadge
    organizerId: string
    onEdit: () => void
    onGrant: () => void
    onChanged: (b: CreatorBadge) => void
    onDeleted: () => void
}) {
    const { toast } = useToast()
    const [pending, start] = useTransition()
    const isManual = badge.criteria?.type === 'manual_grant'

    const run = () => start(async () => {
        const res = isManual ? null : await evaluateBadge(organizerId, badge.id)
        if (res?.error) { toast({ title: res.error, variant: 'destructive' }); return }
        toast({
            title: res?.awarded ? `Awarded to ${res.awarded} more ${res.awarded === 1 ? 'person' : 'people'}` : 'No new people qualify yet',
        })
    })

    const toggleActive = () => start(async () => {
        const res = await saveCreatorBadge({
            id: badge.id, organizerId, name: badge.name, description: badge.description ?? undefined,
            tier: badge.tier, criteria: badge.criteria, artUrl: badge.art_url, isActive: !badge.is_active,
        })
        if (res.error) { toast({ title: res.error, variant: 'destructive' }); return }
        onChanged({ ...badge, is_active: !badge.is_active })
    })

    const remove = () => start(async () => {
        const res = await deleteCreatorBadge(organizerId, badge.id)
        if (res.error) { toast({ title: res.error, variant: 'destructive' }); return }
        onDeleted()
        toast({ title: 'Badge deleted' })
    })

    return (
        <Card className={badge.is_active ? '' : 'opacity-60'}>
            <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border">
                    {badge.art_url && !badge.art_suppressed
                        ? <Image src={badge.art_url} alt="" width={56} height={56} className="object-cover h-full w-full" />
                        : <Award className="h-6 w-6 text-muted-foreground" />}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{badge.name}</p>
                        <UiBadge variant="secondary" className="capitalize text-[10px]">{badge.tier}</UiBadge>
                        {!badge.is_active && <UiBadge variant="outline" className="text-[10px]">Paused</UiBadge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{describe(badge.criteria)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {badge.holder_count} {badge.holder_count === 1 ? 'holder' : 'holders'}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <Switch checked={badge.is_active} onCheckedChange={toggleActive} disabled={pending} aria-label="Active" />
                    {isManual
                        ? <Button size="sm" variant="outline" onClick={onGrant}>Grant</Button>
                        : <Button size="sm" variant="outline" onClick={run} disabled={pending}>
                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run now'}
                          </Button>}
                    <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={remove} disabled={pending} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function BadgeDialog({
    open, onOpenChange, organizerId, events, tiers, badge, onSaved,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    organizerId: string
    events: EventOption[]
    tiers: TierOption[]
    badge: CreatorBadge | null
    onSaved: (b: CreatorBadge) => void
}) {
    const { toast } = useToast()
    const [name, setName] = useState(badge?.name ?? '')
    const [description, setDescription] = useState(badge?.description ?? '')
    const [tier, setTier] = useState(badge?.tier ?? 'bronze')
    const [artUrl, setArtUrl] = useState<string | null>(badge?.art_url ?? null)
    const [isActive, setIsActive] = useState(badge?.is_active ?? true)
    const [type, setType] = useState<BadgeCriteriaType>(badge?.criteria?.type ?? 'manual_grant')
    const [params, setParams] = useState<Record<string, any>>(
        badge?.criteria?.params ?? defaultParams(badge?.criteria?.type ?? 'manual_grant', events[0]?.id)
    )
    const [uploading, setUploading] = useState(false)
    const [saving, startSave] = useTransition()
    const fileRef = useRef<HTMLInputElement>(null)

    const criteria: BadgeCriteria = useMemo(() => ({ version: 1, type, params }), [type, params])

    // Live "who qualifies" count. Debounced because it runs a real aggregate.
    const [preview, setPreview] = useState<number | null>(null)
    const [previewing, setPreviewing] = useState(false)
    useEffect(() => {
        if (type === 'manual_grant') { setPreview(null); return }
        let cancelled = false
        setPreviewing(true)
        const t = setTimeout(async () => {
            const res = await previewBadgeEarners(organizerId, criteria)
            if (cancelled) return
            setPreview('count' in res ? (res.count ?? null) : null)
            setPreviewing(false)
        }, 450)
        return () => { cancelled = true; clearTimeout(t) }
    }, [organizerId, criteria, type])

    const onPickType = (t: BadgeCriteriaType) => {
        setType(t)
        setParams(defaultParams(t, events[0]?.id))
    }

    const upload = async (file: File) => {
        setUploading(true)
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadBadgeArt(organizerId, fd)
        setUploading(false)
        if (res.error) { toast({ title: res.error, variant: 'destructive' }); return }
        setArtUrl(res.url!)
    }

    const save = () => startSave(async () => {
        const res = await saveCreatorBadge({
            id: badge?.id, organizerId, name, description, tier, criteria, artUrl, isActive,
        })
        if (res.error) { toast({ title: res.error, variant: 'destructive' }); return }
        onSaved({
            id: res.id!, organizer_id: organizerId, name: name.trim(),
            description: description.trim() || null, tier, art_url: artUrl,
            art_suppressed: badge?.art_suppressed ?? false, criteria, is_active: isActive,
            holder_count: badge?.holder_count ?? 0,
            created_at: badge?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
    })

    const selected = CRITERIA.find(c => c.value === type)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Two columns: WHAT the badge is on the left, HOW it is earned on the
                right. Stacked in one narrow column these two decisions read as one
                long form, and the earner preview — the thing that should influence
                the criteria while you set them — ends up below the fold. */}
            <DialogContent className="max-w-4xl p-0 gap-0 max-h-[92vh] flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                    <DialogTitle className="text-xl">{badge ? 'Edit badge' : 'New badge'}</DialogTitle>
                    <DialogDescription>
                        Badges are permanent once earned — they are never taken back.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x overflow-y-auto flex-1 min-h-0">

                    {/* ── The badge itself ─────────────────────────────────── */}
                    <div className="p-6 space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            The badge
                        </p>

                        <div className="flex flex-col items-center gap-3">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="group relative h-32 w-32 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden hover:border-primary hover:bg-primary/5 transition-colors"
                            >
                                {uploading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : artUrl ? (
                                    <>
                                        <Image src={artUrl} alt="" width={128} height={128} className="object-cover h-full w-full" />
                                        <span className="absolute inset-0 bg-black/55 text-white text-xs font-medium items-center justify-center hidden group-hover:flex">
                                            Replace
                                        </span>
                                    </>
                                ) : (
                                    <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
                                        <Upload className="h-6 w-6" />
                                        <span className="text-xs font-medium">Upload art</span>
                                    </span>
                                )}
                            </button>
                            <p className="text-xs text-muted-foreground text-center max-w-[16rem]">
                                Square image, under 2MB. Optional — badges without art fall back
                                to a default frame in the app.
                            </p>
                            {artUrl && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setArtUrl(null)}>
                                    Remove art
                                </Button>
                            )}
                        </div>
                        <input
                            ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
                        />

                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Front Row Regular" />
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={description} onChange={e => setDescription(e.target.value)} rows={3}
                                placeholder="For the people who never miss a show."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Tier</Label>
                            <Select value={tier} onValueChange={setTier}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Shown as a ring colour on the badge in the app.</p>
                        </div>
                    </div>

                    {/* ── How it is earned ─────────────────────────────────── */}
                    <div className="p-6 space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            How it&apos;s earned
                        </p>

                        <div className="space-y-2">
                            <Select value={type} onValueChange={v => onPickType(v as BadgeCriteriaType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CRITERIA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {selected && <p className="text-xs text-muted-foreground">{selected.blurb}</p>}
                        </div>

                        <CriteriaParams type={type} params={params} setParams={setParams} events={events} tiers={tiers} />

                        {type === 'manual_grant' ? (
                            <div className="rounded-lg border bg-muted/40 p-3.5 flex items-start gap-2.5">
                                <Users className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                    Nothing is awarded automatically. Once you save, use{' '}
                                    <span className="font-medium text-foreground">Grant</span> to pick
                                    people from your customer list.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-lg border bg-muted/40 p-3.5 flex items-start gap-2.5">
                                <Wand2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <div className="text-sm">
                                    {previewing ? (
                                        <span className="text-muted-foreground">Checking your customers…</span>
                                    ) : preview === null ? (
                                        <span className="text-muted-foreground">Set the details above to see who qualifies.</span>
                                    ) : preview === 0 ? (
                                        <>
                                            <span className="font-medium">Nobody qualifies yet.</span>
                                            <p className="text-muted-foreground text-xs mt-1">
                                                You can still publish it — people will earn it as they go. But if
                                                you expected existing fans to have it already, try a lower threshold.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-medium text-base">
                                                {preview} {preview === 1 ? 'person qualifies' : 'people qualify'} right now
                                            </span>
                                            <p className="text-muted-foreground text-xs mt-1">
                                                They receive it as soon as you save and run it — past behaviour counts.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
                            <div>
                                <Label className="cursor-pointer">Active</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Paused badges stop awarding but keep existing holders.
                                </p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t shrink-0 bg-muted/20">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={save} disabled={saving || !name.trim()}>
                        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                        {badge ? 'Save changes' : 'Create badge'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function CriteriaParams({
    type, params, setParams, events, tiers,
}: {
    type: BadgeCriteriaType
    params: Record<string, any>
    setParams: (p: Record<string, any>) => void
    events: EventOption[]
    tiers: TierOption[]
}) {
    const set = (k: string, v: any) => setParams({ ...params, [k]: v })
    const num = (v: string) => Math.max(0, Number(v) || 0)

    if (type === 'manual_grant') return null

    // Single column: these fields now live inside one half of a two-column
    // dialog, where a nested 2-up grid squeezes number inputs to about 200px
    // and wraps their labels onto two lines.
    return (
        <div className="grid gap-4">
            {(type === 'attendance_count' || type === 'checkin_count' || type === 'streak_months' || type === 'event_count_purchased') && (
                <div className="space-y-2">
                    <Label>
                        {type === 'attendance_count' ? 'Events attended'
                            : type === 'checkin_count' ? 'Total check-ins'
                            : type === 'event_count_purchased' ? 'Events bought for'
                            : 'Consecutive months'}
                    </Label>
                    <Input type="number" min={1} value={params.n ?? 1} onChange={e => set('n', num(e.target.value))} />
                    {type === 'streak_months' && (
                        <p className="text-xs text-muted-foreground">Calendar months, Philippine time.</p>
                    )}
                </div>
            )}

            {type === 'spend_total' && (
                <div className="space-y-2">
                    <Label>Amount spent (₱)</Label>
                    <Input type="number" min={0} value={params.amount ?? 0} onChange={e => set('amount', num(e.target.value))} />
                    <p className="text-xs text-muted-foreground">Lifetime, across all your events, after refunds.</p>
                </div>
            )}

            {type === 'group_buyer' && (
                <div className="space-y-2">
                    <Label>Tickets in one order</Label>
                    <Input type="number" min={2} value={params.min_quantity ?? 2} onChange={e => set('min_quantity', num(e.target.value))} />
                </div>
            )}

            {type === 'first_n_buyers' && (
                <>
                    <div className="space-y-2">
                        <Label>How many buyers</Label>
                        <Input type="number" min={1} value={params.n ?? 1} onChange={e => set('n', num(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Across</Label>
                        <Select value={params.scope ?? 'partner'} onValueChange={v => set('scope', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="partner">All your events</SelectItem>
                                <SelectItem value="event">One event</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {params.scope === 'event' && (
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Event</Label>
                            <EventPicker events={events} value={params.event_id} onChange={v => set('event_id', v)} />
                        </div>
                    )}
                </>
            )}

            {type === 'tier_purchased' && (
                <div className="space-y-2 sm:col-span-2">
                    <Label>Ticket type</Label>
                    {tiers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">You have no ticket types yet.</p>
                    ) : (
                        <Select value={params.tier_id || undefined} onValueChange={v => set('tier_id', v)}>
                            <SelectTrigger><SelectValue placeholder="Choose a ticket type" /></SelectTrigger>
                            <SelectContent>
                                {tiers.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name} — {t.eventTitle}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            )}

            {type === 'customer_segment' && (
                <div className="space-y-2 sm:col-span-2">
                    <Label>Segment</Label>
                    <Select value={params.segment ?? 'champion'} onValueChange={v => set('segment', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {CUSTOMER_SEGMENTS.map(s2 => (
                                <SelectItem key={s2.value} value={s2.value}>{s2.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {CUSTOMER_SEGMENTS.find(s2 => s2.value === (params.segment ?? 'champion'))?.hint}
                    </p>
                    {/* Segments move; badges do not. Saying so here is the difference
                        between a keepsake and a promise the organizer cannot keep. */}
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Segments change as people&apos;s habits change, but a badge is permanent.
                        This awards anyone who is in the segment when it runs, and they keep it
                        afterwards — so it reads as &ldquo;was a {CUSTOMER_SEGMENTS.find(s2 => s2.value === (params.segment ?? 'champion'))?.label.toLowerCase()}&rdquo;,
                        not &ldquo;is one today&rdquo;. Don&apos;t use it for access that should expire.
                    </p>
                </div>
            )}

            {type === 'specific_event' && (
                <>
                    <div className="space-y-2 sm:col-span-2">
                        <Label>Event</Label>
                        <EventPicker events={events} value={params.event_id} onChange={v => set('event_id', v)} />
                    </div>
                    <div className="space-y-2">
                        <Label>They must have</Label>
                        <Select value={params.mode ?? 'attended'} onValueChange={v => set('mode', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="attended">Checked in</SelectItem>
                                <SelectItem value="purchased">Bought a ticket</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}
        </div>
    )
}

function EventPicker({ events, value, onChange }: { events: EventOption[]; value?: string; onChange: (v: string) => void }) {
    if (events.length === 0) {
        return <p className="text-sm text-muted-foreground">You have no events yet.</p>
    }
    return (
        <Select value={value || undefined} onValueChange={onChange}>
            <SelectTrigger><SelectValue placeholder="Choose an event" /></SelectTrigger>
            <SelectContent>
                {events.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}

function GrantDialog({
    badge, organizerId, onClose,
}: { badge: CreatorBadge | null; organizerId: string; onClose: () => void }) {
    const { toast } = useToast()
    const [picked, setPicked] = useState<string[]>([])
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<CustomerHit[]>([])
    const [loading, setLoading] = useState(false)
    const [manual, setManual] = useState('')
    const [pending, start] = useTransition()

    // Search the organizer's real customers rather than making them recall
    // addresses. Typing an email by hand still works — someone who has never
    // bought has no customer row to find, and granting to them is legitimate.
    useEffect(() => {
        if (!badge) return
        let cancelled = false
        setLoading(true)
        const t = setTimeout(async () => {
            const res = await searchOrganizerCustomers(organizerId, query)
            if (cancelled) return
            setResults(('customers' in res ? res.customers : undefined) ?? [])
            setLoading(false)
        }, 300)
        return () => { cancelled = true; clearTimeout(t) }
    }, [badge, organizerId, query])

    useEffect(() => {
        if (!badge) { setPicked([]); setQuery(''); setManual('') }
    }, [badge])

    const toggle = (email: string) =>
        setPicked(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])

    const submit = () => start(async () => {
        if (!badge) return
        const typed = manual.split(/[\s,;]+/).filter(Boolean)
        const all = Array.from(new Set([...picked, ...typed]))
        const res = await grantBadgeToEmails(organizerId, badge.id, all)
        if (res.error) { toast({ title: res.error, variant: 'destructive' }); return }
        toast({ title: `Granted to ${res.granted} ${res.granted === 1 ? 'person' : 'people'}` })
        onClose()
    })

    const total = picked.length + manual.split(/[\s,;]+/).filter(Boolean).length

    return (
        <Dialog open={!!badge} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Grant &ldquo;{badge?.name}&rdquo;</DialogTitle>
                    <DialogDescription>
                        Pick from your customers, or type any email. Badges follow the email —
                        someone without an account yet gets it automatically when they sign up.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search your customers by name or email"
                    />

                    <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                        {loading && results.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                        ) : results.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                                {query ? 'No customers match that.' : 'No customers yet.'}
                            </p>
                        ) : results.map(c => {
                            const on = picked.includes(c.email)
                            return (
                                <button
                                    key={c.email}
                                    type="button"
                                    onClick={() => toggle(c.email)}
                                    className={`w-full text-left p-2.5 flex items-center gap-3 hover:bg-muted/60 ${on ? 'bg-primary/5' : ''}`}
                                >
                                    <span className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center ${on ? 'bg-primary border-primary' : ''}`}>
                                        {on && <Check className="h-3 w-3 text-primary-foreground" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium truncate">{c.name || c.email}</span>
                                        {c.name && <span className="block text-xs text-muted-foreground truncate">{c.email}</span>}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0 text-right">
                                        {c.events_purchased > 0 && <>{c.events_purchased} event{c.events_purchased === 1 ? '' : 's'}<br /></>}
                                        {c.rfm_segment && <span className="capitalize">{c.rfm_segment.replace('_', ' ')}</span>}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Or paste emails</Label>
                        <Textarea
                            rows={2} value={manual} onChange={e => setManual(e.target.value)}
                            placeholder="someone@example.com, another@example.com"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={pending || total === 0}>
                        {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                        Grant to {total || 0}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
