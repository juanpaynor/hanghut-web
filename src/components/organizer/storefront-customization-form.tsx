'use client'

import { useState } from 'react'
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
import { updateEventStorefront } from "@/lib/organizer/event-actions"
import { useToast } from "@/hooks/use-toast"
import { Loader2, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown, LayoutDashboard, Video, Palette, FileCode } from "lucide-react"
import { VideoUploader } from "@/components/ui/video-uploader"

const formSchema = z.object({
    video_url: z.string().url("Must be a valid URL").optional().or(z.literal('')),
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

    const [layoutOrder, setLayoutOrder] = useState<string[]>(initialOrder)
    const [hiddenSections, setHiddenSections] = useState<Set<string>>(initialHidden)

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
                    hidden: Array.from(hiddenSections)
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
                                            <VideoUploader
                                                value={field.value}
                                                onChange={field.onChange}
                                                disabled={isLoading}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Upload a video to play in the hero section (Autoplays muted).
                                        </FormDescription>
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

                    <Button type="submit" disabled={isLoading} className="w-full md:w-auto" size="lg">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Customizations
                    </Button>
                </form>
            </Form>
        </div>
    )
}
