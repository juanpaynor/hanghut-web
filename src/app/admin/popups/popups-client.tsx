'use client'

import { useState } from 'react'
import { AdminPopup, togglePopupActive, deleteAdminPopup } from '@/lib/admin/popup-actions'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit, CheckCircle2, XCircle, ExternalLink, Image as ImageIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { PopupDialog } from './popup-dialog'

export function PopupsClient({ initialPopups }: { initialPopups: AdminPopup[] }) {
    const [popups, setPopups] = useState<AdminPopup[]>(initialPopups)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPopup, setEditingPopup] = useState<AdminPopup | null>(null)
    const [isToggling, setIsToggling] = useState<string | null>(null)
    const { toast } = useToast()

    const handleToggleActive = async (popup: AdminPopup, checked: boolean) => {
        setIsToggling(popup.id)

        // Optimistic UI update
        const previousPopups = [...popups]
        setPopups(prev => prev.map(p => {
            if (p.id === popup.id) return { ...p, is_active: checked }
            if (checked && p.id !== popup.id) return { ...p, is_active: false } // Deactivate others if checked
            return p
        }))

        const result = await togglePopupActive(popup.id, checked)

        if (!result.success) {
            // Revert on failure
            setPopups(previousPopups)
            toast({
                title: 'Error toggling popup',
                description: result.error,
                variant: 'destructive'
            })
        } else if (checked) {
            toast({
                title: 'Popup Activated',
                description: 'This popup will now be shown on the mobile app.',
            })
        }

        setIsToggling(null)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this popup?')) return

        const previousPopups = [...popups]
        setPopups(prev => prev.filter(p => p.id !== id))

        const result = await deleteAdminPopup(id)

        if (!result.success) {
            setPopups(previousPopups)
            toast({
                title: 'Error deleting popup',
                description: result.error,
                variant: 'destructive'
            })
        } else {
            toast({
                title: 'Popup deleted',
            })
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

    // Refresh list callback from dialog
    const handleSaved = (savedPopup: AdminPopup, isNew: boolean) => {
        setPopups(prev => {
            let updated = isNew ? [savedPopup, ...prev] : prev.map(p => p.id === savedPopup.id ? savedPopup : p)

            // If the saved popup is active, enforce only one active in the UI
            if (savedPopup.is_active) {
                updated = updated.map(p => p.id === savedPopup.id ? p : { ...p, is_active: false })
            }

            return updated
        })
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end mb-4">
                <Button onClick={openCreateDialog} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create New Popup
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-16">Active</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Preview</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Content</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">CTA</th>
                            <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Cooldown</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Created</th>
                            <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {popups.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center text-slate-400">
                                    <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No popups created</p>
                                    <p className="text-sm">Create an announcement to show on the mobile app.</p>
                                </td>
                            </tr>
                        ) : (
                            popups.map((popup) => (
                                <tr key={popup.id} className={`transition-colors ${popup.is_active ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                                    <td className="py-3 px-4">
                                        <Switch
                                            checked={popup.is_active}
                                            onCheckedChange={(c) => handleToggleActive(popup, c)}
                                            disabled={isToggling === popup.id}
                                        />
                                    </td>
                                    <td className="py-3 px-4">
                                        {popup.image_url ? (
                                            <div className="h-12 w-20 rounded border bg-slate-100 overflow-hidden relative group">
                                                <img src={popup.image_url} alt="Preview" className="object-cover w-full h-full" />
                                            </div>
                                        ) : (
                                            <div className="h-12 w-20 rounded border bg-slate-50 flex items-center justify-center text-slate-300">
                                                <ImageIcon className="h-4 w-4" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="font-bold text-slate-900 line-clamp-1">{popup.title}</div>
                                        <div className="text-xs text-slate-500 line-clamp-1 mt-0.5 max-w-[250px]">{popup.body}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="text-sm font-medium">{popup.action_text}</div>
                                        {popup.action_url && (
                                            <a href={popup.action_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-0.5 w-fit">
                                                <ExternalLink className="h-3 w-3" />
                                                <span className="line-clamp-1 max-w-[150px]">{popup.action_url}</span>
                                            </a>
                                        )}
                                    </td>
                                    <td className="py-3 px-4">
                                        {popup.cooldown_days === 0 || popup.cooldown_days === null ? (
                                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                                                Show Once
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                                                Hide {popup.cooldown_days} Days
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right text-sm text-slate-500">
                                        {format(new Date(popup.created_at), 'MMM d, yyyy')}
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
                            ))
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
