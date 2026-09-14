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
import { isoToManilaLocal, manilaLocalToISO } from '@/lib/datetime'

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

/** Eyebrow for each column of the tier dialog. */
function SectionLabel({ title, hint }: { title: string; hint: string }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            <p className="text-sm text-muted-foreground/80">{hint}</p>
        </div>
    )
}

/** The required-field asterisk, styled once. */
function Req() {
    return <span className="text-destructive" aria-hidden>*</span>
}

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
        sales_start: '',
        sales_end: '',
        is_active: true,
        show_when_locked: false,
        lock_note: '',
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
            sales_start: '',
            sales_end: '',
            is_active: true,
            show_when_locked: false,
            lock_note: '',
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
            sales_start: isoToManilaLocal(tier.sales_start),
            sales_end: isoToManilaLocal(tier.sales_end),
            is_active: tier.is_active,
            show_when_locked: (tier as any).show_when_locked ?? false,
            lock_note: (tier as any).lock_note ?? '',
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
        // A window that closes before it opens sells nothing and reads as a
        // working configuration — catch it here rather than at the first buyer.
        if (formData.sales_start && formData.sales_end
            && new Date(formData.sales_start) >= new Date(formData.sales_end)) {
            toast({ title: 'Check the sales window', description: 'Sales must open before they close.', variant: 'destructive' })
            return
        }
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
                // Empty means "no boundary", which must reach the database as
                // NULL and not as an empty string the column would reject.
                sales_start: formData.sales_start ? manilaLocalToISO(formData.sales_start) : null,
                sales_end: formData.sales_end ? manilaLocalToISO(formData.sales_end) : null,
                is_active: formData.is_active,
                show_when_locked: formData.show_when_locked,
                lock_note: formData.lock_note.trim() || null,
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
                                                <Badge variant="secondary">
                                                    {(tier as any).show_when_locked ? 'Locked · shown' : 'Locked · hidden'}
                                                </Badge>
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
                <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
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

                    {/* Two columns from md: what it IS on the left, how it LOOKS on the
                        right. Both fit ~400px tall so the dialog never scrolls on a
                        laptop; the max-h/overflow on DialogContent is only a net for a
                        tier with a long perks list. */}
                    <div className="grid gap-x-8 gap-y-5 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

                        {/* ── Left: details ─────────────────────────────────── */}
                        <div className="grid min-w-0 content-start gap-5">
                            <SectionLabel title="Details" hint="What buyers get and what it costs." />

                            {/* Name + on-sale. The switch belongs with the tier's
                                identity, not at the bottom of the form like an
                                afterthought — "General B · on sale" is one thought. */}
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="name">Tier name <Req /></Label>
                                    <label htmlFor="active" className="flex cursor-pointer items-center gap-2 text-sm">
                                        <span className={cn('font-medium', formData.is_active ? 'text-foreground' : 'text-muted-foreground')}>
                                            {formData.is_active ? 'On sale' : 'Off sale'}
                                        </span>
                                        <Switch
                                            id="active"
                                            checked={formData.is_active}
                                            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                        />
                                    </label>
                                </div>
                                <Input
                                    id="name"
                                    placeholder="e.g., VIP, General Admission, Early Bird"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            {/* Only meaningful while off sale — hidden otherwise so the
                                dialog doesn't ask about a state that isn't in play. */}
                            {!formData.is_active && (
                                <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                                    <label htmlFor="show_when_locked" className="flex cursor-pointer items-center justify-between gap-4">
                                        <span className="text-sm">
                                            <span className="font-medium">Still show it on the event page</span>
                                            <span className="block text-xs text-muted-foreground">Greyed out and unbuyable, instead of disappearing.</span>
                                        </span>
                                        <Switch
                                            id="show_when_locked"
                                            checked={formData.show_when_locked}
                                            onCheckedChange={(checked) => setFormData({ ...formData, show_when_locked: checked })}
                                        />
                                    </label>
                                    {formData.show_when_locked && (
                                        <Input
                                            id="lock_note"
                                            value={formData.lock_note}
                                            maxLength={80}
                                            placeholder="Note for buyers, e.g. Opens Friday 6PM"
                                            onChange={(e) => setFormData({ ...formData, lock_note: e.target.value })}
                                        />
                                    )}
                                </div>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    rows={2}
                                    className="resize-none"
                                    placeholder="e.g., Includes 2 free drinks and skip-the-line access"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            {/* Money + inventory on one row. Min/max are one control:
                                a range, not two unrelated numbers. */}
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
                                <div className="grid gap-2">
                                    <Label htmlFor="price">Price <Req /></Label>
                                    <div className="relative">
                                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₱</span>
                                        <Input
                                            id="price"
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="pl-7"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="quantity">Quantity <Req /></Label>
                                    <Input
                                        id="quantity"
                                        type="number"
                                        placeholder="100"
                                        value={formData.quantity_total}
                                        onChange={(e) => setFormData({ ...formData, quantity_total: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="min">Per order</Label>
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <Input
                                            id="min"
                                            type="number"
                                            className="min-w-0"
                                            aria-label="Minimum per order"
                                            value={formData.min_per_order}
                                            onChange={(e) => setFormData({ ...formData, min_per_order: e.target.value })}
                                        />
                                        <span className="text-sm text-muted-foreground">–</span>
                                        <Input
                                            id="max"
                                            type="number"
                                            className="min-w-0"
                                            aria-label="Maximum per order"
                                            value={formData.max_per_order}
                                            onChange={(e) => setFormData({ ...formData, max_per_order: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* The fee maths, as a computed result rather than
                                floating text: what the buyer pays, what we keep,
                                what the organizer actually gets. */}
                            {(() => {
                                const p = parseFloat(formData.price) || 0
                                const pct = p * commissionRate
                                const customerPays =
                                    p + (passFixedToCustomer ? fixedFeePerTicket : 0) + (passPercentageToCustomer ? pct : 0)
                                const fees =
                                    (passFixedToCustomer ? 0 : fixedFeePerTicket) + (passPercentageToCustomer ? 0 : pct)
                                const net = p - fees
                                return (
                                    <div className="-mt-2 flex items-center justify-between gap-4 rounded-md bg-muted/60 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">
                                            Buyer pays <span className="font-medium text-foreground tabular-nums">₱{customerPays.toFixed(2)}</span>
                                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                                            Fees {fees > 0
                                                ? <span className="tabular-nums text-red-600">−₱{fees.toFixed(2)}</span>
                                                : <span>passed on</span>}
                                        </span>
                                        <span className="shrink-0 font-semibold">
                                            You earn <span className="tabular-nums text-green-600">₱{net.toFixed(2)}</span>
                                        </span>
                                    </div>
                                )
                            })()}

                            {/* Sales window — one control, a range with an arrow, not
                                two separate optional fields to reason about. */}
                            <div className="grid gap-2">
                                <Label htmlFor="sales_start">
                                    Sales window <span className="font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                {/* Stacked, not side by side: a datetime-local narrower
                                    than ~210px loses its calendar button in Chrome, and
                                    two of them cannot both keep it inside one column. */}
                                <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                                    <span className="text-sm text-muted-foreground">Opens</span>
                                    <Input
                                        id="sales_start"
                                        type="datetime-local"
                                        aria-label="Sales open"
                                        value={formData.sales_start}
                                        onChange={(e) => setFormData({ ...formData, sales_start: e.target.value })}
                                    />
                                    <span className="text-sm text-muted-foreground">Closes</span>
                                    <Input
                                        id="sales_end"
                                        type="datetime-local"
                                        aria-label="Sales close"
                                        value={formData.sales_end}
                                        onChange={(e) => setFormData({ ...formData, sales_end: e.target.value })}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Philippine time. Blank = sells as long as the event does. Set a close for early bird.
                                </p>
                            </div>
                        </div>

                        {/* ── Right: presentation ──────────────────────────── */}
                        <div className="grid min-w-0 content-start gap-5 md:border-l md:pl-8">
                            <SectionLabel title="Presentation" hint="How the tier looks on the event page." />

                            {/* Image — a compact bar, not a tall empty box. */}
                            <div className="grid gap-2">
                                <Label>Image <span className="font-normal text-muted-foreground">(optional)</span></Label>
                                {formData.image_url ? (
                                    <div className="relative overflow-hidden rounded-lg border">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={formData.image_url} alt="Tier" className="h-24 w-full object-cover" />
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
                                    <label className="flex h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 text-muted-foreground transition-colors hover:bg-muted/40">
                                        {uploadingImage ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Upload className="h-5 w-5 shrink-0" />}
                                        <span className="text-sm">
                                            <span className="font-medium text-foreground">{uploadingImage ? 'Uploading…' : 'Upload an image'}</span>
                                            <span className="block text-xs">A seating view, artist photo, or what's included. PNG or JPG, up to 5MB.</span>
                                        </span>
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
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="e.g., Front-row seating"
                                        value={perkDraft}
                                        onChange={(e) => setPerkDraft(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerk() } }}
                                    />
                                    <Button type="button" variant="outline" onClick={addPerk} disabled={!perkDraft.trim()}>Add</Button>
                                </div>
                                {formData.perks.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {formData.perks.map((perk, i) => (
                                            <span key={i} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1.5 text-xs">
                                                <Check className="h-3 w-3 text-green-600" />
                                                {perk}
                                                <button type="button" onClick={() => removePerk(i)} aria-label={`Remove ${perk}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Short bullets on the tier card. Press Enter to add each one.</p>
                                )}
                            </div>

                            {/* Badge + featured, one row */}
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                                <div className="grid gap-2">
                                    <Label htmlFor="badge">Badge</Label>
                                    <Input
                                        id="badge"
                                        placeholder="e.g., Most Popular"
                                        value={formData.badge_label}
                                        maxLength={24}
                                        onChange={(e) => setFormData({ ...formData, badge_label: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="highlight">Featured</Label>
                                    <label
                                        htmlFor="highlight"
                                        className={cn(
                                            'flex h-10 cursor-pointer items-center justify-between rounded-md border px-3 text-sm transition-colors',
                                            formData.highlight ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40',
                                        )}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <Star className={cn('h-3.5 w-3.5', formData.highlight ? 'text-primary' : 'text-muted-foreground')} />
                                            Stand out
                                        </span>
                                        <Switch
                                            id="highlight"
                                            checked={formData.highlight}
                                            onCheckedChange={(checked) => setFormData({ ...formData, highlight: checked })}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Accent color */}
                            <div className="grid gap-2">
                                <Label>Accent color</Label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {ACCENT_PRESETS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, accent_color: formData.accent_color === c ? '' : c })}
                                            className={cn(
                                                'h-7 w-7 rounded-full transition-transform hover:scale-110',
                                                'ring-offset-2 ring-offset-background',
                                                formData.accent_color === c ? 'ring-2 ring-foreground' : 'ring-0',
                                            )}
                                            style={{ backgroundColor: c }}
                                            aria-label={`Accent ${c}`}
                                            aria-pressed={formData.accent_color === c}
                                        />
                                    ))}
                                    <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed text-muted-foreground hover:bg-muted/40" title="Custom color">
                                        <Plus className="h-3.5 w-3.5" />
                                        <input
                                            type="color"
                                            value={formData.accent_color || '#6366f1'}
                                            onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                                            className="absolute inset-0 cursor-pointer opacity-0"
                                            aria-label="Custom accent color"
                                        />
                                    </label>
                                    {formData.accent_color && !ACCENT_PRESETS.includes(formData.accent_color) && (
                                        <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <span className="h-4 w-4 rounded-full ring-2 ring-foreground ring-offset-2 ring-offset-background" style={{ backgroundColor: formData.accent_color }} />
                                            {formData.accent_color}
                                        </span>
                                    )}
                                    {formData.accent_color && (
                                        <button type="button" onClick={() => setFormData({ ...formData, accent_color: '' })} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
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
