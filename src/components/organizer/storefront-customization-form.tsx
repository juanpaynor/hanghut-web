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
import { Loader2, ArrowUp, ArrowDown, LayoutDashboard, Palette, FileCode, Sparkles, Timer, Upload, Type, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoUploader } from "@/components/ui/video-uploader"
import { DraggableVideoCropper } from "@/components/ui/draggable-video-cropper"

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
        layout_config?: any
    }
}

const SECTION_LABELS: Record<string, string> = {
    hero: "Hero Section (Image/Video)",
    title: "Event Title & Date",
    details: "Key Details (Location/Time)",
    about: "About Section",
    gallery: "Photo Gallery",
    organizer: "Organizer Info",
    tickets: "Ticket Selector",
    location: "Map & Directions"
}

const DEFAULT_LAYOUT = ["hero", "title", "details", "about", "gallery", "organizer", "tickets", "location"]

export function StorefrontCustomizationForm({ eventId, initialData }: StorefrontCustomizationFormProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    // Layout State
    // Ensure we have a valid array even if DB is null or empty
    const initialOrder = initialData.layout_config?.order && initialData.layout_config.order.length > 0
        ? initialData.layout_config.order
        : DEFAULT_LAYOUT

    const initialHidden = new Set((initialData.layout_config?.hidden || []) as string[])
    const initialVideoPosition = initialData.layout_config?.video_position || 'center 50%'

    const [layoutOrder, setLayoutOrder] = useState<string[]>(initialOrder)
    const [hiddenSections, setHiddenSections] = useState<Set<string>>(initialHidden)
    const [videoPosition, setVideoPosition] = useState<string>(initialVideoPosition)

    // Visual style state
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
                                        <div className="flex items-center gap-4">
                                            <Input
                                                type="color"
                                                className="w-16 h-10 p-1 cursor-pointer"
                                                {...field}
                                            />
                                            <Input
                                                placeholder="#000000"
                                                className="font-mono"
                                                {...field}
                                            />
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
