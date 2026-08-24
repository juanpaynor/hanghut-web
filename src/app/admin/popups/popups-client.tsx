'use client'

import { useState } from 'react'
import { AdminPopup, togglePopupActive, deleteAdminPopup } from '@/lib/admin/popup-actions'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit, ExternalLink, Image as ImageIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { PopupDialog } from './popup-dialog'

/** The app's queue order: priority desc, then newest first. */
function queueOrder(a: AdminPopup, b: AdminPopup) {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

/**
 * The Live switch stops being the whole truth once popups can be scheduled — a
 * popup can be switched on and still show nothing because its window hasn't
 * opened or has closed. Resolve the two together so the list says what a user
 * would actually see right now.
 */
type PopupState = { label: string; className: string; detail: string | null }

function resolveState(popup: AdminPopup): PopupState {
    const fmt = (iso: string) => format(new Date(iso), 'd MMM, HH:mm')

    if (!popup.is_active) {
        return { label: 'Off', className: 'bg-slate-100 text-slate-600', detail: null }
    }

    const now = Date.now()
    if (popup.starts_at && new Date(popup.starts_at).getTime() > now) {
        return { label: 'Scheduled', className: 'bg-amber-50 text-amber-700', detail: `from ${fmt(popup.starts_at)}` }
    }
    if (popup.ends_at && new Date(popup.ends_at).getTime() <= now) {
        return { label: 'Ended', className: 'bg-slate-100 text-slate-500', detail: `on ${fmt(popup.ends_at)}` }
    }
    return {
        label: 'Showing',
        className: 'bg-emerald-50 text-emerald-700',
        detail: popup.ends_at ? `until ${fmt(popup.ends_at)}` : null,
    }
}

export function PopupsClient({ initialPopups }: { initialPopups: AdminPopup[] }) {
    const [popups, setPopups] = useState<AdminPopup[]>([...initialPopups].sort(queueOrder))
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPopup, setEditingPopup] = useState<AdminPopup | null>(null)
    const [isToggling, setIsToggling] = useState<string | null>(null)
    const { toast } = useToast()

    const showingCount = popups.filter(p => resolveState(p).label === 'Showing').length

    const handleToggleActive = async (popup: AdminPopup, checked: boolean) => {
        setIsToggling(popup.id)

        // Only this row changes. Switching one on used to switch every other one
        // off, which the app's queue makes wrong — see popup-actions.ts.
        const previousPopups = popups
        setPopups(prev => prev.map(p => (p.id === popup.id ? { ...p, is_active: checked } : p)))

        const result = await togglePopupActive(popup.id, checked)

        if (!result.success) {
            setPopups(previousPopups)
            toast({ title: 'Error toggling popup', description: result.error, variant: 'destructive' })
        }

        setIsToggling(null)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this popup? This cannot be undone.')) return

        const previousPopups = popups
        setPopups(prev => prev.filter(p => p.id !== id))

        const result = await deleteAdminPopup(id)

        if (!result.success) {
            setPopups(previousPopups)
            toast({ title: 'Error deleting popup', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Popup deleted' })
        }
    }

    const openEditDialog = (popup: AdminPopup) => {
        setEditingPopup(popup)
        setIsDialogOpen(true)
    }

    const openCreateDialog = () => {
        setEditingPopup(null)
        setIsDialogOpen(true)
    }

    const handleSaved = (savedPopup: AdminPopup, isNew: boolean) => {
        setPopups(prev => {
            const next = isNew
                ? [savedPopup, ...prev]
                : prev.map(p => (p.id === savedPopup.id ? savedPopup : p))
            // Re-sort so the list keeps matching the order the app will play them in.
            return [...next].sort(queueOrder)
        })
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4 gap-4">
                <p className="text-sm text-slate-500">
                    {showingCount === 0
                        ? 'Nothing is showing in the app right now.'
                        : `${showingCount} popup${showingCount === 1 ? '' : 's'} showing, in this order. The app plays at most three per launch.`}
                </p>
                <Button onClick={openCreateDialog} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Create new popup
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full min-w-[62rem]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-16">Live</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Preview</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Content</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Priority</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Action</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Results</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {popups.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-16 text-center text-slate-400">
                                    <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No popups created</p>
                                    <p className="text-sm">Create an announcement to show on the mobile app.</p>
                                </td>
                            </tr>
                        ) : (
                            popups.map((popup) => {
                                const state = resolveState(popup)
                                const isPoster = popup.layout === 'image'
                                const taps = popup.tap_count ?? 0
                                const impressions = popup.impression_count ?? 0
                                const rate = impressions > 0 ? Math.round((taps / impressions) * 100) : null

                                return (
                                    <tr key={popup.id} className={`transition-colors ${state.label === 'Showing' ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                                        <td className="py-3 px-4">
                                            <Switch
                                                checked={popup.is_active}
                                                onCheckedChange={(c) => handleToggleActive(popup, c)}
                                                disabled={isToggling === popup.id}
                                            />
                                        </td>
                                        <td className="py-3 px-4">
                                            {popup.image_url ? (
                                                <div className="h-14 w-14 rounded border bg-slate-100 overflow-hidden flex items-center justify-center">
                                                    {/* contain, not cover — a portrait poster should read as portrait here too */}
                                                    <img src={popup.image_url} alt="" className="max-h-full max-w-full object-contain" />
                                                </div>
                                            ) : (
                                                <div className="h-14 w-14 rounded border bg-slate-50 flex items-center justify-center text-slate-400">
                                                    <ImageIcon className="h-4 w-4" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 line-clamp-1">{popup.title}</span>
                                                {isPoster && (
                                                    <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-900 text-white">
                                                        Poster
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 line-clamp-1 mt-0.5 max-w-[240px]">
                                                {isPoster ? 'Image only — internal name' : popup.body}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${state.className}`}>
                                                {state.label}
                                            </span>
                                            {state.detail && (
                                                <div className="text-[11px] text-slate-500 mt-1">{state.detail}</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-sm text-slate-700">
                                            {popup.priority ?? 0}
                                        </td>
                                        <td className="py-3 px-4">
                                            {popup.action_url ? (
                                                <>
                                                    {!isPoster && <div className="text-sm font-medium">{popup.action_text}</div>}
                                                    <a
                                                        href={popup.action_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-0.5 w-fit"
                                                    >
                                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                                        <span className="line-clamp-1 max-w-[160px]">{popup.action_url}</span>
                                                    </a>
                                                </>
                                            ) : (
                                                <span className="text-xs text-slate-400">Dismiss only</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums">
                                            <div className="text-sm text-slate-900">
                                                {taps.toLocaleString()} <span className="text-slate-400">/</span> {impressions.toLocaleString()}
                                            </div>
                                            <div className="text-[11px] text-slate-500">
                                                {rate === null ? 'taps / views' : `${rate}% tapped`}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-indigo-600" onClick={() => openEditDialog(popup)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => handleDelete(popup.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <PopupDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                popup={editingPopup}
                onSaved={handleSaved}
            />
        </div>
    )
}
