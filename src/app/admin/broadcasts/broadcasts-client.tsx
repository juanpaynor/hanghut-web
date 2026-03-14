'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, Send, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Image as ImageIcon, Repeat } from 'lucide-react'
import { createBroadcast, getBroadcastStatus } from '@/lib/admin/broadcast-actions'
import type { PushBroadcast } from '@/lib/admin/broadcast-actions'

interface BroadcastsClientProps {
    initialBroadcasts: PushBroadcast[]
    initialTotal: number
}

const SEGMENTS = [
    { value: 'all', label: 'All Users' },
    { value: 'active_7d', label: 'Active in 7 Days' },
    { value: 'active_30d', label: 'Active in 30 Days' },
]

function getStatusBadge(status: string) {
    switch (status) {
        case 'pending':
            return <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
        case 'processing':
            return <Badge className="bg-blue-50 text-blue-700 border-blue-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing</Badge>
        case 'completed':
            return <Badge className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>
        case 'failed':
            return <Badge className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
        default:
            return <Badge variant="outline">{status}</Badge>
    }
}

export function BroadcastsClient({ initialBroadcasts, initialTotal }: BroadcastsClientProps) {
    const [broadcasts, setBroadcasts] = useState<PushBroadcast[]>(initialBroadcasts)
    const [sending, setSending] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [pollingId, setPollingId] = useState<string | null>(null)

    // Form state
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [segment, setSegment] = useState('all')

    // Poll for status updates
    const pollStatus = useCallback(async (id: string) => {
        const status = await getBroadcastStatus(id)
        if (!status) return

        setBroadcasts(prev => prev.map(b => b.id === id ? status : b))

        if (status.status === 'completed' || status.status === 'failed') {
            setPollingId(null)
        }
    }, [])

    useEffect(() => {
        if (!pollingId) return

        const interval = setInterval(() => {
            pollStatus(pollingId)
        }, 2000)

        return () => clearInterval(interval)
    }, [pollingId, pollStatus])

    const handleSend = async () => {
        if (!title.trim() || !body.trim()) return

        setSending(true)
        const result = await createBroadcast({
            title: title.trim(),
            body: body.trim(),
            image_url: imageUrl.trim() || undefined,
            target_segment: segment,
        })

        if (result.success && result.id) {
            // Add to list optimistically
            const newBroadcast: PushBroadcast = {
                id: result.id,
                title: title.trim(),
                body: body.trim(),
                image_url: imageUrl.trim() || null,
                data_payload: null,
                target_segment: segment,
                status: 'pending',
                total_recipients: null,
                sent_count: null,
                failed_count: null,
                error_message: null,
                created_by: null,
                created_at: new Date().toISOString(),
                completed_at: null,
            }
            setBroadcasts(prev => [newBroadcast, ...prev])
            setPollingId(result.id)

            // Reset form
            setTitle('')
            setBody('')
            setImageUrl('')
            setSegment('all')
            setShowForm(false)
        } else {
            alert('Failed to send: ' + result.error)
        }
        setSending(false)
    }

    const handleRepeat = (broadcast: PushBroadcast) => {
        setTitle(broadcast.title)
        setBody(broadcast.body)
        setImageUrl(broadcast.image_url || '')
        setSegment(broadcast.target_segment)
        setShowForm(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <div className="space-y-6">
            {/* Actions */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    {initialTotal} {initialTotal === 1 ? 'broadcast' : 'broadcasts'} sent
                </p>
                <Button onClick={() => setShowForm(!showForm)} className="gap-2">
                    <Bell className="h-4 w-4" />
                    New Broadcast
                </Button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-bold text-lg text-slate-900 mb-4">Create Push Notification</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Form Fields */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Title * <span className="text-slate-400 font-normal">({title.length}/65)</span>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value.slice(0, 65))}
                                    placeholder="🎉 New Feature!"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Body * <span className="text-slate-400 font-normal">({body.length}/240)</span>
                                </label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value.slice(0, 240))}
                                    rows={3}
                                    placeholder="Check out the new map filters!"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Image URL <span className="text-slate-400 font-normal">(optional)</span>
                                </label>
                                <input
                                    type="url"
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    placeholder="https://example.com/promo.jpg"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Target Segment
                                </label>
                                <select
                                    value={segment}
                                    onChange={(e) => setSegment(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 bg-white"
                                >
                                    {SEGMENTS.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="gap-2">
                                    {sending ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                                    ) : (
                                        <><Send className="h-4 w-4" /> Send Notification</>
                                    )}
                                </Button>
                                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                            </div>
                        </div>

                        {/* Live Preview */}
                        <div>
                            <p className="text-sm font-medium text-slate-700 mb-2">Preview</p>
                            <div className="bg-slate-100 rounded-2xl p-4 max-w-sm">
                                <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="h-5 w-5 bg-indigo-600 rounded-md flex items-center justify-center">
                                            <span className="text-white text-[10px] font-bold">H</span>
                                        </div>
                                        <span className="text-xs text-slate-500 font-medium">HangHut</span>
                                        <span className="text-xs text-slate-400 ml-auto">now</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-900 leading-snug">
                                        {title || 'Notification Title'}
                                    </p>
                                    <p className="text-sm text-slate-600 leading-snug">
                                        {body || 'Notification body text will appear here.'}
                                    </p>
                                    {imageUrl && (
                                        <div className="mt-2 rounded-lg overflow-hidden bg-slate-100 h-32 flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none'
                                            }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Broadcast History Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Notification</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Segment</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Delivered</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Sent</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {broadcasts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-slate-400">
                                    <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No broadcasts yet</p>
                                    <p className="text-sm">Send your first push notification above.</p>
                                </td>
                            </tr>
                        ) : (
                            broadcasts.map((broadcast) => (
                                <tr key={broadcast.id}>
                                    <td className="py-3 px-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                                                {broadcast.image_url && <ImageIcon className="h-3.5 w-3.5 text-slate-400" />}
                                                {broadcast.title}
                                            </p>
                                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{broadcast.body}</p>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">
                                            {SEGMENTS.find(s => s.value === broadcast.target_segment)?.label || broadcast.target_segment}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        {getStatusBadge(broadcast.status)}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-600 font-mono">
                                        {broadcast.sent_count ?? '—'} / {broadcast.total_recipients ?? '—'}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-slate-500">
                                        {new Date(broadcast.created_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        })}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                title="Repeat this broadcast"
                                                onClick={() => handleRepeat(broadcast)}
                                            >
                                                <Repeat className="h-4 w-4 text-slate-400" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => setExpandedId(expandedId === broadcast.id ? null : broadcast.id)}
                                            >
                                                {expandedId === broadcast.id ? (
                                                    <ChevronUp className="h-4 w-4 text-slate-400" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                                )}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Expanded Details */}
                {expandedId && (() => {
                    const b = broadcasts.find(b => b.id === expandedId)
                    if (!b) return null
                    return (
                        <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-2">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Total Recipients</p>
                                    <p className="font-bold text-slate-900">{b.total_recipients ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Sent</p>
                                    <p className="font-bold text-green-700">{b.sent_count ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Failed</p>
                                    <p className="font-bold text-red-700">{b.failed_count ?? '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Completed At</p>
                                    <p className="font-bold text-slate-900">
                                        {b.completed_at
                                            ? new Date(b.completed_at).toLocaleString('en-US', {
                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                            })
                                            : '—'}
                                    </p>
                                </div>
                            </div>
                            {b.error_message && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                    <p className="font-medium mb-1">Error</p>
                                    <p className="font-mono text-xs">{b.error_message}</p>
                                </div>
                            )}
                            {b.image_url && (
                                <div>
                                    <p className="text-xs text-slate-500 font-medium mb-1">Image</p>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={b.image_url} alt="Notification" className="h-20 rounded-lg object-cover" />
                                </div>
                            )}
                        </div>
                    )
                })()}
            </div>
        </div>
    )
}
