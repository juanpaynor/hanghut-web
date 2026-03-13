'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, Trash2, Star, Smartphone, FileDown, Loader2 } from 'lucide-react'
import { uploadApkRelease, setLatestRelease, deleteApkRelease } from '@/lib/admin/apk-actions'
import type { ApkRelease } from '@/lib/admin/apk-actions'

interface ReleasesClientProps {
    initialReleases: ApkRelease[]
    initialTotal: number
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ReleasesClient({ initialReleases, initialTotal }: ReleasesClientProps) {
    const [releases, setReleases] = useState<ApkRelease[]>(initialReleases)
    const [uploading, setUploading] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const formRef = useRef<HTMLFormElement>(null)

    const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setUploading(true)

        const formData = new FormData(e.currentTarget)
        const result = await uploadApkRelease(formData)

        if (result.success) {
            // Refresh the page to get updated data
            window.location.reload()
        } else {
            alert('Upload failed: ' + result.error)
        }
        setUploading(false)
    }

    const handleSetLatest = async (id: string) => {
        setActionLoading(id)
        const result = await setLatestRelease(id)
        if (result.success) {
            setReleases(prev => prev.map(r => ({ ...r, is_latest: r.id === id })))
        } else {
            alert('Failed: ' + result.error)
        }
        setActionLoading(null)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this release?')) return
        setActionLoading(id)
        const result = await deleteApkRelease(id)
        if (result.success) {
            setReleases(prev => prev.filter(r => r.id !== id))
        } else {
            alert('Failed: ' + result.error)
        }
        setActionLoading(null)
    }

    return (
        <div className="space-y-6">
            {/* Actions Bar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    {initialTotal} {initialTotal === 1 ? 'release' : 'releases'} uploaded
                </p>
                <Button onClick={() => setShowForm(!showForm)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload New APK
                </Button>
            </div>

            {/* Upload Form */}
            {showForm && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <h3 className="font-bold text-lg text-slate-900">Upload New Release</h3>
                    <form ref={formRef} onSubmit={handleUpload} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Version Name *
                                </label>
                                <input
                                    name="version_name"
                                    type="text"
                                    required
                                    placeholder="e.g. 1.2.0"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Version Code *
                                </label>
                                <input
                                    name="version_code"
                                    type="number"
                                    required
                                    placeholder="e.g. 12"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Release Notes
                            </label>
                            <textarea
                                name="release_notes"
                                rows={3}
                                placeholder="What's new in this version..."
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                APK File *
                            </label>
                            <input
                                name="file"
                                type="file"
                                required
                                accept=".apk"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 text-slate-900"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={uploading} className="gap-2">
                                {uploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4" />
                                        Upload & Set as Latest
                                    </>
                                )}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Releases Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Version</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Size</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Release Notes</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Uploaded</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {releases.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-slate-400">
                                    <Smartphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No releases yet</p>
                                    <p className="text-sm">Upload your first APK above.</p>
                                </td>
                            </tr>
                        ) : (
                            releases.map((release) => (
                                <tr key={release.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <Smartphone className="h-4 w-4 text-slate-400" />
                                            <span className="text-sm font-bold text-slate-900">
                                                v{release.version_name}
                                            </span>
                                            <span className="text-xs text-slate-400 font-mono">
                                                ({release.version_code})
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-600">
                                        {formatBytes(release.file_size_bytes)}
                                    </td>
                                    <td className="py-3 px-4">
                                        {release.is_latest ? (
                                            <Badge className="bg-green-50 text-green-700 border-green-200">
                                                <Star className="h-3 w-3 mr-1" /> Latest
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-500">Archived</Badge>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate">
                                        {release.release_notes || '—'}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-500">
                                        {new Date(release.created_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric'
                                        })}
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <a href={release.file_url} download>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <FileDown className="h-4 w-4 text-slate-500" />
                                                </Button>
                                            </a>
                                            {!release.is_latest && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => handleSetLatest(release.id)}
                                                    disabled={actionLoading === release.id}
                                                >
                                                    <Star className="h-4 w-4 text-amber-500" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => handleDelete(release.id)}
                                                disabled={actionLoading === release.id}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
