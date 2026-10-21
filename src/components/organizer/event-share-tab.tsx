'use client'

import { useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { downloadBlob } from '@/lib/utils/download'
import { cn } from '@/lib/utils'
import { eventHref } from '@/lib/events/urls'
import {
    Check, Copy, Download, ExternalLink, Link2, QrCode, Code2, Loader2,
} from 'lucide-react'

/**
 * Everything that gets this event in front of people, in one place.
 *
 * These used to be scattered: the embed snippets lived under Developers →
 * Embed Widget, which made you leave the event you were on and then pick that
 * same event again from a dropdown. The link builder did not exist, so the
 * attribution work had no way for an organizer to actually tag a link.
 *
 * The partner-level "all events" storefront widget deliberately stays in
 * Developers — it is not about any one event, so it has no business here.
 */

interface Props {
    eventId: string
    eventTitle: string
    /** events.slug. Every event has one (445 of 445 on prod), and /events/<uuid>
     *  only 301s to it — so sharing the UUID means every poster, caption and
     *  QR code carries a redirect and an unreadable link. */
    eventSlug?: string | null
    /** Site origin, resolved on the server so this never guesses in preview. */
    baseUrl: string
    /** events.status. The embed route serves only 'active' and 'hidden', so a
     *  draft would render a 404 page inside the preview frame and read as a
     *  broken widget rather than an unpublished event. */
    eventStatus?: string | null
}

/**
 * The sources the analytics layer actually recognises.
 *
 * These values are not free text: `utm_source` is read by deriveSource() in
 * lib/tracking.ts and normalised through SOURCE_ALIASES, and the same strings
 * are matched by the attribution_source() SQL function behind the Traffic
 * sources card. Picking from this list is what makes a link show up as
 * "Instagram" on the Analytics tab instead of landing in an "other" bucket.
 */
const SOURCES: { id: string; label: string; medium: string }[] = [
    { id: 'instagram', label: 'Instagram', medium: 'social' },
    { id: 'facebook', label: 'Facebook', medium: 'social' },
    { id: 'tiktok', label: 'TikTok', medium: 'social' },
    { id: 'twitter', label: 'X / Twitter', medium: 'social' },
    { id: 'youtube', label: 'YouTube', medium: 'social' },
    { id: 'viber', label: 'Viber', medium: 'chat' },
    { id: 'whatsapp', label: 'WhatsApp', medium: 'chat' },
    { id: 'telegram', label: 'Telegram', medium: 'chat' },
    { id: 'email', label: 'Email', medium: 'email' },
]

/** A campaign label has to survive a URL and a SQL GROUP BY. */
function slugifyCampaign(v: string): string {
    return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function CopyRow({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
    const { toast } = useToast()
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
            toast({ title: 'Copied', description: label })
        } catch {
            // Clipboard is blocked in some in-app browsers and over plain http.
            // Saying so beats a button that silently does nothing.
            toast({
                title: 'Could not copy',
                description: 'Select the text and copy it manually.',
                variant: 'destructive',
            })
        }
    }

    return (
        <div className="flex gap-2">
            <div
                className={cn(
                    'flex-1 min-w-0 rounded-md border bg-muted/40 px-3 py-2 text-sm overflow-x-auto whitespace-pre',
                    mono && 'font-mono text-xs',
                )}
            >
                {value}
            </div>
            <Button variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    )
}

/**
 * What the widget actually renders, shown rather than described.
 *
 * The two embeds are not the same kind of thing, so neither is their preview:
 *
 *  - The event card IS an iframe of /embed/event/<id>, so the preview is that
 *    same iframe at the loader's default 500px height. It is the real page,
 *    not a mock, so it cannot drift from what the snippet produces.
 *  - The buy button is NOT an iframe. embed.js injects a plain styled <button>
 *    into the host page, so the honest preview is that button rebuilt with the
 *    same declarations — see the cssText it writes in public/embed.js.
 *
 * The src is relative on purpose. baseUrl points at the production origin for
 * the snippet, but iframing production from a local dev server is cross-origin
 * and gets refused; a relative path previews whatever origin you are on.
 */
function CardPreview({ eventId, embeddable, matchDesign }: { eventId: string; embeddable: boolean; matchDesign: boolean }) {
    const [loaded, setLoaded] = useState(false)

    if (!embeddable) {
        return (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
                <p className="text-sm font-medium">Preview available once the event is live</p>
                <p className="text-xs text-muted-foreground mt-1">
                    The widget only shows published events. The code below is already correct —
                    paste it now and it will fill in when you publish.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
                {!loaded && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading preview…
                    </div>
                )}
                <iframe
                    // Keyed so flipping the toggle actually refetches: changing an
                    // iframe's src alone leaves the old document up in some browsers.
                    key={matchDesign ? 'match' : 'default'}
                    src={`/embed/event/${eventId}${matchDesign ? '?design=event' : ''}`}
                    title="Embed preview"
                    onLoad={() => setLoaded(true)}
                    className="w-full block border-0"
                    style={{ height: 500 }}
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Live preview at the default 500px height.
                </p>
                <Button variant="ghost" size="sm" asChild className="h-auto py-1 text-xs">
                    <a href={`/embed/event/${eventId}${matchDesign ? '?design=event' : ''}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Open in new tab
                    </a>
                </Button>
            </div>
        </div>
    )
}

/** Defaults taken from embed.js: label "🎫 Get Tickets", #000 fill, 10px
 *  radius, 12px/22px padding, 15px/700 type. The Share snippet sets none of
 *  the data-* overrides, so these defaults are exactly what a visitor sees. */
function ButtonPreview() {
    return (
        <div className="space-y-2">
            <div className="rounded-lg border bg-muted/30 p-8 flex items-center justify-center">
                {/* Not interactive: clicking it in the dashboard would open a
                    checkout for your own event, which is not what anyone is
                    asking for by looking at a preview. */}
                <span
                    aria-hidden
                    className="select-none"
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '12px 22px', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
                        color: '#fff', background: '#000000', borderRadius: 10, lineHeight: 1,
                    }}
                >
                    🎫 Get Tickets
                </span>
            </div>
            <p className="text-xs text-muted-foreground">
                Sits inline on your page. Clicking it opens checkout in a popup —
                visitors never leave your site.
            </p>
        </div>
    )
}

export function EventShareTab({ eventId, eventTitle, eventSlug, baseUrl, eventStatus }: Props) {
    const { toast } = useToast()
    const publicUrl = `${baseUrl}${eventHref({ id: eventId, slug: eventSlug })}`
    const embeddable = eventStatus === 'active' || eventStatus === 'hidden'
    const [matchDesign, setMatchDesign] = useState(true)
    const [embedKind, setEmbedKind] = useState<'card' | 'button'>('card')

    // ── Link builder
    const [source, setSource] = useState<string>('instagram')
    const [campaign, setCampaign] = useState('')

    const taggedUrl = useMemo(() => {
        const preset = SOURCES.find(s => s.id === source)
        const u = new URL(publicUrl)
        u.searchParams.set('utm_source', source)
        if (preset?.medium) u.searchParams.set('utm_medium', preset.medium)
        const c = slugifyCampaign(campaign)
        if (c) u.searchParams.set('utm_campaign', c)
        return u.toString()
    }, [publicUrl, source, campaign])

    // ── QR
    const qrWrap = useRef<HTMLDivElement>(null)
    /** The QR encodes the TAGGED link, so a poster is measurable too — a scan
     *  from a flyer is otherwise indistinguishable from direct traffic. */
    const [qrTagged, setQrTagged] = useState(false)
    const qrValue = qrTagged ? taggedUrl : publicUrl

    const downloadQr = () => {
        const canvas = qrWrap.current?.querySelector('canvas')
        if (!canvas) {
            toast({ title: 'QR not ready', description: 'Give it a moment and try again.', variant: 'destructive' })
            return
        }
        canvas.toBlob(blob => {
            if (!blob) {
                toast({ title: 'Could not build the image', variant: 'destructive' })
                return
            }
            const slug = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
            downloadBlob(blob, `${slug || 'event'}-qr.png`)
        }, 'image/png')
    }

    // ── Embed snippets, pre-scoped to THIS event.
    //    Matches the markup the Developers page emits; only the scoping
    //    changes, because the event is already known here.
    const designAttr = matchDesign ? ' data-design="event"' : ''

    const cardSnippet = `<!-- HangHut Embed Widget -->
<div class="hanghut-widget" data-event="${eventId}"${designAttr}></div>
<script src="https://hanghut.com/embed.js" async></script>`

    // The button is drawn by embed.js on the host page, not inside a frame, so
    // it has no document to inherit a font or theme from — data-design would be
    // a no-op on it and is deliberately left off.
    const buttonSnippet = `<!-- HangHut Buy Button -->
<div class="hanghut-widget" data-event="${eventId}" data-button="true"></div>
<script src="https://hanghut.com/embed.js" async></script>`

    return (
        <div className="space-y-6">
            {/* ── The link ─────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Link2 className="h-5 w-5 text-primary" />
                        Event link
                    </CardTitle>
                    <CardDescription>The page people buy from. Safe to post anywhere.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <CopyRow value={publicUrl} label="Event link" />
                    <Button variant="outline" size="sm" asChild>
                        <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open event page
                        </a>
                    </Button>
                </CardContent>
            </Card>

            {/* ── Tagged links ─────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Link2 className="h-5 w-5 text-primary" />
                        Track where sales come from
                    </CardTitle>
                    <CardDescription>
                        Use a tagged link per place you post. Visits and orders from it show up
                        under Traffic sources on the Analytics tab.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Posting it on</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {SOURCES.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSource(s.id)}
                                    className={cn(
                                        'text-xs px-3 py-1.5 rounded-full border transition-colors',
                                        source === s.id
                                            ? 'bg-foreground text-background border-foreground'
                                            : 'border-border hover:bg-muted',
                                    )}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="hh-campaign" className="text-xs uppercase tracking-wider text-muted-foreground">
                            Campaign <span className="normal-case tracking-normal">(optional)</span>
                        </Label>
                        <Input
                            id="hh-campaign"
                            value={campaign}
                            onChange={e => setCampaign(e.target.value)}
                            placeholder="early-bird, launch-post, influencer-name"
                            maxLength={40}
                        />
                        <p className="text-xs text-muted-foreground">
                            Lets you tell two Instagram posts apart. Letters, numbers and dashes.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your link</Label>
                        <CopyRow value={taggedUrl} label="Tagged link" />
                    </div>
                </CardContent>
            </Card>

            {/* ── QR ───────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <QrCode className="h-5 w-5 text-primary" />
                        QR code
                    </CardTitle>
                    <CardDescription>For posters, flyers and tarpaulins.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                        <div ref={qrWrap} className="bg-white p-3 rounded-lg border w-fit mx-auto sm:mx-0">
                            {/* Rendered at 512 and displayed small, so the downloaded
                                PNG is big enough to print without blurring. */}
                            <QRCodeCanvas
                                value={qrValue}
                                size={512}
                                level="M"
                                includeMargin
                                className="!w-[150px] !h-[150px]"
                            />
                        </div>
                        <div className="space-y-3 flex-1">
                            <label className="flex items-start gap-2 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={qrTagged}
                                    onChange={e => setQrTagged(e.target.checked)}
                                    className="mt-0.5"
                                />
                                <span>
                                    Use the tagged link
                                    <span className="block text-xs text-muted-foreground">
                                        Scans get counted as {SOURCES.find(s => s.id === source)?.label ?? source} instead of direct.
                                    </span>
                                </span>
                            </label>
                            <Button variant="outline" size="sm" onClick={downloadQr}>
                                <Download className="h-4 w-4 mr-2" />
                                Download PNG
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Downloads at 512px — large enough for print.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Embed ────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Code2 className="h-5 w-5 text-primary" />
                        Put it on your website
                    </CardTitle>
                    <CardDescription>
                        Paste into your site&apos;s HTML. No coding needed, and people check out
                        without leaving your page.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {embedKind === 'card' && (
                    <label className="flex items-start gap-2 text-sm cursor-pointer mb-4 rounded-lg border bg-muted/30 p-3">
                        <input
                            type="checkbox"
                            checked={matchDesign}
                            onChange={e => setMatchDesign(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            Match my event page design
                            <span className="block text-xs text-muted-foreground">
                                Uses this event&apos;s accent colour, text colour and font, so the
                                widget looks like the page it links to. Off, it uses neutral defaults.
                            </span>
                        </span>
                    </label>
                    )}

                    <Tabs value={embedKind} onValueChange={v => setEmbedKind(v as 'card' | 'button')}>
                        <TabsList className="w-full">
                            <TabsTrigger value="card" className="flex-1">Event card</TabsTrigger>
                            <TabsTrigger value="button" className="flex-1">Buy button</TabsTrigger>
                        </TabsList>
                        <TabsContent value="card" className="pt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Shows the cover photo, details and a Buy Tickets button.
                            </p>
                            <CardPreview eventId={eventId} embeddable={embeddable} matchDesign={matchDesign} />
                            <CopyRow value={cardSnippet} label="Embed code" />
                        </TabsContent>
                        <TabsContent value="button" className="pt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Just a button — for when your page already describes the event.
                            </p>
                            <ButtonPreview />
                            <CopyRow value={buttonSnippet} label="Buy button code" />
                        </TabsContent>
                    </Tabs>
                    <p className="text-xs text-muted-foreground mt-4">
                        Want a grid of <em>all</em> your events instead? That one lives in{' '}
                        <span className="font-medium text-foreground">Developers → Embed Widget</span>,
                        where you can also change colours and layout.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
