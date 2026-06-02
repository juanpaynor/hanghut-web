'use client'

import { useState, useTransition, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import {
    Plus, Trash2, Loader2, Upload, X, ImageIcon,
    FileText, Link2, Package, Mic2, Star, Users, Ticket, ChevronUp, ChevronDown
} from 'lucide-react'
import { RichTextEditor } from '@/components/organizer/marketing/rich-text-editor'
import { createSubscriptionTier, updateSubscriptionTier, type PerkItem } from '@/lib/subscriptions/actions'
import { cn } from '@/lib/utils'

// ─── Perk config ──────────────────────────────────────────
type IconFC = React.FC<{ className?: string }>

const PERK_TYPES: {
    value: PerkItem['type']
    label: string
    icon: IconFC
    hasUrl: boolean
    hasDescription: boolean
    hasFrequency: boolean
    urlPlaceholder?: string
}[] = [
    { value: 'gated_posts',      label: 'Exclusive Posts',      icon: FileText, hasUrl: false, hasDescription: true,  hasFrequency: false },
    { value: 'early_access',     label: 'Early Event Access',   icon: Ticket,   hasUrl: false, hasDescription: true,  hasFrequency: false },
    { value: 'digital_download', label: 'Digital Download',     icon: Link2,    hasUrl: true,  hasDescription: true,  hasFrequency: true,  urlPlaceholder: 'https://drive.google.com/...' },
    { value: 'community_link',   label: 'Community Access',     icon: Users,    hasUrl: true,  hasDescription: false, hasFrequency: false, urlPlaceholder: 'https://discord.gg/...' },
    { value: 'merch',            label: 'Physical Merch',       icon: Package,  hasUrl: false, hasDescription: true,  hasFrequency: true  },
    { value: 'shoutout',         label: 'Shoutout / Request',   icon: Mic2,     hasUrl: false, hasDescription: true,  hasFrequency: true  },
    { value: 'custom',           label: 'Custom Perk',          icon: Star,     hasUrl: false, hasDescription: true,  hasFrequency: false },
]

const PERK_TYPE_MAP = Object.fromEntries(PERK_TYPES.map(p => [p.value, p]))

const FREQUENCY_LABELS = {
    once: 'Once on signup',
    monthly: 'Once per month',
    unlimited: 'Unlimited',
}

// ─── Types ─────────────────────────────────────────────────
interface Tier {
    id: string
    name: string
    description: string | null
    price_monthly: number
    is_active: boolean
    image_url: string | null
    long_description: string | null
    perks: PerkItem[]
}

interface Props {
    open: boolean
    onClose: () => void
    onSaved: (tier: Tier) => void
    tier?: Tier // if editing
    partnerId: string
}

const EMPTY_PERK = (): PerkItem => ({ type: 'custom', label: '', description: '' })

// ─── Component ─────────────────────────────────────────────
export function TierEditor({ open, onClose, onSaved, tier, partnerId }: Props) {
    const { toast } = useToast()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)
    const [isPending, startTransition] = useTransition()
    const [uploading, setUploading] = useState(false)

    const [name, setName] = useState(tier?.name || '')
    const [description, setDescription] = useState(tier?.description || '')
    const [price, setPrice] = useState(tier ? String(tier.price_monthly) : '')
    const [imageUrl, setImageUrl] = useState(tier?.image_url || '')
    const [longDesc, setLongDesc] = useState(tier?.long_description || '')
    const [perks, setPerks] = useState<PerkItem[]>(tier?.perks || [])
    const [addingPerk, setAddingPerk] = useState(false)
    const [newPerk, setNewPerk] = useState<PerkItem>(EMPTY_PERK())

    const isEditing = !!tier

    // ── Image upload ───────────────────────────────────────
    const handleImageUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast({ title: 'Images only', variant: 'destructive' })
            return
        }
        setUploading(true)
        const ext = file.name.split('.').pop()
        const path = `subscription-tiers/${partnerId}/${Date.now()}.${ext}`

        const { data, error } = await supabase.storage
            .from('partner-assets')
            .upload(path, file, { upsert: true })

        setUploading(false)

        if (error) {
            toast({ title: 'Upload failed', description: error.message, variant: 'destructive' })
            return
        }

        const { data: { publicUrl } } = supabase.storage
            .from('partner-assets')
            .getPublicUrl(data.path)

        setImageUrl(publicUrl)
    }

    // ── Perk management ────────────────────────────────────
    const addPerk = () => {
        if (!newPerk.label.trim()) return
        setPerks(prev => [...prev, { ...newPerk }])
        setNewPerk(EMPTY_PERK())
        setAddingPerk(false)
    }

    const removePerk = (i: number) => setPerks(prev => prev.filter((_, idx) => idx !== i))

    const movePerk = (i: number, dir: 'up' | 'down') => {
        const next = dir === 'up' ? i - 1 : i + 1
        if (next < 0 || next >= perks.length) return
        setPerks(prev => {
            const updated = [...prev];
            [updated[i], updated[next]] = [updated[next], updated[i]]
            return updated
        })
    }

    // ── Save ───────────────────────────────────────────────
    const handleSave = () => {
        if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return }
        if (!price || Number(price) <= 0) { toast({ title: 'Price must be > ₱0', variant: 'destructive' }); return }

        startTransition(async () => {
            const payload = {
                name: name.trim(),
                description: description.trim(),
                price_monthly: Number(price),
                image_url: imageUrl || undefined,
                long_description: longDesc || undefined,
                perks,
            }

            const result = isEditing
                ? await updateSubscriptionTier(tier.id, payload)
                : await createSubscriptionTier(payload)

            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }

            toast({ title: isEditing ? 'Tier updated' : 'Tier created' })
            const saved = (result as any).tier ?? { ...tier, ...payload }
            onSaved(saved)
            onClose()
        })
    }

    const config = PERK_TYPE_MAP[newPerk.type]

    return (
        <Sheet open={open} onOpenChange={o => !o && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0">
                <SheetHeader className="px-6 py-5 border-b shrink-0">
                    <SheetTitle>{isEditing ? 'Edit Tier' : 'New Tier'}</SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

                    {/* ── Cover image ── */}
                    <div className="space-y-2">
                        <Label>Cover Image</Label>
                        <div
                            className="relative w-full h-44 rounded-xl overflow-hidden border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer bg-muted/30 flex items-center justify-center group"
                            onClick={() => fileRef.current?.click()}
                        >
                            {imageUrl ? (
                                <>
                                    <img src={imageUrl} alt="Tier cover" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Upload className="h-5 w-5 text-white" />
                                        <span className="text-white text-sm font-medium">Change image</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setImageUrl('') }}
                                        className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80 transition-colors"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    {uploading
                                        ? <Loader2 className="h-6 w-6 animate-spin" />
                                        : <><ImageIcon className="h-8 w-8 opacity-40" /><span className="text-sm">Click to upload cover image</span></>
                                    }
                                </div>
                            )}
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                        />
                        <p className="text-xs text-muted-foreground">Recommended: 1200×630px. Max 5MB.</p>
                    </div>

                    {/* ── Basic info ── */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Tier Name <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. VIP Fan" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Monthly Price (₱) <span className="text-destructive">*</span></Label>
                            <Input type="number" min={1} placeholder="199" value={price} onChange={e => setPrice(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Short Description <span className="text-xs text-muted-foreground">(shown on tier card)</span></Label>
                        <Textarea rows={2} placeholder="One-line pitch for this tier" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    {/* ── Long description ── */}
                    <div className="space-y-2">
                        <Label>Full Description <span className="text-xs text-muted-foreground">(shown on tier detail page)</span></Label>
                        <RichTextEditor value={longDesc} onChange={setLongDesc} />
                    </div>

                    {/* ── Perks ── */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base">Perks</Label>
                            <Button variant="outline" size="sm" onClick={() => setAddingPerk(true)} disabled={addingPerk}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Perk
                            </Button>
                        </div>

                        {/* Perk list */}
                        {perks.length > 0 && (
                            <div className="space-y-2">
                                {perks.map((perk, i) => {
                                    const cfg = PERK_TYPE_MAP[perk.type]
                                    const Icon = cfg?.icon || Star
                                    return (
                                        <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg border border-border/50">
                                            <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{perk.label}</p>
                                                {perk.description && <p className="text-xs text-muted-foreground truncate">{perk.description}</p>}
                                                {perk.url && <p className="text-xs text-primary truncate">{perk.url}</p>}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{cfg?.label}</span>
                                                    {perk.claim_frequency && (
                                                        <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{FREQUENCY_LABELS[perk.claim_frequency]}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-0.5 shrink-0">
                                                <button type="button" onClick={() => movePerk(i, 'up')} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                </button>
                                                <button type="button" onClick={() => movePerk(i, 'down')} disabled={i === perks.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            <button type="button" onClick={() => removePerk(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Add perk form */}
                        {addingPerk && (
                            <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Perk Type</Label>
                                    <Select
                                        value={newPerk.type}
                                        onValueChange={(v: string) => setNewPerk({ type: v as PerkItem['type'], label: '', description: '', url: '', claim_frequency: undefined })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERK_TYPES.map(pt => (
                                                <SelectItem key={pt.value} value={pt.value}>
                                                    <div className="flex items-center gap-2">
                                                        <pt.icon className="h-3.5 w-3.5" />
                                                        {pt.label}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Label <span className="text-destructive">*</span></Label>
                                    <Input
                                        placeholder={`e.g. ${config?.value === 'merch' ? 'Monthly sticker pack' : config?.value === 'shoutout' ? 'Personalized video message' : 'Perk name'}`}
                                        value={newPerk.label}
                                        onChange={e => setNewPerk(p => ({ ...p, label: e.target.value }))}
                                    />
                                </div>

                                {config?.hasUrl && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">URL</Label>
                                        <Input
                                            placeholder={config.urlPlaceholder}
                                            value={newPerk.url || ''}
                                            onChange={e => setNewPerk(p => ({ ...p, url: e.target.value }))}
                                        />
                                    </div>
                                )}

                                {config?.hasDescription && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                                        <Textarea
                                            rows={2}
                                            placeholder="More details about this perk"
                                            value={newPerk.description || ''}
                                            onChange={e => setNewPerk(p => ({ ...p, description: e.target.value }))}
                                        />
                                    </div>
                                )}

                                {config?.hasFrequency && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Claim Frequency</Label>
                                        <Select
                                            value={newPerk.claim_frequency || 'monthly'}
                                            onValueChange={(v: string) => setNewPerk(p => ({ ...p, claim_frequency: v as PerkItem['claim_frequency'] }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(FREQUENCY_LABELS).map(([val, lbl]) => (
                                                    <SelectItem key={val} value={val}>{lbl}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <Button size="sm" onClick={addPerk} disabled={!newPerk.label.trim()}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setAddingPerk(false); setNewPerk(EMPTY_PERK()) }}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {perks.length === 0 && !addingPerk && (
                            <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded-lg">
                                No perks yet — add what subscribers get with this tier
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex gap-3 shrink-0">
                    <Button className="flex-1" onClick={handleSave} disabled={isPending || uploading}>
                        {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : isEditing ? 'Save Changes' : 'Create Tier'}
                    </Button>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
