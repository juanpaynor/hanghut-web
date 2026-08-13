'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
    Link2, Copy, Check, QrCode, Trash2, Plus, MousePointerClick,
    Ticket, TrendingUp, Loader2, Download, Power,
} from 'lucide-react'
import {
    createReferralLink, setReferralLinkActive, deleteReferralLink,
    type ReferralLinkStat, type ReferralLinkType,
} from '@/lib/organizer/referral-actions'

interface Props {
    organizerId: string
    baseUrl: string
    hasStorefront: boolean
    events: { id: string; title: string }[]
    initialLinks: ReferralLinkStat[]
}

const peso = (n: number) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export function ReferralLinksManager({ organizerId, baseUrl, hasStorefront, events, initialLinks }: Props) {
    const router = useRouter()
    const [links, setLinks] = useState<ReferralLinkStat[]>(initialLinks)
    const [pending, startTransition] = useTransition()

    // Create form
    const [label, setLabel] = useState('')
    const [type, setType] = useState<ReferralLinkType>(events.length ? 'organizer_event' : 'organizer_storefront')
    const [eventId, setEventId] = useState<string>(events[0]?.id ?? '')
    const [error, setError] = useState('')
    const [creating, setCreating] = useState(false)

    const urlFor = (code: string) => `${baseUrl}/r/${code}`

    async function handleCreate() {
        setError('')
        if (!label.trim()) { setError('Give the link a name (e.g. the influencer).'); return }
        if (type === 'organizer_event' && !eventId) { setError('Pick an event.'); return }
        setCreating(true)
        const res = await createReferralLink({
            organizerId, label: label.trim(), type,
            eventId: type === 'organizer_event' ? eventId : undefined,
        })
        setCreating(false)
        if ('error' in res && res.error) { setError(res.error); return }
        if ('link' in res && res.link) {
            const l = res.link as { id: string; code: string; label: string; type: ReferralLinkType; event_id: string | null; is_active: boolean; created_at: string }
            setLinks(prev => [{
                link_id: l.id, code: l.code, label: l.label, type: l.type, event_id: l.event_id,
                is_active: l.is_active, created_at: l.created_at,
                clicks: 0, purchases: 0, tickets: 0, revenue: 0,
            }, ...prev])
            setLabel('')
        }
    }

    function handleToggle(id: string, next: boolean) {
        setLinks(prev => prev.map(l => l.link_id === id ? { ...l, is_active: next } : l))
        startTransition(async () => {
            const res = await setReferralLinkActive(id, next)
            if ('error' in res && res.error) {
                setLinks(prev => prev.map(l => l.link_id === id ? { ...l, is_active: !next } : l)) // revert
            }
        })
    }

    function handleDelete(id: string) {
        if (!confirm('Delete this link? Past sales keep their attribution, but the link stops working.')) return
        const prev = links
        setLinks(links.filter(l => l.link_id !== id))
        startTransition(async () => {
            const res = await deleteReferralLink(id)
            if ('error' in res && res.error) setLinks(prev) // revert
        })
    }

    const eventTitle = (id: string | null) => events.find(e => e.id === id)?.title

    return (
        <div className="space-y-6">
            {/* Create */}
            <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Plus className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">New referral link</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
                    <div className="space-y-1.5">
                        <Label htmlFor="ref-label">Name</Label>
                        <Input id="ref-label" value={label} onChange={e => setLabel(e.target.value)}
                            placeholder="e.g. Maria Cruz (IG)" maxLength={60} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Points to</Label>
                        <Select value={type} onValueChange={v => setType(v as ReferralLinkType)}>
                            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="organizer_event" disabled={!events.length}>A specific event</SelectItem>
                                <SelectItem value="organizer_storefront" disabled={!hasStorefront}>My storefront</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {type === 'organizer_event' ? (
                        <div className="space-y-1.5">
                            <Label>Event</Label>
                            <Select value={eventId} onValueChange={setEventId}>
                                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Pick an event" /></SelectTrigger>
                                <SelectContent>
                                    {events.map(e => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : <div className="hidden sm:block" />}
                </div>
                {error && <p className="text-sm text-destructive mt-3">{error}</p>}
                <div className="mt-4">
                    <Button onClick={handleCreate} disabled={creating}>
                        {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : <><Link2 className="mr-2 h-4 w-4" /> Create link</>}
                    </Button>
                </div>
            </Card>

            {/* List */}
            {links.length === 0 ? (
                <Card className="p-10 text-center">
                    <Link2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="mt-3 font-medium">No referral links yet</p>
                    <p className="text-sm text-muted-foreground">Create one above and share it with your influencers.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {links.map(link => (
                        <ReferralRow
                            key={link.link_id}
                            link={link}
                            url={urlFor(link.code)}
                            eventTitle={link.type === 'organizer_event' ? eventTitle(link.event_id) : 'Storefront'}
                            onToggle={handleToggle}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
            {pending && <p className="text-xs text-muted-foreground">Saving…</p>}
        </div>
    )
}

function ReferralRow({ link, url, eventTitle, onToggle, onDelete }: {
    link: ReferralLinkStat
    url: string
    eventTitle?: string
    onToggle: (id: string, next: boolean) => void
    onDelete: (id: string) => void
}) {
    const [copied, setCopied] = useState(false)
    const canvasRef = useRef<HTMLDivElement>(null)
    const convRate = link.clicks > 0 ? (link.purchases / link.clicks) * 100 : 0

    async function copy() {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch { /* ignore */ }
    }

    function downloadQr() {
        const canvas = canvasRef.current?.querySelector('canvas')
        if (!canvas) return
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `${link.code}-qr.png`
        a.click()
    }

    return (
        <Card className={`p-4 ${link.is_active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Left: identity + url */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{link.label}</span>
                        {!link.is_active && <Badge variant="secondary" className="text-[10px] h-5">Paused</Badge>}
                        {eventTitle && <Badge variant="outline" className="text-[10px] h-5 max-w-[180px] truncate">{eventTitle}</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                        <code className="text-xs bg-muted rounded px-2 py-1 truncate max-w-[280px]">{url}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} title="Copy link">
                            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="QR code"><QrCode className="h-3.5 w-3.5" /></Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xs">
                                <DialogHeader><DialogTitle className="text-base">{link.label}</DialogTitle></DialogHeader>
                                <div className="flex flex-col items-center gap-4 py-2">
                                    <div ref={canvasRef} className="bg-white p-3 rounded-lg">
                                        <QRCodeCanvas value={url} size={200} includeMargin />
                                    </div>
                                    <code className="text-xs text-muted-foreground break-all text-center">{url}</code>
                                    <Button variant="outline" size="sm" onClick={downloadQr} className="w-full">
                                        <Download className="mr-2 h-4 w-4" /> Download PNG
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={link.is_active ? 'Pause' : 'Activate'}
                        onClick={() => onToggle(link.link_id, !link.is_active)}>
                        <Power className={`h-4 w-4 ${link.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete"
                        onClick={() => onDelete(link.link_id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t pt-4">
                <Stat icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={link.clicks.toLocaleString()} />
                <Stat icon={<Ticket className="h-4 w-4" />} label="Tickets" value={link.tickets.toLocaleString()} sub={`${link.purchases} order${link.purchases === 1 ? '' : 's'}`} />
                <Stat icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={peso(link.revenue)} />
                <Stat icon={<TrendingUp className="h-4 w-4" />} label="Conversion" value={`${convRate.toFixed(1)}%`} />
            </div>
        </Card>
    )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">{icon}{label}</div>
            <div className="mt-0.5 font-bold">{value}</div>
            {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
    )
}
