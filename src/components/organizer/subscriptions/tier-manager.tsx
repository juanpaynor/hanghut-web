'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Plus, Crown, Users, Pencil, FileText, Link2, Package, Mic2, Star, Ticket } from 'lucide-react'
import { updateSubscriptionTier, type PerkItem } from '@/lib/subscriptions/actions'
import { TierEditor } from './tier-editor'

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
    tiers: Tier[]
    partnerId: string
}

type IconFC = React.FC<{ className?: string }>
const PERK_ICONS: Record<PerkItem['type'], IconFC> = {
    gated_posts:      FileText,
    early_access:     Ticket,
    digital_download: Link2,
    community_link:   Users,
    merch:            Package,
    shoutout:         Mic2,
    custom:           Star,
}

export function TierManager({ tiers: initial, partnerId }: Props) {
    const { toast } = useToast()
    const [tiers, setTiers] = useState<Tier[]>(initial)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editingTier, setEditingTier] = useState<Tier | undefined>(undefined)
    const [isPending, startTransition] = useTransition()

    const openCreate = () => { setEditingTier(undefined); setEditorOpen(true) }
    const openEdit = (tier: Tier) => { setEditingTier(tier); setEditorOpen(true) }

    const handleSaved = (saved: Tier) => {
        setTiers(prev => {
            const exists = prev.find(t => t.id === saved.id)
            return exists ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]
        })
    }

    const handleToggleActive = (tierId: string, current: boolean) => {
        startTransition(async () => {
            const result = await updateSubscriptionTier(tierId, { is_active: !current })
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                setTiers(prev => prev.map(t => t.id === tierId ? { ...t, is_active: !current } : t))
            }
        })
    }

    return (
        <>
            {tiers.length === 0 ? (
                <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
                    <Crown className="h-10 w-10 text-muted-foreground/40 mb-4" />
                    <p className="font-semibold text-lg mb-1">No tiers yet</p>
                    <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                        Create your first membership tier to start accepting subscribers.
                    </p>
                    <Button onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-2" /> Create First Tier
                    </Button>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tiers.map(tier => (
                        <Card key={tier.id} className="overflow-hidden flex flex-col">
                            {/* Cover image */}
                            {tier.image_url ? (
                                <div className="relative h-36 bg-muted overflow-hidden">
                                    <img src={tier.image_url} alt={tier.name} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                    <Badge
                                        variant={tier.is_active ? 'default' : 'secondary'}
                                        className="absolute top-2 right-2 text-xs"
                                    >
                                        {tier.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            ) : (
                                <div className="h-24 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
                                    <Crown className="h-8 w-8 text-primary/40" />
                                    <Badge
                                        variant={tier.is_active ? 'default' : 'secondary'}
                                        className="absolute top-2 right-2 text-xs"
                                    >
                                        {tier.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            )}

                            <div className="p-5 flex flex-col gap-3 flex-1">
                                <div>
                                    <p className="font-semibold text-lg leading-tight">{tier.name}</p>
                                    <p className="text-2xl font-bold text-primary mt-0.5">
                                        ₱{Number(tier.price_monthly).toLocaleString()}
                                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                    </p>
                                    {tier.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{tier.description}</p>
                                    )}
                                </div>

                                {/* Perks preview */}
                                {tier.perks.length > 0 && (
                                    <div className="space-y-1">
                                        {tier.perks.slice(0, 3).map((perk, i) => {
                                            const Icon = PERK_ICONS[perk.type] || Star
                                            return (
                                                <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Icon className="h-3 w-3 text-primary shrink-0" />
                                                    <span className="truncate">{perk.label}</span>
                                                </div>
                                            )
                                        })}
                                        {tier.perks.length > 3 && (
                                            <p className="text-xs text-muted-foreground pl-5">+{tier.perks.length - 3} more perks</p>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center justify-between pt-2 border-t border-border mt-auto">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Users className="h-3.5 w-3.5" />
                                        <span>Accepting subs</span>
                                        <Switch
                                            checked={tier.is_active}
                                            onCheckedChange={() => handleToggleActive(tier.id, tier.is_active)}
                                            disabled={isPending}
                                            className="ml-1 scale-75"
                                        />
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(tier)} className="h-7 px-2 text-xs gap-1">
                                        <Pencil className="h-3 w-3" /> Edit
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {/* Add new tile */}
                    <button
                        onClick={openCreate}
                        className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors min-h-[200px]"
                    >
                        <Plus className="h-6 w-6" />
                        <span className="text-sm font-medium">Add Tier</span>
                    </button>
                </div>
            )}

            <TierEditor
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                onSaved={handleSaved}
                tier={editingTier}
                partnerId={partnerId}
            />
        </>
    )
}
