'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { updateEventStorefront, uploadEventBgImage } from "@/lib/organizer/event-actions"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ArrowUp, ArrowDown, LayoutDashboard, Palette, FileCode, Sparkles, Timer, Upload, Type, X, Plus, ListMusic } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoUploader } from "@/components/ui/video-uploader"
import { DraggableVideoCropper } from "@/components/ui/draggable-video-cropper"
import { EventDesignGallery } from "@/components/organizer/event-design-gallery"
import type { EventDesignTemplate } from "@/lib/event-design-templates"

const formSchema = z.object({
    video_url: z.string().url("Must be a valid URL").optional().or(z.literal('')).or(z.null()).transform(v => v ?? ''),
    description_html: z.string().optional(),
    theme_color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color code").optional(),
})

interface StorefrontCustomizationFormProps {
    eventId: string
    initialData: {
        video_url?: string | null
        description_html?: string | null
        theme_color?: string | null
        cover_image_url?: string | null
        layout_config?: any
    }
}

/**
 * Client-side vibrant-color extraction from the event cover: downsample to a
 * small canvas, bucket pixels by hue, and pick the most saturated dominant
 * bucket. Powers "Match my cover" so pages theme themselves from the poster.
 */
async function extractVibrantColor(imageUrl: string): Promise<string | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = document.createElement('img')
            el.crossOrigin = 'anonymous'
            el.onload = () => resolve(el)
            el.onerror = reject
            el.src = imageUrl
        })
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        // 12 hue buckets, scored by saturation × mid-tone weight
        const buckets = Array.from({ length: 12 }, () => ({ score: 0, r: 0, g: 0, b: 0, n: 0 }))
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const max = Math.max(r, g, b), min = Math.min(r, g, b)
            const sat = max === 0 ? 0 : (max - min) / max
            const light = (max + min) / 510
            if (sat < 0.25 || light < 0.12 || light > 0.92) continue // skip greys/extremes
            let h = 0
            const d = max - min
            if (d > 0) {
                if (max === r) h = ((g - b) / d + 6) % 6
                else if (max === g) h = (b - r) / d + 2
                else h = (r - g) / d + 4
            }
            const bucket = buckets[Math.floor(h * 2) % 12]
            const score = sat * (1 - Math.abs(light - 0.5))
            bucket.score += score
            bucket.r += r * score; bucket.g += g * score; bucket.b += b * score
            bucket.n += score
        }
        const best = buckets.reduce((a, c) => (c.score > a.score ? c : a))
        if (!best.n) return null
        const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, '0')
        return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`
    } catch {
        return null // CORS or decode failure — non-fatal
    }
}

const SECTION_LABELS: Record<string, string> = {
    hero: "Hero Section (Image/Video)",
    title: "Event Title & Date",
    details: "Key Details (Location/Time)",
    about: "About Section",
    lineup: "Lineup (Artists/Speakers)",
    schedule: "Schedule / Rundown",
    gallery: "Photo Gallery",
    organizer: "Organizer Info",
    faq: "FAQ",
    sponsors: "Sponsors & Partners",
    tickets: "Ticket Selector"
}

const DEFAULT_LAYOUT = ["hero", "title", "details", "about", "lineup", "schedule", "gallery", "organizer", "faq", "sponsors", "tickets"]

// Rich-section content types (stored in layout_config.sections)
type LineupEntry = { name: string; role?: string; photo_url?: string }
type ScheduleEntry = { time: string; title: string; description?: string }
type FaqEntry = { q: string; a: string }
type SponsorEntry = { name: string; logo_url?: string; url?: string }

export function StorefrontCustomizationForm({ eventId, initialData }: StorefrontCustomizationFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    // Layout State
    // Ensure we have a valid array even if DB is null or empty; merge in any
    // section ids added after this event's order was saved (before tickets).
    const initialOrder: string[] = (() => {
        const saved: string[] = (initialData.layout_config?.order && initialData.layout_config.order.length > 0
            ? [...initialData.layout_config.order]
            : [...DEFAULT_LAYOUT]
        ).filter((s: string) => s in SECTION_LABELS) // drop retired sections (e.g. 'location')
        const missing = DEFAULT_LAYOUT.filter(s => !saved.includes(s))
        if (missing.length) {
            const ti = saved.indexOf('tickets')
            saved.splice(ti === -1 ? saved.length : ti, 0, ...missing)
        }
        return saved
    })()

    const initialHidden = new Set((initialData.layout_config?.hidden || []) as string[])
    const initialVideoPosition = initialData.layout_config?.video_position || 'center 50%'

    const [layoutOrder, setLayoutOrder] = useState<string[]>(initialOrder)
    const [hiddenSections, setHiddenSections] = useState<Set<string>>(initialHidden)
    const [videoPosition, setVideoPosition] = useState<string>(initialVideoPosition)

    // Visual style state
    const [pageThemeId, setPageThemeId] = useState<string>(initialData.layout_config?.theme || 'classic')
    const [matchingCover, setMatchingCover] = useState(false)

    // Rich content sections (rendered on the public page only when non-empty)
    const [lineup, setLineup] = useState<LineupEntry[]>(initialData.layout_config?.sections?.lineup || [])
    const [schedule, setSchedule] = useState<ScheduleEntry[]>(initialData.layout_config?.sections?.schedule || [])
    const [faq, setFaq] = useState<FaqEntry[]>(initialData.layout_config?.sections?.faq || [])
    const [sponsors, setSponsors] = useState<SponsorEntry[]>(initialData.layout_config?.sections?.sponsors || [])

    // Shared image-upload plumbing for lineup photos / sponsor logos: one hidden
    // input; whoever opens it registers a callback for the uploaded URL.
    const sectionImageInputRef = useRef<HTMLInputElement>(null)
    const sectionImageCbRef = useRef<((url: string) => void) | null>(null)
    const [sectionImageUploading, setSectionImageUploading] = useState(false)
    const pickSectionImage = (cb: (url: string) => void) => {
        sectionImageCbRef.current = cb
        sectionImageInputRef.current?.click()
    }
    const [bgStyle, setBgStyle] = useState<string>(initialData.layout_config?.bg_style || 'default')
    const [pageLayout, setPageLayout] = useState<string>(initialData.layout_config?.page_layout || 'default')
    const [showCountdown, setShowCountdown] = useState<boolean>(initialData.layout_config?.show_countdown ?? false)
    const [countdownLabel, setCountdownLabel] = useState<string>(initialData.layout_config?.countdown_label || 'Event starts in')
    const [showSocialProof, setShowSocialProof] = useState<boolean>(initialData.layout_config?.show_social_proof ?? false)
    const [bgImageUrl, setBgImageUrl] = useState<string>(initialData.layout_config?.bg_image_url || '')
    const [bgImageUploading, setBgImageUploading] = useState(false)
    const [fontHeading, setFontHeading] = useState<string>(initialData.layout_config?.font_heading || 'inter')
    const [fontBody, setFontBody] = useState<string>(initialData.layout_config?.font_body || 'inter')
    const [textColor, setTextColor] = useState<string>(initialData.layout_config?.text_color || '')
    const [headingColor, setHeadingColor] = useState<string>(initialData.layout_config?.heading_color || '')
    const bgImageInputRef = useRef<HTMLInputElement>(null)

    const FONT_OPTIONS = [
        { value: 'inter',     label: 'Inter',              preview: 'Modern & clean (default)' },
        { value: 'outfit',    label: 'Outfit',             preview: 'Friendly & geometric' },
        { value: 'grotesk',   label: 'Space Grotesk',      preview: 'Tech & editorial' },
        { value: 'playfair',  label: 'Playfair Display',   preview: 'Elegant serif' },
        { value: 'cormorant', label: 'Cormorant Garamond', preview: 'Luxury & refined' },
        { value: 'dmserif',   label: 'DM Serif Display',   preview: 'Bold serif' },
        { value: 'bebas',     label: 'Bebas Neue',         preview: 'Ultra bold display' },
        { value: 'mono',      label: 'JetBrains Mono',     preview: 'Monospace / tech' },
    ]

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            video_url: initialData.video_url || "",
            description_html: initialData.description_html || "",
            theme_color: initialData.theme_color || "#000000",
        },
    })

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...layoutOrder]
        if (direction === 'up' && index > 0) {
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]]
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
        }
        setLayoutOrder(newOrder)
    }

    /** One-click template: applies the art-directed theme + fills every LOOK knob;
     *  content (sections, video, HTML) is untouched */
    const applyTemplate = (t: EventDesignTemplate) => {
        setPageThemeId(t.theme)
        form.setValue('theme_color', t.theme_color, { shouldDirty: true })
        setBgStyle(t.bg_style)
        setPageLayout(t.page_layout)
        setFontHeading(t.font_heading)
        setFontBody(t.font_body)
        setHeadingColor(t.heading_color || '')
        setTextColor(t.text_color || '')
        setShowCountdown(t.show_countdown)
        setShowSocialProof(t.show_social_proof)
        toast({
            title: `${t.name} applied`,
            description: 'Tweak anything below, then hit Save Customizations.',
        })
    }

    const toggleVisibility = (section: string) => {
        const newHidden = new Set(hiddenSections)
        if (newHidden.has(section)) {
            newHidden.delete(section)
        } else {
            newHidden.add(section)
        }
        setHiddenSections(newHidden)
    }

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true)
        try {
            const result = await updateEventStorefront(eventId, {
                video_url: values.video_url || null,
                description_html: values.description_html || null,
                theme_color: values.theme_color || null,
                layout_config: {
                    theme: pageThemeId,
                    order: layoutOrder,
                    hidden: Array.from(hiddenSections),
                    video_position: videoPosition,
                    bg_style: bgStyle,
                    page_layout: pageLayout,
                    show_countdown: showCountdown,
                    countdown_label: countdownLabel,
                    show_social_proof: showSocialProof,
                    bg_image_url: bgImageUrl || null,
                    font_heading: fontHeading,
                    font_body: fontBody,
                    text_color: textColor || null,
                    heading_color: headingColor || null,
                    sections: {
                        lineup: lineup.filter(a => a.name.trim()),
                        schedule: schedule.filter(s => s.title.trim()),
                        faq: faq.filter(f => f.q.trim()),
                        sponsors: sponsors.filter(s => s.name.trim()),
                    },
                }
            })

            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else {
                toast({
                    title: "Success",
                    description: "Storefront customization saved.",
                })
                router.refresh()
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Something went wrong.",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Storefront Customization</h1>
                <p className="text-muted-foreground">Customize how your event page looks and feels.</p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                    {/* 0. Design Templates */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5" />
                                Design Templates
                            </CardTitle>
                            <CardDescription>
                                Start from a curated look — one click sets the background, layout, fonts, and colors. You can fine-tune everything below afterwards.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <EventDesignGallery
                                current={{
                                    theme: pageThemeId,
                                    themeColor: form.watch('theme_color') || '#000000',
                                    bgStyle,
                                    pageLayout,
                                }}
                                onApply={applyTemplate}
                            />
                        </CardContent>
                    </Card>

                    {/* 1. Media & Theme */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="h-5 w-5" />
                                Theme & Media
                            </CardTitle>
                            <CardDescription>
                                Set your brand color and add a video cover.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="theme_color"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Brand Color (Hex)</FormLabel>
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <Input
                                                type="color"
                                                className="w-16 h-10 p-1 cursor-pointer"
                                                {...field}
                                            />
                                            <Input
                                                placeholder="#000000"
                                                className="font-mono flex-1 min-w-[120px]"
                                                {...field}
                                            />
                                            {initialData.cover_image_url && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={matchingCover}
                                                    onClick={async () => {
                                                        setMatchingCover(true)
                                                        const color = await extractVibrantColor(initialData.cover_image_url!)
                                                        setMatchingCover(false)
                                                        if (color) {
                                                            form.setValue('theme_color', color, { shouldDirty: true })
                                                            toast({ title: 'Matched your cover', description: `Brand color set to ${color}.` })
                                                        } else {
                                                            toast({ title: "Couldn't read the cover", description: 'Try picking a color manually.', variant: 'destructive' })
                                                        }
                                                    }}
                                                >
                                                    {matchingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <>🎨 Match my cover</>}
                                                </Button>
                                            )}
                                        </div>
                                        <FormDescription>Used for buttons and accents on your event page.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />



                            <FormField
                                control={form.control}
                                name="video_url"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Hero Video (Optional)</FormLabel>
                                        <FormControl>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="md:col-span-3">
                                                    <VideoUploader
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        disabled={isLoading}
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-2">Upload a video to autoplay as the background. When a background effect is active, the video plays underneath the effect. YouTube URLs are shown in the default layout only.</p>
                                                </div>
                                                {field.value && (
                                                    <div className="md:col-span-3 mt-2">
                                                        <DraggableVideoCropper
                                                            videoUrl={field.value}
                                                            value={videoPosition}
                                                            onChange={(val) => setVideoPosition(val)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* 2. Content */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileCode className="h-5 w-5" />
                                Rich Content
                            </CardTitle>
                            <CardDescription>
                                Provide custom HTML content for the About section.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="description_html"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>HTML Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="<p>Detailed event info...</p>"
                                                className="font-mono text-sm min-h-[200px]"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Overrides the standard text description. Supports basic HTML tags.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* 2.5 Rich Sections — lineup / schedule / FAQ / sponsors */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ListMusic className="h-5 w-5" />
                                Lineup, Schedule, FAQ & Sponsors
                            </CardTitle>
                            <CardDescription>
                                Give your page real substance. Sections only appear on the public page once they have content.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            {/* Shared hidden uploader for photos/logos */}
                            <input
                                ref={sectionImageInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    e.target.value = ''
                                    if (!file || !sectionImageCbRef.current) return
                                    setSectionImageUploading(true)
                                    const fd = new FormData()
                                    fd.append('file', file)
                                    const result = await uploadEventBgImage(eventId, fd)
                                    setSectionImageUploading(false)
                                    if (result.error) {
                                        toast({ title: 'Upload failed', description: result.error, variant: 'destructive' })
                                    } else if (result.url) {
                                        sectionImageCbRef.current(result.url)
                                    }
                                    sectionImageCbRef.current = null
                                }}
                            />

                            {/* Lineup */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Lineup — artists, DJs, speakers</Label>
                                {lineup.map((artist, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={sectionImageUploading}
                                            onClick={() => pickSectionImage((url) => setLineup(l => l.map((a, j) => j === i ? { ...a, photo_url: url } : a)))}
                                            className="w-10 h-10 rounded-lg border-2 border-dashed border-border hover:border-primary/50 shrink-0 overflow-hidden flex items-center justify-center text-muted-foreground"
                                            title="Upload photo"
                                        >
                                            {artist.photo_url
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={artist.photo_url} alt="" className="w-full h-full object-cover" />
                                                : <Upload className="h-4 w-4" />}
                                        </button>
                                        <Input placeholder="Name" value={artist.name} onChange={e => setLineup(l => l.map((a, j) => j === i ? { ...a, name: e.target.value } : a))} />
                                        <Input placeholder="Role (DJ, Host…)" value={artist.role || ''} onChange={e => setLineup(l => l.map((a, j) => j === i ? { ...a, role: e.target.value } : a))} />
                                        <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => setLineup(l => l.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => setLineup(l => [...l, { name: '' }])}>
                                    <Plus className="h-4 w-4 mr-1" /> Add artist
                                </Button>
                            </div>

                            {/* Schedule */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Schedule / rundown</Label>
                                {schedule.map((item, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <Input placeholder="7:00 PM" className="w-28 shrink-0" value={item.time} onChange={e => setSchedule(s => s.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
                                        <Input placeholder="Doors open" value={item.title} onChange={e => setSchedule(s => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                                        <Input placeholder="Details (optional)" value={item.description || ''} onChange={e => setSchedule(s => s.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                                        <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => setSchedule(s => s.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => setSchedule(s => [...s, { time: '', title: '' }])}>
                                    <Plus className="h-4 w-4 mr-1" /> Add slot
                                </Button>
                            </div>

                            {/* FAQ */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">FAQ</Label>
                                {faq.map((item, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <div className="flex-1 space-y-2">
                                            <Input placeholder="Question — e.g. What's the dress code?" value={item.q} onChange={e => setFaq(f => f.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} />
                                            <Textarea placeholder="Answer" className="min-h-[60px]" value={item.a} onChange={e => setFaq(f => f.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} />
                                        </div>
                                        <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2 mt-1" onClick={() => setFaq(f => f.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => setFaq(f => [...f, { q: '', a: '' }])}>
                                    <Plus className="h-4 w-4 mr-1" /> Add question
                                </Button>
                            </div>

                            {/* Sponsors */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Sponsors & partners</Label>
                                {sponsors.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={sectionImageUploading}
                                            onClick={() => pickSectionImage((url) => setSponsors(list => list.map((x, j) => j === i ? { ...x, logo_url: url } : x)))}
                                            className="w-10 h-10 rounded-lg border-2 border-dashed border-border hover:border-primary/50 shrink-0 overflow-hidden flex items-center justify-center text-muted-foreground"
                                            title="Upload logo"
                                        >
                                            {s.logo_url
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={s.logo_url} alt="" className="w-full h-full object-contain" />
                                                : <Upload className="h-4 w-4" />}
                                        </button>
                                        <Input placeholder="Sponsor name" value={s.name} onChange={e => setSponsors(list => list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                                        <Input placeholder="Website (optional)" value={s.url || ''} onChange={e => setSponsors(list => list.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                                        <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => setSponsors(list => list.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => setSponsors(s => [...s, { name: '' }])}>
                                    <Plus className="h-4 w-4 mr-1" /> Add sponsor
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 3. Layout Arrangement */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <LayoutDashboard className="h-5 w-5" />
                                Page Arrangement
                            </CardTitle>
                            <CardDescription>
                                Reorder sections or hide them from the public page.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 border rounded-md divide-y">
                                {layoutOrder.map((sectionId, index) => (
                                    <div key={sectionId} className="flex items-center justify-between p-3 bg-card hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => moveSection(index, 'up')}
                                                    disabled={index === 0}
                                                >
                                                    <ArrowUp className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => moveSection(index, 'down')}
                                                    disabled={index === layoutOrder.length - 1}
                                                >
                                                    <ArrowDown className="h-3 w-3" />
                                                </Button>
                                            </div>
                                            <div className="font-medium">
                                                {SECTION_LABELS[sectionId] || sectionId}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs ${hiddenSections.has(sectionId) ? "text-muted-foreground" : "text-green-600 font-medium"}`}>
                                                {hiddenSections.has(sectionId) ? "Hidden" : "Visible"}
                                            </span>
                                            <Switch
                                                checked={!hiddenSections.has(sectionId)}
                                                onCheckedChange={() => toggleVisibility(sectionId)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setLayoutOrder(DEFAULT_LAYOUT)
                                        setHiddenSections(new Set())
                                    }}
                                >
                                    Reset to Default
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 4. Visual Style */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5" />
                                Visual Style
                            </CardTitle>
                            <CardDescription>
                                Background, layout, fonts, and engagement features.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">

                            {/* Background Style */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Background Style</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {[
                                        { value: 'default',       label: 'Default',        emoji: '⬜', desc: 'Clean & minimal' },
                                        { value: 'cover-blur',    label: 'Cover Glow',     emoji: '🌆', desc: 'Blurred echo of your poster' },
                                        { value: 'particles',     label: 'Particles',      emoji: '✦',  desc: 'Floating dots' },
                                        { value: 'gradient-mesh', label: 'Gradient Mesh',  emoji: '🌈', desc: 'Animated blobs' },
                                        { value: 'noise',         label: 'Film Grain',     emoji: '📷', desc: 'Textured overlay' },
                                        { value: 'parallax',      label: 'Parallax',       emoji: '🏔️', desc: 'Depth on scroll' },
                                        { value: 'custom-image',  label: 'Custom Image',   emoji: '🖼️', desc: 'Your own photo' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setBgStyle(opt.value)}
                                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                                                bgStyle === opt.value
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                            }`}
                                        >
                                            <div className="text-2xl mb-1">{opt.emoji}</div>
                                            <div className="font-semibold text-sm">{opt.label}</div>
                                            <div className="text-xs text-muted-foreground">{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>

                                {/* Custom image uploader — only shown when custom-image selected */}
                                {bgStyle === 'custom-image' && (
                                    <div className="mt-3 pl-4 border-l-2 border-primary/30 space-y-2">
                                        <Label className="text-xs text-muted-foreground block">Background Image</Label>
                                        {bgImageUrl ? (
                                            <div className="relative rounded-xl overflow-hidden aspect-video max-w-sm">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={bgImageUrl} alt="Background" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => setBgImageUrl('')}
                                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => bgImageInputRef.current?.click()}
                                                disabled={bgImageUploading}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-all"
                                            >
                                                {bgImageUploading
                                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                                                    : <><Upload className="h-4 w-4" /> Upload image (JPG, PNG, WebP)</>
                                                }
                                            </button>
                                        )}
                                        <input
                                            ref={bgImageInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                setBgImageUploading(true)
                                                const fd = new FormData()
                                                fd.append('file', file)
                                                const result = await uploadEventBgImage(eventId, fd)
                                                setBgImageUploading(false)
                                                if (result.error) {
                                                    toast({ title: 'Upload failed', description: result.error, variant: 'destructive' })
                                                } else if (result.url) {
                                                    setBgImageUrl(result.url)
                                                }
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">Recommended: 1920×1080px or wider. Will be darkened automatically.</p>
                                    </div>
                                )}
                            </div>

                            {/* Page Layout */}
                            <div className="space-y-3">
                                <Label className="text-sm font-semibold">Page Layout</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { value: 'default', label: 'Default', emoji: '📄', desc: 'Two-column with sticky sidebar' },
                                        { value: 'poster',  label: 'Poster',  emoji: '🎭', desc: 'Full-screen immersive hero' },
                                        { value: 'minimal', label: 'Minimal', emoji: '🔲', desc: 'Single column, no clutter' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setPageLayout(opt.value)}
                                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                                                pageLayout === opt.value
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                            }`}
                                        >
                                            <div className="text-2xl mb-1">{opt.emoji}</div>
                                            <div className="font-semibold text-sm">{opt.label}</div>
                                            <div className="text-xs text-muted-foreground">{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Fonts */}
                            <div className="space-y-4">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <Type className="h-4 w-4" /> Typography
                                </Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Heading Font</Label>
                                        <Select value={fontHeading} onValueChange={setFontHeading}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FONT_OPTIONS.map(f => (
                                                    <SelectItem key={f.value} value={f.value}>
                                                        <span className="font-medium">{f.label}</span>
                                                        <span className="text-muted-foreground text-xs ml-2">— {f.preview}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Body Font</Label>
                                        <Select value={fontBody} onValueChange={setFontBody}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FONT_OPTIONS.map(f => (
                                                    <SelectItem key={f.value} value={f.value}>
                                                        <span className="font-medium">{f.label}</span>
                                                        <span className="text-muted-foreground text-xs ml-2">— {f.preview}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Heading Color</Label>
                                        <div className="flex items-center gap-2">
                                            <Input type="color" className="w-12 h-9 p-1 cursor-pointer" value={headingColor || '#ffffff'} onChange={e => setHeadingColor(e.target.value)} />
                                            <Input className="font-mono text-sm" placeholder="auto" value={headingColor} onChange={e => setHeadingColor(e.target.value)} />
                                            {headingColor && <button type="button" onClick={() => setHeadingColor('')} className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">Reset</button>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Leave blank to auto-adapt (white on dark bg)</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Body Text Color</Label>
                                        <div className="flex items-center gap-2">
                                            <Input type="color" className="w-12 h-9 p-1 cursor-pointer" value={textColor || '#e2e8f0'} onChange={e => setTextColor(e.target.value)} />
                                            <Input className="font-mono text-sm" placeholder="auto" value={textColor} onChange={e => setTextColor(e.target.value)} />
                                            {textColor && <button type="button" onClick={() => setTextColor('')} className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">Reset</button>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Leave blank to auto-adapt</p>
                                    </div>
                                </div>
                            </div>

                            {/* Countdown Timer */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-semibold flex items-center gap-2">
                                            <Timer className="h-4 w-4" /> Countdown Timer
                                        </Label>
                                        <p className="text-xs text-muted-foreground mt-0.5">Show a live countdown on the event page.</p>
                                    </div>
                                    <Switch checked={showCountdown} onCheckedChange={setShowCountdown} />
                                </div>
                                {showCountdown && (
                                    <div className="pl-6 border-l-2 border-primary/30">
                                        <Label className="text-xs text-muted-foreground mb-1 block">Countdown Label</Label>
                                        <Input
                                            value={countdownLabel}
                                            onChange={e => setCountdownLabel(e.target.value)}
                                            placeholder="Event starts in"
                                            className="max-w-xs"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Social Proof */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-sm font-semibold">Social Proof Ticker</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">Show &quot;[Name] just registered&quot; to build excitement.</p>
                                </div>
                                <Switch checked={showSocialProof} onCheckedChange={setShowSocialProof} />
                            </div>

                        </CardContent>
                    </Card>

                    <Button type="submit" disabled={isLoading} className="w-full md:w-auto" size="lg">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Customizations
                    </Button>
                </form>
            </Form>
        </div>
    )
}
