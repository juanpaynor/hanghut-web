'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveVenueTemplate } from '@/lib/seat-map/seat-map-actions'
import { useRouter } from 'next/navigation'
import type { CanvasData } from '@/components/seat-map/types'
import Link from 'next/link'

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
    }
}

export function TemplateBuilderClient({
    templateId,
    initialData,
}: TemplateBuilderClientProps) {
    const router = useRouter()
    const [saving, setSaving] = useState(false)
    const [name, setName] = useState(initialData?.name || '')
    const [venueName, setVenueName] = useState(initialData?.venue_name || '')
    const [venueAddress, setVenueAddress] = useState(initialData?.venue_address || '')
    const [tags, setTags] = useState(initialData?.tags?.join(', ') || '')

    const handleSave = useCallback(
        async (canvasData: CanvasData) => {
            if (!name.trim() || !venueName.trim()) {
                alert('Please fill in the template name and venue name.')
                return
            }

            setSaving(true)
            try {
                await saveVenueTemplate(templateId, {
                    name: name.trim(),
                    venue_name: venueName.trim(),
                    venue_address: venueAddress.trim() || undefined,
                    canvas_data: canvasData,
                    tags: tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                })
                router.push('/admin/venue-templates')
            } catch (err) {
                console.error('Save failed:', err)
                alert('Failed to save template. Check console for details.')
            } finally {
                setSaving(false)
            }
        },
        [name, venueName, venueAddress, tags, templateId, router]
    )

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header Bar */}
            <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <Link href="/admin/venue-templates">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back
                    </Button>
                </Link>

                <div className="h-6 w-px bg-slate-200" />

                <input
                    type="text"
                    placeholder="Template name (e.g. MOA Arena – Concert)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none"
                />

                <div className="h-6 w-px bg-slate-200" />

                <input
                    type="text"
                    placeholder="Venue name"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    className="w-48 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />

                <input
                    type="text"
                    placeholder="Address (optional)"
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    className="w-48 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />

                <input
                    type="text"
                    placeholder="Tags (comma separated)"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-40 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />

                <div className="h-6 w-px bg-slate-200" />

                {saving && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                    </div>
                )}
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
