'use client'

import { useState, useEffect, useRef } from 'react'
import { AdminPopup, AdminPopupInput, PopupLayout, createAdminPopup, updateAdminPopup } from '@/lib/admin/popup-actions'
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
import { Loader2, Upload, X, LayoutTemplate, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PopupDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    popup: AdminPopup | null
    onSaved: (popup: AdminPopup, isNew: boolean) => void
}

/**
 * <input type="datetime-local"> speaks 'YYYY-MM-DDTHH:mm' in LOCAL time and has no
 * concept of a zone; the column is timestamptz. Converting through the Date object
 * keeps the two honest — what the admin picks in Manila is what the app compares
 * against now() — instead of slicing the ISO string, which silently shifts the
 * schedule by the UTC offset.
 */
function toLocalInput(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function PopupDialog({ open, onOpenChange, popup, onSaved }: PopupDialogProps) {
    const [layout, setLayout] = useState<PopupLayout>('standard')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [actionUrl, setActionUrl] = useState('')
    const [actionText, setActionText] = useState('Learn More')
    const [cooldownDays, setCooldownDays] = useState('')
    const [priority, setPriority] = useState('0')
    const [startsAt, setStartsAt] = useState('')
    const [endsAt, setEndsAt] = useState('')
    const [isActive, setIsActive] = useState(false)
    const [loading, setLoading] = useState(false)

    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { toast } = useToast()
    const supabase = createClient()

    const isPoster = layout === 'image'

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('admin-popups')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const { data: urlData } = supabase.storage
                .from('admin-popups')
                .getPublicUrl(fileName)

            setImageUrl(urlData.publicUrl)
            toast({ title: 'Image uploaded', description: 'The app renders this at its natural aspect ratio — portrait posters are fine.' })
        } catch (error: any) {
            console.error('Error uploading image:', error)
            toast({
                title: 'Upload failed',
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
            setLayout(popup.layout === 'image' ? 'image' : 'standard')
            setTitle(popup.title)
            setBody(popup.body)
            setImageUrl(popup.image_url || '')
            setActionUrl(popup.action_url || '')
            setActionText(popup.action_text || 'Learn More')
            setCooldownDays(popup.cooldown_days !== null ? popup.cooldown_days.toString() : '')
            setPriority(String(popup.priority ?? 0))
            setStartsAt(toLocalInput(popup.starts_at))
            setEndsAt(toLocalInput(popup.ends_at))
            setIsActive(popup.is_active)
        } else {
            setLayout('standard')
            setTitle('')
            setBody('')
            setImageUrl('')
            setActionUrl('')
            setActionText('Learn More')
            setCooldownDays('')
            setPriority('0')
            setStartsAt('')
            setEndsAt('')
            setIsActive(false)
        }
    }, [popup, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // A poster with no image is an empty modal — the image IS the popup.
        if (isPoster && !imageUrl) {
            toast({
                title: 'Image required',
                description: 'The poster layout renders nothing but the image. Upload one, or switch to the standard card.',
                variant: 'destructive'
            })
            return
        }

        if (!isPoster && actionUrl && !actionText.trim()) {
            toast({
                title: 'Button text required',
                description: 'The standard card needs button text when an action URL is set.',
                variant: 'destructive'
            })
            return
        }

        const start = fromLocalInput(startsAt)
        const end = fromLocalInput(endsAt)
        if (start && end && new Date(end) <= new Date(start)) {
            toast({
                title: 'Check the schedule',
                description: 'The end time is not after the start time, so this popup would never show.',
                variant: 'destructive'
            })
            return
        }

        setLoading(true)

        const data: AdminPopupInput = {
            layout,
            title,
            body,
            image_url: imageUrl || null,
            action_url: actionUrl || null,
            action_text: actionText || 'Learn More',
            cooldown_days: cooldownDays ? parseInt(cooldownDays, 10) : null,
            priority: priority ? parseInt(priority, 10) : 0,
            starts_at: start,
            ends_at: end,
            is_active: isActive,
        }

        const response = popup
            ? await updateAdminPopup(popup.id, data)
            : await createAdminPopup(data)

        setLoading(false)

        if (!response.success) {
            toast({ title: 'Error saving popup', description: response.error, variant: 'destructive' })
            return
        }

        toast({
            title: popup ? 'Popup updated' : 'Popup created',
            description: isActive
                ? 'Live — it joins the queue on the next app launch.'
                : 'Saved. It stays hidden until you switch it on.',
        })
        onSaved(response.data, !popup)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{popup ? 'Edit popup' : 'Create popup'}</DialogTitle>
                    <DialogDescription>
                        Shown on app launch. Several popups can be live at once — the app shows them one
                        after another, highest priority first, up to three per launch.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    {/* Live toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50 border-slate-200">
                        <div className="space-y-0.5">
                            <Label className="text-base">Live</Label>
                            <p className="text-sm text-slate-500">
                                Other popups stay as they are — switching this on adds it to the queue
                                rather than replacing what&apos;s already running.
                            </p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    {/* Layout */}
                    <div className="space-y-2">
                        <Label>Layout</Label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setLayout('standard')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    !isPoster ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <LayoutTemplate className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
                                <span>
                                    <span className="block text-sm font-medium">Standard card</span>
                                    <span className="block text-xs text-slate-500 mt-0.5">Image, title, message and a button.</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setLayout('image')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    isPoster ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <ImageIcon className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />
                                <span>
                                    <span className="block text-sm font-medium">Poster</span>
                                    <span className="block text-xs text-slate-500 mt-0.5">Image only. The whole image is the button.</span>
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{isPoster ? 'Internal name *' : 'Title *'}</Label>
                            <Input
                                required
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={isPoster ? 'e.g. püpa launch poster' : 'e.g. HangHut 2.0 is here!'}
                            />
                            {isPoster && (
                                <p className="text-xs text-slate-500">
                                    Not shown to anyone — the poster carries its own text. This is just how you&apos;ll
                                    recognise it in this list.
                                </p>
                            )}
                        </div>

                        {!isPoster && (
                            <div className="space-y-2">
                                <Label>Message *</Label>
                                <Textarea
                                    required
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder="Main announcement text..."
                                    rows={4}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label>{isPoster ? 'Poster image *' : 'Header image'}</Label>
                                <span className="text-xs text-slate-500">{isPoster ? 'Required' : 'Optional'}</span>
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
                                    {isUploading ? 'Uploading...' : 'Upload file'}
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                Portrait is fine — the app renders at natural aspect ratio and never crops.
                            </p>
                            {imageUrl && (
                                /* No fixed height and no object-cover: the preview has to show the same
                                   uncropped shape the app will render, or a portrait poster looks wrong here
                                   and right on the phone. */
                                <div className="mt-2 rounded-md border overflow-hidden max-w-[220px] relative group bg-slate-50">
                                    <img
                                        src={imageUrl}
                                        alt="Preview"
                                        className="w-full h-auto block"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
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

                        <div className={`grid gap-4 border-t pt-4 ${isPoster ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            <div className="space-y-2">
                                <Label>Action URL</Label>
                                <Input
                                    type="url"
                                    value={actionUrl}
                                    onChange={e => setActionUrl(e.target.value)}
                                    placeholder="https://hanghut.com/events/my-event"
                                />
                                <p className="text-xs text-slate-500">
                                    A hanghut.com link (including a partner subdomain) opens inside the app.
                                    Anything else opens the browser. Leave empty for dismiss-only.
                                </p>
                            </div>
                            {!isPoster && (
                                <div className="space-y-2">
                                    <Label>Button text</Label>
                                    <Input
                                        value={actionText}
                                        onChange={e => setActionText(e.target.value)}
                                        placeholder="Learn More"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Queue + schedule */}
                        <div className="grid grid-cols-3 gap-4 border-t pt-4">
                            <div className="space-y-2">
                                <Label>Priority</Label>
                                <Input
                                    type="number"
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                    placeholder="0"
                                />
                                <p className="text-xs text-slate-500">Higher shows first.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Starts</Label>
                                <Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
                                <p className="text-xs text-slate-500">Empty = immediately.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Ends</Label>
                                <Input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
                                <p className="text-xs text-slate-500">Empty = never.</p>
                            </div>
                        </div>

                        <div className="space-y-2 border-t pt-4">
                            <Label>Cooldown days</Label>
                            <Input
                                type="number"
                                min="0"
                                value={cooldownDays}
                                onChange={e => setCooldownDays(e.target.value)}
                                placeholder="0"
                            />
                            <div className="text-xs text-slate-500 space-y-1 mt-1 bg-slate-50 p-3 rounded-md border border-slate-100">
                                <p><strong>How the app handles this:</strong></p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Empty or <code className="bg-slate-200 px-1 rounded">0</code>: seen once, then never again.</li>
                                    <li><code className="bg-slate-200 px-1 rounded">3</code>: reappears three days after it&apos;s dismissed.</li>
                                    <li>Tracked on the device, so reinstalling shows it again.</li>
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
                            {popup ? 'Save changes' : 'Create popup'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
