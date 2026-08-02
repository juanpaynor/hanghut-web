'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
import { Loader2, ArrowUp, ArrowDown, LayoutDashboard, Palette, FileCode, Sparkles, Timer, Upload, Type, X, Plus, ListMusic, RefreshCw, Monitor, Smartphone } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoUploader } from "@/components/ui/video-uploader"
import { DraggableVideoCropper } from "@/components/ui/draggable-video-cropper"
import { EventDesignGallery } from "@/components/organizer/event-design-gallery"
import type { EventDesignTemplate } from "@/lib/event-design-templates"
import { MAXIMALIST_PRESET_CSS } from "@/lib/storefront-custom-css"
import { cn } from "@/lib/utils"

// Two-pane section nav — one calm screen at a time instead of a 7-card scroll.
const DESIGN_SECTIONS = [
    { id: 'templates', label: 'Templates', icon: Sparkles },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'content', label: 'Content', icon: ListMusic },
    { id: 'layout', label: 'Layout & order', icon: LayoutDashboard },
    { id: 'style', label: 'Visual style', icon: Type },
    { id: 'css', label: 'Custom CSS', icon: FileCode, adv: true },
] as const
type DesignSectionId = typeof DESIGN_SECTIONS[number]['id']

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
    pricing: "Pricing Table (all tiers)",
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
    const savedOrderRaw: string[] | undefined = initialData.layout_config?.order
    const initialOrder: string[] = (() => {
        const saved: string[] = (savedOrderRaw && savedOrderRaw.length > 0
            ? [...savedOrderRaw]
            : [...DEFAULT_LAYOUT]
        ).filter((s: string) => s in SECTION_LABELS) // drop retired sections (e.g. 'location')
        const missing = DEFAULT_LAYOUT.filter(s => !saved.includes(s))
        if (missing.length) {
            const ti = saved.indexOf('tickets')
            saved.splice(ti === -1 ? saved.length : ti, 0, ...missing)
        }
        // 'pricing' is opt-in (not in DEFAULT_LAYOUT): always surface it in the
        // list so it can be toggled/positioned, placing it just before tickets.
        if (!saved.includes('pricing')) {
            const ti = saved.indexOf('tickets')
            saved.splice(ti === -1 ? saved.length : ti, 0, 'pricing')
        }
        return saved
    })()

    const initialHidden = new Set((initialData.layout_config?.hidden || []) as string[])
    // Pricing table defaults OFF until the organizer turns it on — so it never
    // appears (duplicating the buy box) on events that predate this feature.
    if (!savedOrderRaw || !savedOrderRaw.includes('pricing')) initialHidden.add('pricing')
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
    const [customCss, setCustomCss] = useState<string>(initialData.layout_config?.custom_css || '')
    const [designSection, setDesignSection] = useState<DesignSectionId>('templates')
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

    // ─── Live preview wiring ────────────────────────────────────────────
    // An iframe of the public event page (?hh_preview=1) that a bridge script
    // listens on. Two channels: (1) paint edits (accent/theme/custom CSS/colors)
    // are patched in live via postMessage — no reload; (2) structural edits
    // (layout/bg/fonts/toggles) can't be patched into server-rendered HTML, so
    // they ride the iframe URL as params and reload the frame (see below). Both
    // work WITHOUT a Save; Save just persists + reloads to pick up sections/order.
    const previewRef = useRef<HTMLIFrameElement>(null)
    const [previewNonce, setPreviewNonce] = useState(0)
    const watchedThemeColor = form.watch('theme_color')
    const previewPayloadRef = useRef<Record<string, unknown>>({})
    previewPayloadRef.current = {
        theme_color: watchedThemeColor || null,
        theme: pageThemeId,
        custom_css: customCss,
        font_heading: fontHeading,
        font_body: fontBody,
        text_color: textColor,
        heading_color: headingColor,
    }
    const postPreview = useCallback(() => {
        previewRef.current?.contentWindow?.postMessage(
            { source: 'hh-preview', type: 'apply', payload: previewPayloadRef.current },
            '*'
        )
    }, [])
    // Push on any design change (debounced so typing CSS stays smooth).
    useEffect(() => {
        const t = setTimeout(postPreview, 140)
        return () => clearTimeout(t)
    }, [watchedThemeColor, pageThemeId, customCss, fontHeading, fontBody, textColor, headingColor, postPreview])
    // Push the current state the moment the iframe says it's ready.
    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            if (e.data?.source === 'hh-preview' && e.data.type === 'ready') postPreview()
        }
        window.addEventListener('message', onMsg)
        return () => window.removeEventListener('message', onMsg)
    }, [postPreview])

    // ── Structural edits preview WITHOUT a Save ──────────────────────────────
    // Layout / background / fonts / engagement toggles are server-rendered, so
    // they can't be patched into the loaded iframe like CSS. Instead we pass the
    // unsaved picks to the preview page as URL params (it reads them in preview
    // mode) and reload the frame. The paint edits (accent/theme/custom CSS) get
    // re-applied automatically right after, via the 'ready' handshake above.
    // NOTE: theme / accent / custom CSS are deliberately NOT here — they're the
    // live-patched set (re-applied via the 'ready' handshake), and putting them in
    // the src would force a reload on every colour tweak. Only reload-only props.
    const structuralPreviewQuery = useMemo(() => {
        const p = new URLSearchParams()
        p.set('hh_layout', pageLayout)
        p.set('hh_bg', bgStyle)
        p.set('hh_fh', fontHeading)
        p.set('hh_fb', fontBody)
        p.set('hh_cd', showCountdown ? '1' : '0')
        p.set('hh_sp', showSocialProof ? '1' : '0')
        p.set('hh_bgimg', bgImageUrl || '')
        return p.toString()
    }, [pageLayout, bgStyle, fontHeading, fontBody, showCountdown, showSocialProof, bgImageUrl])
    // Reload the frame when a structural pick changes (debounced; skip first run
    // so we don't double-load on mount).
    const structuralFirstRun = useRef(true)
    useEffect(() => {
        if (structuralFirstRun.current) { structuralFirstRun.current = false; return }
        const t = setTimeout(() => setPreviewNonce(n => n + 1), 350)
        return () => clearTimeout(t)
    }, [structuralPreviewQuery])

    // Preview device: "desktop" renders the page at a real 1280px viewport and
    // scales it down to fit the narrow pane (so you see the desktop layout, not
    // the mobile one); "mobile" lets the page fill the pane at phone width.
    const previewWrapRef = useRef<HTMLDivElement>(null)
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
    const [previewWrap, setPreviewWrap] = useState({ w: 400, h: 720 })
    useEffect(() => {
        const el = previewWrapRef.current
        if (!el) return
        const measure = () => setPreviewWrap({ w: el.clientWidth, h: el.clientHeight })
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    const previewIsDesktop = previewDevice === 'desktop'
    const previewBaseW = 1280
    const previewScale = previewIsDesktop ? Math.max(0.15, previewWrap.w / previewBaseW) : 1

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
                    // Preserve keys this form doesn't own (e.g. tiers display config
                    // set in the Ticket Tiers editor) — updateEventStorefront replaces
                    // layout_config wholesale, so spread the existing config first.
                    ...(initialData.layout_config || {}),
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
                    custom_css: customCss || null,
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
                // Reload the preview so structural/bg/font edits show too.
                setPreviewNonce(Date.now())
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
        <div className="max-w-[1700px] mx-auto pb-20">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Storefront Customization</h1>
                <p className="text-muted-foreground">Customize how your event page looks and feels.</p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="flex flex-col xl:flex-row gap-6 items-stretch xl:items-start">
                        {/* Left section nav */}
                        <nav className="xl:sticky xl:top-4 shrink-0 xl:w-52 flex xl:flex-col gap-1 overflow-x-auto rounded-xl border bg-card p-2">
                            {DESIGN_SECTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setDesignSection(s.id)}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left whitespace-nowrap transition-colors",
                                        designSection === s.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                                    )}
                                >
                                    <s.icon className="h-4 w-4 shrink-0" />
                                    {s.label}
                                    {'adv' in s && s.adv && (
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground border rounded-full px-1.5 py-0.5">Adv</span>
                                    )}
                                </button>
                            ))}
                        </nav>

                        {/* Active section */}
                        <div className="flex-1 min-w-0 space-y-8">

                    {/* 0. Design Templates */}
                    <Card className={cn(designSection !== 'templates' && 'hidden')}>
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
                    <Card className={cn(designSection !== 'theme' && 'hidden')}>
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
                    <Card className={cn(designSection !== 'content' && 'hidden')}>
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
                    <Card className={cn(designSection !== 'content' && 'hidden')}>
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
                    <Card className={cn(designSection !== 'layout' && 'hidden')}>
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
                    <Card className={cn(designSection !== 'style' && 'hidden')}>
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
                                        { value: 'default',   label: 'Default',   emoji: '📄', desc: 'Classic cards, works for anything' },
                                        { value: 'broadside', label: 'Broadside', emoji: '🅱️', desc: 'Brutalist gig poster — no cards, giant type' },
                                        { value: 'editorial', label: 'Editorial', emoji: '📰', desc: 'Magazine spread — poster beside the story' },
                                        { value: 'cinematic', label: 'Cinematic', emoji: '🎬', desc: 'Full-bleed poster, content floats in glass' },
                                        { value: 'boutique',  label: 'Boutique',  emoji: '✉️', desc: 'Centered invitation, all whitespace' },
                                        { value: 'poster',    label: 'Poster',    emoji: '🎭', desc: 'Full-screen centered hero' },
                                        { value: 'minimal',   label: 'Minimal',   emoji: '🔲', desc: 'Single column, no clutter' },
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

                    {/* Custom CSS — full art-direction escape hatch (HelixPay-style skin) */}
                    <Card className={cn(designSection !== 'css' && 'hidden')}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileCode className="h-5 w-5" />
                                Custom CSS
                                <span className="text-xs font-normal text-muted-foreground border rounded-full px-2 py-0.5">Advanced</span>
                            </CardTitle>
                            <CardDescription>
                                Total control over your page&apos;s look. Scope rules under <code className="text-xs bg-muted px-1 py-0.5 rounded">[data-hh-theme]</code> so they only skin
                                this storefront. Leave empty to keep the theme above.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCustomCss(MAXIMALIST_PRESET_CSS)}
                                >
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Load Maximalist preset
                                </Button>
                                {customCss && (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setCustomCss('')}>
                                        <X className="mr-2 h-4 w-4" />
                                        Clear
                                    </Button>
                                )}
                            </div>
                            <Textarea
                                value={customCss}
                                onChange={(e) => setCustomCss(e.target.value)}
                                placeholder={"[data-hh-theme] h1 {\n  color: #ff5e8a;\n}"}
                                spellCheck={false}
                                className="font-mono text-xs min-h-[220px] leading-relaxed"
                            />
                            <p className="text-xs text-muted-foreground">
                                CSS only — scripts and <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;style&gt;</code> tags are stripped for safety. Save, then open your live event page to see it.
                            </p>
                        </CardContent>
                    </Card>

                            <Button type="submit" disabled={isLoading} className="w-full md:w-auto" size="lg">
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Customizations
                            </Button>
                        </div>

                        {/* Live preview (xl and up) */}
                        <aside className="hidden xl:flex shrink-0 w-[380px] 2xl:w-[440px] flex-col gap-2 sticky top-4 h-[calc(100vh-7rem)]">
                            <div className="flex items-center justify-between gap-2 px-1">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Live preview
                                </span>
                                <div className="flex items-center gap-1">
                                    {/* Desktop / Mobile toggle */}
                                    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewDevice('desktop')}
                                            aria-pressed={previewIsDesktop}
                                            title="Desktop"
                                            className={cn("rounded-md p-1.5", previewIsDesktop ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                                        >
                                            <Monitor className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewDevice('mobile')}
                                            aria-pressed={!previewIsDesktop}
                                            title="Mobile"
                                            className={cn("rounded-md p-1.5", !previewIsDesktop ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
                                        >
                                            <Smartphone className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewNonce(Date.now())}
                                        title="Refresh preview"
                                        className="text-muted-foreground hover:text-foreground inline-flex items-center rounded-md p-1.5"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div ref={previewWrapRef} className="relative flex-1 overflow-hidden rounded-xl border bg-black">
                                <iframe
                                    ref={previewRef}
                                    key={previewNonce}
                                    src={`/events/${eventId}?hh_preview=1&${structuralPreviewQuery}&n=${previewNonce}`}
                                    title="Live preview of your event page"
                                    className="border-0 bg-black"
                                    style={
                                        previewIsDesktop
                                            ? {
                                                width: previewBaseW,
                                                height: Math.max(320, previewWrap.h / previewScale),
                                                transform: `scale(${previewScale})`,
                                                transformOrigin: 'top left',
                                            }
                                            : { width: '100%', height: '100%' }
                                    }
                                />
                            </div>
                            <p className="text-[11px] leading-relaxed text-muted-foreground px-1">
                                Colors, fonts, theme &amp; custom CSS update as you edit. Sections, background &amp; layout apply after you <b>Save</b>.
                            </p>
                        </aside>
                    </div>
                </form>
            </Form>
        </div>
    )
}
