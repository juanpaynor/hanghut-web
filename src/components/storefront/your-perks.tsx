'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    Crown, Download, Link2, Package, Megaphone, Zap, Star, Gift,
    ExternalLink, CheckCircle2, Loader2, X,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PerkItem } from '@/lib/subscriptions/actions'
import { createClient } from '@/lib/supabase/client'

const PERK_ICONS: Record<PerkItem['type'], typeof Crown> = {
    gated_posts:      Crown,
    early_access:     Zap,
    digital_download: Download,
    community_link:   Link2,
    merch:            Package,
    shoutout:         Megaphone,
    custom:           Star,
}

interface Props {
    tierId: string
    subscriptionId: string
    partnerId: string
    partnerName: string
    perks: PerkItem[]
    existingClaims: { perk_type: string; claim_period: string; status: string }[]
}

function currentPeriod() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function YourPerks({ tierId, subscriptionId, partnerId, partnerName, perks, existingClaims }: Props) {
    const { toast } = useToast()
    const [claimModal, setClaimModal] = useState<{ perk: PerkItem } | null>(null)

    if (perks.length === 0) return null

    return (
        <>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-base">Your Perks</h3>
                    <Badge variant="default" className="text-xs gap-1 ml-auto">
                        <CheckCircle2 className="h-3 w-3" /> Active
                    </Badge>
                </div>

                <div className="space-y-2">
                    {perks.map((perk, i) => (
                        <PerkRow
                            key={i}
                            perk={perk}
                            tierId={tierId}
                            partnerName={partnerName}
                            existingClaims={existingClaims}
                            onClaim={() => setClaimModal({ perk })}
                        />
                    ))}
                </div>
            </div>

            {claimModal && (
                <ClaimModal
                    perk={claimModal.perk}
                    subscriptionId={subscriptionId}
                    partnerId={partnerId}
                    partnerName={partnerName}
                    onClose={() => setClaimModal(null)}
                    onSuccess={() => {
                        setClaimModal(null)
                        toast({ title: 'Claim submitted!', description: 'The organizer will be in touch to fulfil your perk.' })
                    }}
                />
            )}
        </>
    )
}

function PerkRow({
    perk, tierId, partnerName, existingClaims, onClaim,
}: {
    perk: PerkItem
    tierId: string
    partnerName: string
    existingClaims: { perk_type: string; claim_period: string; status: string }[]
    onClaim: () => void
}) {
    const Icon = PERK_ICONS[perk.type] ?? Gift
    const period = currentPeriod()

    const existingClaim = existingClaims.find(
        c => c.perk_type === perk.type && c.claim_period === period
    )

    const renderAction = () => {
        switch (perk.type) {
            case 'digital_download':
                return (
                    <Button size="sm" variant="outline" asChild>
                        <a href={`/api/perks/download?tierId=${tierId}`}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                        </a>
                    </Button>
                )

            case 'community_link':
                if (!perk.url) return <span className="text-xs text-muted-foreground">Link coming soon</span>
                return (
                    <Button size="sm" variant="outline" asChild>
                        {/* community_link goes directly — organizer controls invite limits */}
                        <a href={perk.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Join
                        </a>
                    </Button>
                )

            case 'merch':
            case 'shoutout':
                if (existingClaim) {
                    return (
                        <Badge variant={existingClaim.status === 'fulfilled' ? 'default' : 'secondary'} className="text-xs">
                            {existingClaim.status === 'fulfilled' ? '✓ Fulfilled' : 'Claimed'}
                        </Badge>
                    )
                }
                return (
                    <Button size="sm" variant="outline" onClick={onClaim}>
                        {perk.type === 'merch' ? <Package className="h-3.5 w-3.5 mr-1.5" /> : <Megaphone className="h-3.5 w-3.5 mr-1.5" />}
                        {perk.type === 'merch' ? 'Claim' : 'Request'}
                    </Button>
                )

            case 'early_access':
                return <span className="text-xs text-muted-foreground">Applied automatically to upcoming events</span>

            case 'gated_posts':
                return <span className="text-xs text-muted-foreground">Posts visible below</span>

            default:
                return null
        }
    }

    return (
        <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-background border border-border/50">
            <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{perk.label}</p>
                    {perk.description && (
                        <p className="text-xs text-muted-foreground truncate">{perk.description}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0">
                {renderAction()}
            </div>
        </div>
    )
}

function ClaimModal({
    perk, subscriptionId, partnerId, partnerName, onClose, onSuccess,
}: {
    perk: PerkItem
    subscriptionId: string
    partnerId: string
    partnerName: string
    onClose: () => void
    onSuccess: () => void
}) {
    const supabase = createClient()
    const [isPending, startTransition] = useTransition()

    // Merch fields
    const [name, setName] = useState('')
    const [address, setAddress] = useState('')
    const [size, setSize] = useState('')
    const [notes, setNotes] = useState('')

    // Shoutout fields
    const [request, setRequest] = useState('')
    const [platform, setPlatform] = useState('Instagram')

    const handleSubmit = () => {
        startTransition(async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const details = perk.type === 'merch'
                ? { name, address, ...(size ? { size } : {}), ...(notes ? { notes } : {}) }
                : { request, platform }

            const { error } = await supabase
                .from('subscription_claims')
                .insert({
                    subscription_id: subscriptionId,
                    fan_id: user.id,
                    partner_id: partnerId,
                    perk_type: perk.type,
                    perk_label: perk.label,
                    claim_period: currentPeriod(),
                    details,
                    status: 'pending',
                })

            if (error) {
                if (error.code === '23505') {
                    // Duplicate — already claimed this period
                    onClose()
                    return
                }
                console.error('Claim error:', error)
                return
            }

            onSuccess()
        })
    }

    const isMerch = perk.type === 'merch'
    const canSubmit = isMerch ? (name.trim() && address.trim()) : request.trim()

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="bg-background rounded-2xl w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="font-bold">{isMerch ? `Claim your ${perk.label}` : `Request a ${perk.label}`}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {isMerch ? (
                        <>
                            <div className="space-y-1.5">
                                <Label>Full Name <span className="text-destructive">*</span></Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Cruz" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Shipping Address <span className="text-destructive">*</span></Label>
                                <Textarea
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder="123 Main St, Makati, Metro Manila"
                                    rows={2}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Size <span className="text-muted-foreground text-xs">(if applicable)</span></Label>
                                <Input value={size} onChange={e => setSize(e.target.value)} placeholder="M, L, XL…" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions" />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <Label>Your Request <span className="text-destructive">*</span></Label>
                                <Textarea
                                    value={request}
                                    onChange={e => setRequest(e.target.value)}
                                    placeholder={`e.g. Shoutout to my sister on her birthday from ${partnerName}!`}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Platform</Label>
                                <Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Instagram, TikTok, Facebook…" />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex gap-2 p-5 pt-0">
                    <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancel</Button>
                    <Button className="flex-1" disabled={!canSubmit || isPending} onClick={handleSubmit}>
                        {isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Submitting…</> : 'Submit'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
