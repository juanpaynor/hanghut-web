'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Plus, Edit, Trash2, Ticket, DollarSign, Users, Star, X, Check, Sparkles, Loader2, Upload } from 'lucide-react'
import { createTicketTier, updateTicketTier, deleteTicketTier, uploadTierImage } from '@/lib/organizer/tier-actions'
import { updateEventTierDisplay } from '@/lib/organizer/event-actions'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface TicketTier {
    id: string
    name: string
    description: string | null
    price: number
    quantity_total: number
    quantity_sold: number
    min_per_order: number
    max_per_order: number
    sales_start: string | null
    sales_end: string | null
    is_active: boolean
    sort_order: number
    perks?: string[] | null
    highlight?: boolean | null
    badge_label?: string | null
    accent_color?: string | null
    image_url?: string | null
}

/** How tiers are presented on the public event page (stored in layout_config.tiers). */
export interface TierDisplayConfig {
    inline?: boolean
    display?: 'cards' | 'list'
    show_remaining?: boolean
    show_sold_out?: boolean
}

const DISPLAY_DEFAULTS: Required<TierDisplayConfig> = {
    inline: true,
    display: 'cards',
    show_remaining: false,
    show_sold_out: true,
}

/** Preset accent swatches offered in the tier editor. */
const ACCENT_PRESETS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#8b5cf6', '#0ea5e9']

interface TicketTiersManagerProps {
    eventId: string
    tiers: TicketTier[]
    commissionRate: number
    passFixedToCustomer: boolean
    passPercentageToCustomer: boolean
    fixedFeePerTicket: number
    /** Current display config from event.layout_config.tiers. */
    initialDisplay?: TierDisplayConfig
}

