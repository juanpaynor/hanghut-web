'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Activity, Copy, Check, Plus, Loader2, Eye, Ban, ExternalLink } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    createStatusLink, revokeStatusLink, setStatusLinkRevenue, type StatusLink,
} from '@/lib/organizer/status-link-actions'

interface Props {
    eventId: string
    baseUrl: string
    initialLinks: StatusLink[]
}

function relative(iso: string | null): string {
    if (!iso) return 'never'
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

export function StatusLinksManager({ eventId, baseUrl, initialLinks }: Props) {
    const { toast } = useToast()
    const [links, setLinks] = useState<StatusLink[]>(initialLinks)
    const [label, setLabel] = useState('')
    const [withRevenue, setWithRevenue] = useState(false)
    const [pending, startTransition] = useTransition()
    const [copied, setCopied] = useState<string | null>(null)

    const urlFor = (token: string) => `${baseUrl}/s/${token}`

    const copy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(urlFor(token))
            setCopied(token)
            setTimeout(() => setCopied(null), 2000)
        } catch {
            // Clipboard is blocked in some embedded browsers; the input below is
            // selectable as the fallback.
            toast({ title: 'Could not copy', description: 'Select the link and copy it manually.' })
        }
    }

    const create = () => {
        startTransition(async () => {
            const res = await createStatusLink({ eventId, label, showRevenue: withRevenue })
            if (res.error || !res.link) {
                toast({ title: 'Could not create link', description: res.error, variant: 'destructive' })
                return
            }
            setLinks((prev) => [res.link as StatusLink, ...prev])
            setLabel('')
            setWithRevenue(false)
            toast({ title: 'Link created', description: 'Copy it and send it to whoever needs the numbers.' })
        })
    }

    const revoke = (id: string) => {
        startTransition(async () => {
            const res = await revokeStatusLink(id, eventId)
            if (res.error) {
                toast({ title: 'Could not revoke', description: res.error, variant: 'destructive' })
                return
            }
            setLinks((prev) => prev.map((l) =>
                l.id === id ? { ...l, is_active: false, revoked_at: new Date().toISOString() } : l))
            toast({ title: 'Link revoked', description: 'It stops working immediately.' })
        })
    }

    const toggleRevenue = (link: StatusLink, next: boolean) => {
        // Optimistic: the switch must not lag behind the thumb on a phone.
        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, show_revenue: next } : l)))
        startTransition(async () => {
            const res = await setStatusLinkRevenue(link.id, eventId, next)
            if (res.error) {
                setLinks((prev) => prev.map((l) =>
                    (l.id === link.id ? { ...l, show_revenue: !next } : l)))
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
            }
        })
    }

    const live = links.filter((l) => l.is_active)
    const dead = links.filter((l) => !l.is_active)

    return (
        <Card className="p-6">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-lg font-bold">Share live status</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        A read-only page showing tickets sold and check-ins. Anyone with the link can
                        open it — no account, no team seat. It never shows attendee names or emails.
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
                <Label htmlFor="status-link-label" className="text-sm font-medium">
                    Who is this for?
                </Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                        id="status-link-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Door staff, venue manager, promoter…"
                        maxLength={80}
                        onKeyDown={(e) => e.key === 'Enter' && !pending && create()}
                    />
                    <Button onClick={create} disabled={pending} className="shrink-0">
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Create link
                    </Button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <Switch id="status-link-revenue" checked={withRevenue} onCheckedChange={setWithRevenue} />
                    <Label htmlFor="status-link-revenue" className="text-sm font-normal text-muted-foreground">
                        Also show gross sales — off by default, since links get forwarded
                    </Label>
                </div>
            </div>

            {live.length > 0 && (
                <div className="mt-5 space-y-3">
                    {live.map((l) => (
                        <div key={l.id} className="rounded-xl border border-border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate font-semibold">{l.label || 'Untitled link'}</span>
                                    {l.show_revenue && (
                                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                                            shows sales
                                        </Badge>
                                    )}
                                </div>
                                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                    <Eye className="h-3.5 w-3.5" />
                                    {l.view_count} {l.view_count === 1 ? 'view' : 'views'} · {relative(l.last_viewed_at)}
                                </span>
                            </div>

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <Input readOnly value={urlFor(l.token)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                                <div className="flex shrink-0 gap-2">
                                    <Button variant="outline" size="sm" onClick={() => copy(l.token)} className="flex-1 sm:flex-none">
                                        {copied === l.token ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                                        {copied === l.token ? 'Copied' : 'Copy'}
                                    </Button>
                                    <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
                                        <a href={urlFor(l.token)} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                            Open
                                        </a>
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <Switch
                                        id={`rev-${l.id}`}
                                        checked={l.show_revenue}
                                        onCheckedChange={(v) => toggleRevenue(l, v)}
                                    />
                                    <Label htmlFor={`rev-${l.id}`} className="text-xs font-normal text-muted-foreground">
                                        Show gross sales
                                    </Label>
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                            <Ban className="mr-1.5 h-3.5 w-3.5" />
                                            Revoke
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {l.label ? `"${l.label}" ` : 'This link '}
                                                stops working immediately for everyone who has it. This cannot be
                                                undone — you would need to create a new link and send it out again.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => revoke(l.id)}>
                                                Revoke link
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {live.length === 0 && (
                <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No active links. Create one above to share this event&rsquo;s numbers.
                </p>
            )}

            {dead.length > 0 && (
                <details className="mt-4">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                        {dead.length} revoked {dead.length === 1 ? 'link' : 'links'}
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                        {dead.map((l) => (
                            <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="truncate line-through">{l.label || 'Untitled link'}</span>
                                <span className="shrink-0">revoked {relative(l.revoked_at)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </Card>
    )
}
