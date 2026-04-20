'use client'

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, ImagePlus, Globe, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveVenueTemplate } from '@/lib/seat-map/seat-map-actions'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { CanvasData } from '@/components/seat-map/types'
import Link from 'next/link'
import Image from 'next/image'

// Dynamic import to avoid SSR issues with Konva
const CanvasBuilder = dynamic(
    () => import('@/components/seat-map/canvas-builder').then((mod) => mod.CanvasBuilder),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-slate-950 rounded-xl">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Loading canvas...</p>
                </div>
            </div>
        ),
    }
)

interface TemplateBuilderClientProps {
    templateId: string | null
    initialData?: {
        name: string
        venue_name: string
        venue_address?: string
        canvas_data?: CanvasData
        tags?: string[]
        is_published?: boolean
        thumbnail_url?: string | null
    }
}

export function TemplateBuilderClient({
    templateId,
    initialData,
}: TemplateBuilderClientProps) {
    const router = useRouter()
    const thumbnailInputRef = useRef<HTMLInputElement>(null)
    // Track whether the pending save should publish or just draft
    const pendingPublish = useRef(false)

    const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)
    const [name, setName] = useState(initialData?.name || '')
    const [venueName, setVenueName] = useState(initialData?.venue_name || '')
    const [venueAddress, setVenueAddress] = useState(initialData?.venue_address || '')
    const [tags, setTags] = useState(initialData?.tags?.join(', ') || '')
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(initialData?.thumbnail_url ?? null)
    const [uploadingThumb, setUploadingThumb] = useState(false)
    // isPublished tracks current DB state for the badge
    const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false)

    const handleThumbnailSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingThumb(true)
        try {
            const supabase = createClient()
            const ext = file.name.split('.').pop() || 'jpg'
            const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error } = await supabase.storage
                .from('venue-thumbnails')
                .upload(path, file, { upsert: true })
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage
                .from('venue-thumbnails')
                .getPublicUrl(path)
            setThumbnailUrl(publicUrl)
        } catch (err) {
            console.error('Thumbnail upload failed:', err)
            alert('Failed to upload thumbnail.')
        } finally {
            setUploadingThumb(false)
            e.target.value = ''
        }
    }, [])

    // Called by canvas toolbar Save button (or triggered by header buttons)
    const handleSave = useCallback(
        async (canvasData: CanvasData) => {
            if (!name.trim() || !venueName.trim()) {
                alert('Please fill in the template name and venue name.')
                return
            }
            const publish = pendingPublish.current
            setSaving(publish ? 'publish' : 'draft')
            try {
                await saveVenueTemplate(templateId, {
                    name: name.trim(),
                    venue_name: venueName.trim(),
                    venue_address: venueAddress.trim() || undefined,
                    canvas_data: canvasData,
                    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                    is_published: publish,
                    thumbnail_url: thumbnailUrl,
                })
                setIsPublished(publish)
                router.push('/admin/venue-templates')
            } catch (err) {
                console.error('Save failed:', err)
                alert('Failed to save template. Check console for details.')
            } finally {
                setSaving(null)
                pendingPublish.current = false
            }
        },
        [name, venueName, venueAddress, tags, thumbnailUrl, templateId, router]
    )

    const triggerSave = (publish: boolean) => {
        pendingPublish.current = publish
        // Fire custom event that canvas-builder listens to
        document.dispatchEvent(new CustomEvent('canvas:requestSave'))
    }

    return (
        <div className="flex flex-col h-full gap-3">
            {/* Header Bar */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-wrap">
                <Link href="/admin/venue-templates">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back
                    </Button>
                </Link>

                <div className="h-6 w-px bg-slate-200 shrink-0" />

                {/* Thumbnail upload */}
                <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleThumbnailSelect}
                />
                {thumbnailUrl ? (
                    <div className="relative w-14 h-10 rounded-md border border-slate-200 overflow-hidden group shrink-0 cursor-pointer"
                         onClick={() => thumbnailInputRef.current?.click()}>
                        <Image src={thumbnailUrl} alt="Thumbnail" fill className="object-cover" />
                        <button
                            onClick={(e) => { e.stopPropagation(); setThumbnailUrl(null) }}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="w-2.5 h-2.5 text-white" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => thumbnailInputRef.current?.click()}
                        disabled={uploadingThumb}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded-md px-2.5 py-2 hover:border-slate-400 transition-all shrink-0"
                    >
                        {uploadingThumb
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ImagePlus className="w-3.5 h-3.5" />
                        }
                        {uploadingThumb ? 'Uploading…' : 'Thumbnail'}
                    </button>
                )}

                <div className="h-6 w-px bg-slate-200 shrink-0" />

                <input
                    type="text"
                    placeholder="Template name (e.g. MOA Arena – Concert)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 min-w-[140px] bg-transparent text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none"
                />

                <div className="h-6 w-px bg-slate-200 shrink-0" />

                <input
                    type="text"
                    placeholder="Venue name"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    className="w-36 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />
                <input
                    type="text"
                    placeholder="Address (optional)"
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    className="w-44 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />
                <input
                    type="text"
                    placeholder="Tags (comma-sep)"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-32 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />

                <div className="h-6 w-px bg-slate-200 shrink-0" />

                {/* Draft / Publish buttons */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => triggerSave(false)}
                        className="gap-1.5 text-slate-600 border-slate-300"
                    >
                        {saving === 'draft'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <FileText className="w-3.5 h-3.5" />
                        }
                        {saving === 'draft' ? 'Saving…' : 'Save Draft'}
                    </Button>
                    <Button
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => triggerSave(true)}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        {saving === 'publish'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Globe className="w-3.5 h-3.5" />
                        }
                        {saving === 'publish' ? 'Publishing…' : 'Publish'}
                    </Button>
                </div>
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-2 px-1 -mt-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {isPublished ? 'Published' : 'Draft'}
                </span>
            </div>

            {/* Canvas */}
            <div className="flex-1 min-h-0">
                <CanvasBuilder
                    initialData={initialData?.canvas_data}
                    onSave={handleSave}
                    mode="admin"
                />
            </div>
        </div>
    )
}
