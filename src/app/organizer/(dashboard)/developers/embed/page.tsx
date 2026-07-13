'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Check, Code2, Globe, Palette, Eye, LayoutGrid, SunMoon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function EmbedPage() {
    const { toast } = useToast()
    const [partner, setPartner] = useState<any>(null)
    const [events, setEvents] = useState<any[]>([])
    const [copied, setCopied] = useState(false)

    // Customization state
    const [embedType, setEmbedType] = useState<'storefront' | 'event' | 'button'>('storefront')
    const [selectedEventId, setSelectedEventId] = useState('')
    const [primaryColor, setPrimaryColor] = useState('#000000')
    const [bgColor, setBgColor] = useState('#ffffff')
    const [textColor, setTextColor] = useState('#111111')
    const [height, setHeight] = useState('500')
    const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('light')
    const [layout, setLayout] = useState<'grid' | 'list' | 'carousel'>('grid')
    const [buttonLabel, setButtonLabel] = useState('🎫 Get Tickets')

    useEffect(() => {
        async function load() {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: p } = await supabase
                .from('partners')
                .select('id, slug, business_name, branding')
                .eq('user_id', user.id)
                .single()

            if (p) {
                setPartner(p)

                // Load brand colors from branding if available
                if (p.branding?.colors?.primary) setPrimaryColor(p.branding.colors.primary)
                if (p.branding?.colors?.background) setBgColor(p.branding.colors.background)

                // Load events for event selector
                const { data: evts } = await supabase
                    .from('events')
                    .select('id, title, start_datetime')
                    .eq('organizer_id', p.id)
                    .eq('status', 'active')
                    .order('start_datetime', { ascending: true })

                if (evts) setEvents(evts)
                if (evts && evts.length > 0) setSelectedEventId(evts[0].id)
            }
        }
        load()
    }, [])

    // Generate the snippet
    const generateSnippet = () => {
        const attrs: string[] = []

        if (embedType === 'storefront' && partner?.slug) {
            attrs.push(`data-partner="${partner.slug}"`)
        } else if ((embedType === 'event' || embedType === 'button') && selectedEventId) {
            attrs.push(`data-event="${selectedEventId}"`)
        }

        if (embedType === 'button') {
            attrs.push('data-button="true"')
            if (buttonLabel && buttonLabel !== '🎫 Get Tickets') attrs.push(`data-label="${buttonLabel}"`)
        }

        // Layout only applies to the storefront (multi-event) widget.
        if (embedType === 'storefront' && layout !== 'grid') attrs.push(`data-layout="${layout}"`)

        // Theme applies to storefront + single-event card (not the bare button).
        if (embedType !== 'button' && theme !== 'light') attrs.push(`data-theme="${theme}"`)

        if (primaryColor !== '#000000') attrs.push(`data-primary-color="${primaryColor}"`)
        // Explicit bg/text colors override the theme — skip them when using a non-light
        // theme so its defaults apply, unless the user changed them from the light defaults.
        if (bgColor !== '#ffffff') attrs.push(`data-bg-color="${bgColor}"`)
        if (textColor !== '#111111') attrs.push(`data-text-color="${textColor}"`)
        if (embedType !== 'button' && height !== '500') attrs.push(`data-height="${height}"`)

        const attrStr = attrs.length > 0 ? ' ' + attrs.join('\n  ') : ''

        return `<!-- HangHut Embed Widget -->
<div class="hanghut-widget"${attrStr}></div>
<script src="https://hanghut.com/embed.js" async></script>`
    }

    const snippet = generateSnippet()

    const handleCopy = () => {
        navigator.clipboard.writeText(snippet)
        setCopied(true)
        toast({ title: 'Copied!', description: 'Embed code copied to clipboard.' })
        setTimeout(() => setCopied(false), 2000)
    }

    if (!partner) {
        return (
            <div className="flex-1 p-8 pt-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-muted rounded w-48" />
                    <div className="h-64 bg-muted rounded" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            {/* Page Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <Code2 className="h-8 w-8 text-primary" />
                    Embed Widget
                </h2>
                <p className="text-muted-foreground mt-1">
                    Add HangHut events directly to your website. No coding required — just copy and paste.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Configuration */}
                <div className="space-y-6">
                    {/* Embed Type */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Globe className="h-5 w-5 text-primary" />
                                What to Embed
                            </CardTitle>
                            <CardDescription>
                                Choose between showing all your events or a specific one.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Tabs value={embedType} onValueChange={(v) => setEmbedType(v as 'storefront' | 'event' | 'button')}>
                                <TabsList className="w-full">
                                    <TabsTrigger value="storefront" className="flex-1">All Events</TabsTrigger>
                                    <TabsTrigger value="event" className="flex-1">Single Event</TabsTrigger>
                                    <TabsTrigger value="button" className="flex-1">Buy Button</TabsTrigger>
                                </TabsList>
                                <TabsContent value="storefront" className="pt-4">
                                    <div className="bg-muted/50 p-4 rounded-lg border">
                                        <p className="text-sm text-muted-foreground">
                                            This will display a grid of all your upcoming events. When visitors click an event, a checkout popup will appear.
                                        </p>
                                        <Badge variant="secondary" className="mt-2">{partner.slug}</Badge>
                                    </div>
                                </TabsContent>
                                <TabsContent value="event" className="pt-4">
                                    <div className="space-y-3">
                                        <Label>Select Event</Label>
                                        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose an event..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {events.map((evt) => (
                                                    <SelectItem key={evt.id} value={evt.id}>
                                                        {evt.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            This will show the event cover photo, details, and a "Buy Tickets" button.
                                        </p>
                                    </div>
                                </TabsContent>
                                <TabsContent value="button" className="pt-4">
                                    <div className="space-y-3">
                                        <Label>Select Event</Label>
                                        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose an event..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {events.map((evt) => (
                                                    <SelectItem key={evt.id} value={evt.id}>
                                                        {evt.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-medium">Button Text</Label>
                                            <Input
                                                value={buttonLabel}
                                                onChange={(e) => setButtonLabel(e.target.value)}
                                                placeholder="🎫 Get Tickets"
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            A single inline button (no card). Clicking it opens the checkout popup directly — perfect for dropping into any page.
                                        </p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Layout & Theme */}
                    {embedType !== 'button' && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <SunMoon className="h-5 w-5 text-primary" />
                                    Layout &amp; Theme
                                </CardTitle>
                                <CardDescription>
                                    Choose how the widget looks on your site.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Layout — storefront only */}
                                {embedType === 'storefront' && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center gap-1.5">
                                            <LayoutGrid className="h-3.5 w-3.5" /> Layout
                                        </Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['grid', 'list', 'carousel'] as const).map((opt) => (
                                                <Button
                                                    key={opt}
                                                    type="button"
                                                    variant={layout === opt ? 'default' : 'outline'}
                                                    size="sm"
                                                    className="capitalize"
                                                    onClick={() => setLayout(opt)}
                                                >
                                                    {opt}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Theme */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Theme</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['light', 'dark', 'auto'] as const).map((opt) => (
                                            <Button
                                                key={opt}
                                                type="button"
                                                variant={theme === opt ? 'default' : 'outline'}
                                                size="sm"
                                                className="capitalize"
                                                onClick={() => setTheme(opt)}
                                            >
                                                {opt}
                                            </Button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {theme === 'auto'
                                            ? 'Matches your visitor’s light/dark system preference.'
                                            : theme === 'dark'
                                                ? 'Dark background with light text.'
                                                : 'Light background (default).'}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Customization */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="h-5 w-5 text-primary" />
                                Customize Colors
                            </CardTitle>
                            <CardDescription>
                                Match the widget to your website's branding.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Button Color</Label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg border cursor-pointer"
                                        />
                                        <Input
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                            className="text-xs font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Background</Label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={bgColor}
                                            onChange={(e) => setBgColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg border cursor-pointer"
                                        />
                                        <Input
                                            value={bgColor}
                                            onChange={(e) => setBgColor(e.target.value)}
                                            className="text-xs font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Text Color</Label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={textColor}
                                            onChange={(e) => setTextColor(e.target.value)}
                                            className="w-10 h-10 rounded-lg border cursor-pointer"
                                        />
                                        <Input
                                            value={textColor}
                                            onChange={(e) => setTextColor(e.target.value)}
                                            className="text-xs font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                            {embedType !== 'button' && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-medium">Widget Height (px)</Label>
                                    <Input
                                        type="number"
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        min="300"
                                        max="1200"
                                        step="50"
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Code Output + Preview */}
                <div className="space-y-6">
                    {/* Code Output */}
                    <Card className="border-primary/20">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Code2 className="h-5 w-5 text-primary" />
                                    Your Embed Code
                                </CardTitle>
                                <Button
                                    onClick={handleCopy}
                                    variant={copied ? 'default' : 'outline'}
                                    size="sm"
                                    className="gap-2"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-4 w-4" />
                                            Copy Code
                                        </>
                                    )}
                                </Button>
                            </div>
                            <CardDescription>
                                Paste this into your website's HTML. Works with WordPress, Wix, Squarespace, Webflow, and more.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="bg-zinc-950 text-zinc-100 p-5 rounded-xl text-sm font-mono leading-relaxed overflow-x-auto border border-zinc-800 whitespace-pre-wrap break-all">
                                {snippet}
                            </pre>
                        </CardContent>
                    </Card>

                    {/* Instructions */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">How to Add to Your Website</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex gap-3 items-start">
                                <Badge className="shrink-0 mt-0.5">1</Badge>
                                <p className="text-sm text-muted-foreground">
                                    Copy the embed code above using the <strong>Copy Code</strong> button.
                                </p>
                            </div>
                            <div className="flex gap-3 items-start">
                                <Badge className="shrink-0 mt-0.5">2</Badge>
                                <p className="text-sm text-muted-foreground">
                                    In your website builder, add a <strong>Custom HTML</strong> or <strong>Embed Code</strong> block.
                                </p>
                            </div>
                            <div className="flex gap-3 items-start">
                                <Badge className="shrink-0 mt-0.5">3</Badge>
                                <p className="text-sm text-muted-foreground">
                                    Paste the code and publish. Your events will appear live on your website!
                                </p>
                            </div>

                            <div className="bg-muted/50 p-4 rounded-lg mt-4 border">
                                <p className="text-xs text-muted-foreground">
                                    <strong>Note:</strong> When visitors click "Buy Tickets", they will complete checkout securely through HangHut without leaving your website. 
                                    Payment is handled by Xendit. All purchases are processed as guest checkouts.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