export function TicketTiersManager({
    eventId,
    tiers: initialTiers,
    commissionRate,
    passFixedToCustomer,
    passPercentageToCustomer,
    fixedFeePerTicket,
    initialDisplay,
}: TicketTiersManagerProps) {
    const { toast } = useToast()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingTier, setEditingTier] = useState<TicketTier | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    // Local copy so create/update/delete patch the list in place — avoids a
    // router.refresh() that re-fetches the whole event dashboard (felt like a
    // full reload). The server actions still revalidate for the next load.
    const [tiers, setTiers] = useState<TicketTier[]>(initialTiers)

    // ── Display settings (how tiers show on the public page) ──────────────────
    const [display, setDisplay] = useState<Required<TierDisplayConfig>>({ ...DISPLAY_DEFAULTS, ...(initialDisplay || {}) })
    const [displayDirty, setDisplayDirty] = useState(false)
    const [savingDisplay, setSavingDisplay] = useState(false)

    const patchDisplay = (patch: Partial<TierDisplayConfig>) => {
        setDisplay(prev => ({ ...prev, ...patch }))
        setDisplayDirty(true)
    }

    const saveDisplay = async () => {
        setSavingDisplay(true)
        const result = await updateEventTierDisplay(eventId, display)
        setSavingDisplay(false)
        if (result.error) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
            setDisplayDirty(false)
            toast({ title: 'Saved', description: 'Ticket display settings updated.' })
        }
    }

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        quantity_total: '',
        min_per_order: '1',
        max_per_order: '10',
        is_active: true,
        perks: [] as string[],
        highlight: false,
        badge_label: '',
        accent_color: '' as string,
        image_url: '' as string,
    })
    const [perkDraft, setPerkDraft] = useState('')
    const [uploadingImage, setUploadingImage] = useState(false)

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            quantity_total: '',
            min_per_order: '1',
            max_per_order: '10',
            is_active: true,
            perks: [],
            highlight: false,
            badge_label: '',
            accent_color: '',
            image_url: '',
        })
        setPerkDraft('')
        setEditingTier(null)
    }

    const openCreateDialog = () => {
        resetForm()
        setIsDialogOpen(true)
    }

    const openEditDialog = (tier: TicketTier) => {
        setEditingTier(tier)
        setFormData({
            name: tier.name,
            description: tier.description || '',
            price: tier.price.toString(),
            quantity_total: tier.quantity_total.toString(),
            min_per_order: tier.min_per_order.toString(),
            max_per_order: tier.max_per_order.toString(),
            is_active: tier.is_active,
            perks: Array.isArray(tier.perks) ? tier.perks : [],
            highlight: !!tier.highlight,
            badge_label: tier.badge_label || '',
            accent_color: tier.accent_color || '',
            image_url: tier.image_url || '',
        })
        setPerkDraft('')
        setIsDialogOpen(true)
    }

    const handleImageUpload = async (file: File) => {
        setUploadingImage(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('eventId', eventId)
            const res = await uploadTierImage(fd)
            if (res.error || !res.url) {
                toast({ title: 'Upload failed', description: res.error || 'Could not upload image', variant: 'destructive' })
            } else {
                setFormData(prev => ({ ...prev, image_url: res.url as string }))
            }
        } finally {
            setUploadingImage(false)
        }
    }

    const addPerk = () => {
        const v = perkDraft.trim()
        if (!v) return
        setFormData(prev => ({ ...prev, perks: [...prev.perks, v] }))
        setPerkDraft('')
    }

    const removePerk = (idx: number) => {
        setFormData(prev => ({ ...prev, perks: prev.perks.filter((_, i) => i !== idx) }))
    }

    const handleSubmit = async () => {
        if (!formData.name || !formData.price || !formData.quantity_total) {
            toast({
                title: 'Missing Fields',
                description: 'Name, Price, and Quantity are required.',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const tierData = {
                name: formData.name,
                description: formData.description,
                price: parseFloat(formData.price),
                quantity_total: parseInt(formData.quantity_total),
                min_per_order: parseInt(formData.min_per_order),
                max_per_order: parseInt(formData.max_per_order),
                is_active: formData.is_active,
                sort_order: editingTier ? editingTier.sort_order : tiers.length,
                // Presentation
                perks: formData.perks,
                highlight: formData.highlight,
                badge_label: formData.badge_label.trim() || null,
                accent_color: formData.accent_color || null,
                image_url: formData.image_url || null,
            }

            let result
            if (editingTier) {
                result = await updateTicketTier(editingTier.id, tierData)
            } else {
                result = await createTicketTier(eventId, tierData)
            }

            if (result.error) {
                toast({
                    title: 'Error',
                    description: result.error,
                    variant: 'destructive',
                })
            } else {
                toast({
                    title: 'Success',
                    description: editingTier ? 'Tier updated successfully' : 'Tier created successfully',
                })
                // Patch the list locally instead of a full route refresh.
                if (editingTier) {
                    const updated = { ...editingTier, ...tierData } as TicketTier
                    setTiers(prev => prev.map(t => (t.id === editingTier.id ? updated : t)))
                } else if ('tier' in result && result.tier) {
                    setTiers(prev => [...prev, result.tier as TicketTier])
                }
                setIsDialogOpen(false)
                resetForm()
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'An unexpected error occurred',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleDelete = async (tierId: string) => {
        if (!confirm('Are you sure you want to delete this tier? This cannot be undone.')) {
            return
        }

        setIsLoading(true)
        const result = await deleteTicketTier(tierId)

        if (result.error) {
            toast({
                title: 'Error',
                description: result.error,
                variant: 'destructive',
            })
        } else {
            toast({
                title: 'Success',
                description: 'Tier deleted successfully',
            })
            setTiers(prev => prev.filter(t => t.id !== tierId))
        }
        setIsLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Ticket Tiers</h2>
                    <p className="text-muted-foreground">
                        Manage pricing tiers for your event (VIP, GA, Early Bird, etc.)
                    </p>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Tier
                </Button>
            </div>

            {/* Display settings — how tiers appear on the public event page */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Display on event page
                    </CardTitle>
                    <CardDescription>Control how buyers see your tiers before checkout.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Show tiers inline</Label>
                            <p className="text-sm text-muted-foreground">
                                List every tier on the page. Off = one “Get Tickets” button opens a popup.
                            </p>
                        </div>
                        <Switch checked={display.inline} onCheckedChange={(v) => patchDisplay({ inline: v })} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <Label>Layout</Label>
                            <p className="text-sm text-muted-foreground">Card grid or compact rows.</p>
                        </div>
                        <div className="flex rounded-lg border p-0.5">
                            {(['cards', 'list'] as const).map(opt => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => patchDisplay({ display: opt })}
                                    className={cn(
                                        'px-3 py-1.5 text-sm rounded-md capitalize transition-colors',
                                        display.display === opt ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Show remaining count</Label>
                            <p className="text-sm text-muted-foreground">Display “N left” to create urgency.</p>
                        </div>
                        <Switch checked={display.show_remaining} onCheckedChange={(v) => patchDisplay({ show_remaining: v })} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Keep sold-out tiers visible</Label>
                            <p className="text-sm text-muted-foreground">Show them greyed out instead of hiding.</p>
                        </div>
                        <Switch checked={display.show_sold_out} onCheckedChange={(v) => patchDisplay({ show_sold_out: v })} />
                    </div>

                    {displayDirty && (
                        <div className="flex justify-end pt-1">
                            <Button size="sm" onClick={saveDisplay} disabled={savingDisplay}>
                                {savingDisplay ? 'Saving…' : 'Save display settings'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {tiers.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground text-center">
                                No ticket tiers yet. Create one to get started.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    tiers.map((tier) => (
                        <Card
                            key={tier.id}
                            style={tier.accent_color ? { borderColor: tier.accent_color } : undefined}
                            className={cn(tier.highlight && 'ring-1 ring-primary/40')}
                        >
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        {tier.image_url && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={tier.image_url} alt="" className="h-12 w-12 rounded-md object-cover border shrink-0" />
                                        )}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {tier.accent_color && (
                                                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tier.accent_color }} />
                                            )}
                                            <CardTitle>{tier.name}</CardTitle>
                                            {tier.highlight && (
                                                <Badge className="text-[10px] h-5 gap-1"><Star className="h-3 w-3" />Featured</Badge>
                                            )}
                                            {tier.badge_label && (
                                                <Badge variant="outline" className="text-[10px] h-5">{tier.badge_label}</Badge>
                                            )}
                                            {!tier.is_active && (
                                                <Badge variant="secondary">Inactive</Badge>
                                            )}
                                            {tier.quantity_sold >= tier.quantity_total && (
                                                <Badge variant="destructive">Sold Out</Badge>
                                            )}
                                        </div>
                                        {tier.description && (
                                            <CardDescription>{tier.description}</CardDescription>
                                        )}
                                    </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditDialog(tier)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(tier.id)}
                                            disabled={tier.quantity_sold > 0}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">₱{tier.price.toFixed(2)}</p>
                                            <p className="text-xs text-muted-foreground">Price</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">
                                                {tier.quantity_sold} / {tier.quantity_total}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Sold</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Ticket className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">
                                                {tier.min_per_order} - {tier.max_per_order}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Per Order</p>
                                        </div>
                                    </div>
                                </div>
                                {Array.isArray(tier.perks) && tier.perks.length > 0 && (
                                    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                                        {tier.perks.map((perk, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                                {perk}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingTier ? 'Edit Ticket Tier' : 'Create Ticket Tier'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingTier
                                ? 'Update the details of this ticket tier'
                                : 'Add a new pricing tier for your event'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Tier Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g., VIP, General Admission, Early Bird"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="e.g., Includes 2 free drinks and skip-the-line access"
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="price">Price (₱) *</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.price}
                                    onChange={(e) =>
                                        setFormData({ ...formData, price: e.target.value })
                                    }
                                />
                                {(() => {
                                    const p = parseFloat(formData.price) || 0
                                    const pct = p * commissionRate
                                    const customerPays =
                                        p + (passFixedToCustomer ? fixedFeePerTicket : 0) + (passPercentageToCustomer ? pct : 0)
                                    const net =
                                        p - (passFixedToCustomer ? 0 : fixedFeePerTicket) - (passPercentageToCustomer ? 0 : pct)
                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>Customer Pays</span>
                                                <span>₱{customerPays.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-red-600">
                                                <span>Booking Fee (₱{fixedFeePerTicket.toFixed(2)})</span>
                                                <span>{passFixedToCustomer ? 'Customer' : `-₱${fixedFeePerTicket.toFixed(2)}`}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-red-600">
                                                <span>Commission ({(commissionRate * 100).toFixed(0)}%)</span>
                                                <span>{passPercentageToCustomer ? 'Customer' : `-₱${pct.toFixed(2)}`}</span>
                                            </div>
                                            <div className="border-t border-border/50 pt-1 flex justify-between font-medium text-foreground">
                                                <span>Net Earnings</span>
                                                <span className="text-green-600">₱{net.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="quantity">Total Quantity *</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    placeholder="100"
                                    value={formData.quantity_total}
                                    onChange={(e) =>
                                        setFormData({ ...formData, quantity_total: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="min">Min Per Order</Label>
                                <Input
                                    id="min"
                                    type="number"
                                    value={formData.min_per_order}
                                    onChange={(e) =>
                                        setFormData({ ...formData, min_per_order: e.target.value })
                                    }
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="max">Max Per Order</Label>
                                <Input
                                    id="max"
                                    type="number"
                                    value={formData.max_per_order}
                                    onChange={(e) =>
                                        setFormData({ ...formData, max_per_order: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* ── Presentation ─────────────────────────────────────── */}
                        <div className="space-y-1">
                            <Label className="text-base">Presentation</Label>
                            <p className="text-sm text-muted-foreground">How this tier looks to buyers on the event page.</p>
                        </div>

                        {/* Tier image */}
                        <div className="grid gap-2">
                            <Label>Tier image</Label>
                            <p className="text-xs text-muted-foreground">Optional. Shown on the tier card — e.g. a seating view, artist photo, or what the tier includes.</p>
                            {formData.image_url ? (
                                <div className="relative w-full max-w-xs overflow-hidden rounded-lg border">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={formData.image_url} alt="Tier" className="h-36 w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                                        aria-label="Remove image"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex h-28 w-full max-w-xs cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/40">
                                    {uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                                    <span className="text-xs">{uploadingImage ? 'Uploading…' : 'Upload image'}</span>
                                    <span className="text-[10px] text-muted-foreground/70">PNG or JPG, up to 5MB</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={uploadingImage}
                                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
                                    />
                                </label>
                            )}
                        </div>

                        {/* Perks */}
                        <div className="grid gap-2">
                            <Label>What&apos;s included</Label>
                            <p className="text-xs text-muted-foreground">Short bullets shown on the tier card.</p>
                            {formData.perks.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {formData.perks.map((perk, i) => (
                                        <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
                                            <Check className="h-3 w-3 text-green-600" />
                                            {perk}
                                            <button type="button" onClick={() => removePerk(i)} className="text-muted-foreground hover:text-foreground">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="e.g., Front-row seating"
                                    value={perkDraft}
                                    onChange={(e) => setPerkDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerk() } }}
                                />
                                <Button type="button" variant="outline" onClick={addPerk}>Add</Button>
                            </div>
                        </div>

                        {/* Featured + badge */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="highlight">Feature this tier</Label>
                                <p className="text-sm text-muted-foreground">Visually emphasize it on the page.</p>
                            </div>
                            <Switch
                                id="highlight"
                                checked={formData.highlight}
                                onCheckedChange={(checked) => setFormData({ ...formData, highlight: checked })}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="badge">Badge label</Label>
                            <Input
                                id="badge"
                                placeholder="e.g., Most Popular, Best Value"
                                value={formData.badge_label}
                                maxLength={24}
                                onChange={(e) => setFormData({ ...formData, badge_label: e.target.value })}
                            />
                        </div>

                        {/* Accent color */}
                        <div className="grid gap-2">
                            <Label>Accent color</Label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {ACCENT_PRESETS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, accent_color: c })}
                                        className={cn(
                                            'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                                            formData.accent_color === c ? 'border-foreground' : 'border-transparent'
                                        )}
                                        style={{ backgroundColor: c }}
                                        aria-label={`Accent ${c}`}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={formData.accent_color || '#000000'}
                                    onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                                    className="h-7 w-9 rounded border bg-transparent p-0.5 cursor-pointer"
                                    aria-label="Custom accent color"
                                />
                                {formData.accent_color && (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setFormData({ ...formData, accent_color: '' })}>
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="active">Active</Label>
                                <p className="text-sm text-muted-foreground">
                                    Inactive tiers won&apos;t be available for purchase
                                </p>
                            </div>
                            <Switch
                                id="active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_active: checked })
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={isLoading}>
                            {isLoading ? 'Saving...' : editingTier ? 'Update Tier' : 'Create Tier'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
