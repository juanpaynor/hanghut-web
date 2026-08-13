'use client'

import { useState, useTransition, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
    Link2, Copy, Check, QrCode, Trash2, Loader2, Download, Power,
    MousePointerClick, Smartphone, UserPlus,
} from 'lucide-react'
import {
    createPlatformLink, setPlatformLinkActive, deletePlatformLink,
    type PlatformReferralStat,
} from '@/lib/admin/referral-actions'

interface Props {
    baseUrl: string
    initialLinks: PlatformReferralStat[]
}

export function PlatformReferralManager({ baseUrl, initialLinks }: Props) {
    const [links, setLinks] = useState<PlatformReferralStat[]>(initialLinks)
    const [label, setLabel] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')
    const [pending, startTransition] = useTransition()

    const urlFor = (code: string) => `${baseUrl}/r/${code}`

    async function handleCreate() {
        setError('')
        if (!label.trim()) { setError('Give the link a name (the influencer / campaign).'); return }
        setCreating(true)
        const res = await createPlatformLink(label.trim())
        setCreating(false)
        if ('error' in res && res.error) { setError(res.error); return }
        if ('link' in res && res.link) {
            const l = res.link as { id: string; code: string; label: string; is_active: boolean; created_at: string }
            setLinks(prev => [{
                link_id: l.id, code: l.code, label: l.label, is_active: l.is_active,
                created_at: l.created_at, clicks: 0, app_downloads: 0, signups: 0,
            }, ...prev])
            setLabel('')
        }
    }

    function handleToggle(id: string, next: boolean) {
        setLinks(prev => prev.map(l => l.link_id === id ? { ...l, is_active: next } : l))
        startTransition(async () => {
            const res = await setPlatformLinkActive(id, next)
            if ('error' in res && res.error) setLinks(prev => prev.map(l => l.link_id === id ? { ...l, is_active: !next } : l))
        })
    }

    function handleDelete(id: string) {
        if (!confirm('Delete this link? Past signups keep their attribution, but the link stops working.')) return
        const prev = links
        setLinks(links.filter(l => l.link_id !== id))
        startTransition(async () => {
            const res = await deletePlatformLink(id)
            if ('error' in res && res.error) setLinks(prev)
        })
    }

    return (
        <div className="space-y-6">
            <Card className="p-5">
                <h2 className="font-semibold mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-indigo-600" /> New platform link</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Maria Cruz (TikTok)" maxLength={60} className="flex-1" />
                    <Button onClick={handleCreate} disabled={creating}>
                        {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : <><Link2 className="mr-2 h-4 w-4" /> Create link</>}
                    </Button>
                </div>
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </Card>

            {links.length === 0 ? (
                <Card className="p-10 text-center text-slate-500">
                    <Link2 className="h-10 w-10 mx-auto text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">No platform links yet</p>
                    <p className="text-sm">Create one above and hand it to an influencer.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {links.map(link => <PlatformRow key={link.link_id} link={link} url={urlFor(link.code)} onToggle={handleToggle} onDelete={handleDelete} />)}
                </div>
            )}
            {pending && <p className="text-xs text-slate-400">Saving…</p>}
        </div>
    )
}

function PlatformRow({ link, url, onToggle, onDelete }: {
    link: PlatformReferralStat
    url: string
    onToggle: (id: string, next: boolean) => void
    onDelete: (id: string) => void
}) {
    const [copied, setCopied] = useState(false)
    const qrRef = useRef<HTMLDivElement>(null)
    const convRate = link.clicks > 0 ? (link.signups / link.clicks) * 100 : 0

    async function copy() {
        try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
    }
    function downloadQr() {
        const canvas = qrRef.current?.querySelector('canvas')
        if (!canvas) return
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png'); a.download = `${link.code}-qr.png`; a.click()
    }

    return (
        <Card className={`p-4 ${link.is_active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{link.label}</span>
                        {!link.is_active && <Badge variant="secondary" className="text-[10px] h-5">Paused</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                        <code className="text-xs bg-slate-100 rounded px-2 py-1 truncate max-w-[280px]">{url}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} title="Copy">
                            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="QR code"><QrCode className="h-3.5 w-3.5" /></Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xs">
                                <DialogHeader><DialogTitle className="text-base">{link.label}</DialogTitle></DialogHeader>
                                <div className="flex flex-col items-center gap-4 py-2">
                                    <div ref={qrRef} className="bg-white p-3 rounded-lg"><QRCodeCanvas value={url} size={200} includeMargin /></div>
                                    <code className="text-xs text-slate-500 break-all text-center">{url}</code>
                                    <Button variant="outline" size="sm" onClick={downloadQr} className="w-full"><Download className="mr-2 h-4 w-4" /> Download PNG</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={link.is_active ? 'Pause' : 'Activate'} onClick={() => onToggle(link.link_id, !link.is_active)}>
                        <Power className={`h-4 w-4 ${link.is_active ? 'text-green-600' : 'text-slate-400'}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => onDelete(link.link_id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t pt-4">
                <Stat icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={link.clicks.toLocaleString()} />
                <Stat icon={<Smartphone className="h-4 w-4" />} label="App taps" value={link.app_downloads.toLocaleString()} />
                <Stat icon={<UserPlus className="h-4 w-4" />} label="Signups" value={link.signups.toLocaleString()} />
                <Stat icon={<UserPlus className="h-4 w-4" />} label="Conversion" value={`${convRate.toFixed(1)}%`} />
            </div>
        </Card>
    )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">{icon}{label}</div>
            <div className="mt-0.5 font-bold text-slate-900">{value}</div>
        </div>
    )
}
