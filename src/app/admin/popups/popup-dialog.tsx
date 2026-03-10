'use client'

import { useState, useEffect, useRef } from 'react'
import { AdminPopup, createAdminPopup, updateAdminPopup } from '@/lib/admin/popup-actions'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PopupDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    popup: AdminPopup | null
    onSaved: (popup: AdminPopup, isNew: boolean) => void
}

export function PopupDialog({ open, onOpenChange, popup, onSaved }: PopupDialogProps) {
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [actionUrl, setActionUrl] = useState('')
    const [actionText, setActionText] = useState('Learn More')
    const [cooldownDays, setCooldownDays] = useState('')
    const [isActive, setIsActive] = useState(false)
    const [loading, setLoading] = useState(false)

    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { toast } = useToast()
    const supabase = createClient()

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`

            // Upload directly to the new dedicated admin-popups bucket
            const { error: uploadError } = await supabase.storage
                .from('admin-popups')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const { data: urlData } = supabase.storage
                .from('admin-popups')
                .getPublicUrl(fileName)

            setImageUrl(urlData.publicUrl)
            toast({ title: 'Image Uploaded', description: 'Header image has been set successfully.' })
        } catch (error: any) {
            console.error('Error uploading image:', error)
            toast({
                title: 'Upload Failed',
                description: error.message || 'Could not upload image.',
                variant: 'destructive'
            })
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    useEffect(() => {
        if (popup) {
            setTitle(popup.title)
            setBody(popup.body)
            setImageUrl(popup.image_url || '')
            setActionUrl(popup.action_url || '')
            setActionText(popup.action_text || 'Learn More')
            setCooldownDays(popup.cooldown_days !== null ? popup.cooldown_days.toString() : '')
            setIsActive(popup.is_active)
        } else {
            setTitle('')
            setBody('')
            setImageUrl('')
            setActionUrl('')
            setActionText('Learn More')
            setCooldownDays('')
            setIsActive(false)
        }
    }, [popup, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        // Validation: If action URL is provided, action text is required
        if (actionUrl && !actionText.trim()) {
            toast({
                title: 'Validation Error',
                description: 'Action Text is required if an Action URL is provided.',
                variant: 'destructive'
            })
            setLoading(false)
            return
        }

        const data: Partial<AdminPopup> = {
            title,
            body,
            image_url: imageUrl || null,
            action_url: actionUrl || null,
            action_text: actionText || 'Learn More',
            cooldown_days: cooldownDays ? parseInt(cooldownDays, 10) : null,
            is_active: isActive
        }

        const response = popup
            ? await updateAdminPopup(popup.id, data)
            : await createAdminPopup(data)

        setLoading(false)

        if (!response.success) {
            toast({
                title: 'Error saving popup',
                description: response.error,
                variant: 'destructive'
            })
        } else {
            toast({
                title: popup ? 'Popup updated' : 'Popup created',
                description: data.is_active ? 'This popup is now active and will appear on the mobile app.' : 'Saved successfully.',
            })
            onSaved(response.data, !popup)
            onOpenChange(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{popup ? 'Edit Admin Popup' : 'Create Admin Popup'}</DialogTitle>
                    <DialogDescription>
                        Configure the forceful modal that appears on startup in the mobile app.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    {/* Active Toggle Highlight */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50 border-slate-200">
                        <div className="space-y-0.5">
                            <Label className="text-base">Set Active</Label>
                            <p className="text-sm text-slate-500">
                                Turing this ON will automatically turn OFF all other popups. The app only fetches the latest active popup.
                            </p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Header Title *</Label>
                            <Input
                                required
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. HangHut 2.0 is Here!"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Body Message *</Label>
                            <Textarea
                                required
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Main announcement text..."
                                rows={4}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label>Header Image URL</Label>
                                <span className="text-xs text-slate-500">Optional</span>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    type="url"
                                    value={imageUrl}
                                    onChange={e => setImageUrl(e.target.value)}
                                    placeholder="https://example.com/image.png"
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                >
                                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                                    {isUploading ? 'Uploading...' : 'Upload File'}
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                />
                            </div>
                            {imageUrl && (
                                <div className="mt-2 rounded-md border overflow-hidden max-w-sm relative group">
                                    <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover max-h-40" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => setImageUrl('')}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t pt-4">
                            <div className="space-y-2">
                                <Label>Action URL</Label>
                                <Input
                                    type="url"
                                    value={actionUrl}
                                    onChange={e => setActionUrl(e.target.value)}
                                    placeholder="https://... (Optional deep link)"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Action Button Text</Label>
                                <Input
                                    value={actionText}
                                    onChange={e => setActionText(e.target.value)}
                                    placeholder="Learn More"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 border-t pt-4">
                            <Label>Cooldown Days (Dismissal Logic)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={cooldownDays}
                                onChange={e => setCooldownDays(e.target.value)}
                                placeholder="0"
                            />
                            <div className="text-xs text-slate-500 space-y-1 mt-1 bg-slate-50 p-3 rounded-md border border-slate-100">
                                <p><strong>How the mobile app handles this:</strong></p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Leave empty or <code className="bg-slate-200 px-1 rounded">0</code>: The user sees it once ever (unless you create a new popup).</li>
                                    <li><code className="bg-slate-200 px-1 rounded">3</code>: If they dismiss it, it hides for exactly 3 days before reappearing.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {popup ? 'Save Changes' : 'Create Popup'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
