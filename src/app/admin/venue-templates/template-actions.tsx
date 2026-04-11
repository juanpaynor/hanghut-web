'use client'

import { useState } from 'react'
import { Eye, EyeOff, Trash2, MoreVertical } from 'lucide-react'
import { toggleTemplatePublished, deleteVenueTemplate } from '@/lib/seat-map/seat-map-actions'
import { useRouter } from 'next/navigation'

interface TemplateActionsProps {
    templateId: string
    isPublished: boolean
}

export function TemplateActions({ templateId, isPublished }: TemplateActionsProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleTogglePublish = async () => {
        setLoading(true)
        try {
            await toggleTemplatePublished(templateId, !isPublished)
            router.refresh()
        } catch (err) {
            console.error('Failed to toggle publish:', err)
        } finally {
            setLoading(false)
            setOpen(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this template?')) return
        setLoading(true)
        try {
            await deleteVenueTemplate(templateId)
            router.refresh()
        } catch (err) {
            console.error('Failed to delete:', err)
        } finally {
            setLoading(false)
            setOpen(false)
        }
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
                disabled={loading}
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                        <button
                            onClick={handleTogglePublish}
                            disabled={loading}
                            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 text-slate-700"
                        >
                            {isPublished ? (
                                <>
                                    <EyeOff className="w-4 h-4" />
                                    Unpublish
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4" />
                                    Publish
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-50 text-red-600"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
