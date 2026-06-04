'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
    Crown, Ticket, Settings, LogOut, Calendar, MapPin,
    CheckCircle2, Clock, XCircle, Download, Link2,
    Package, Megaphone, Zap, Star, Gift, QrCode, User,
} from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { cancelSubscription } from '@/lib/subscriptions/actions'
import { YourPerks } from '@/components/storefront/your-perks'
import type { PerkItem } from '@/lib/subscriptions/actions'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────
interface Subscription {
    id: string
    status: 'active' | 'grace_period' | 'cancelled' | 'expired'
    current_period_end: string
    cancelled_at: string | null
    created_at: string
    subscription_tiers: { id: string; name: string; price_monthly: number; perks: PerkItem[] | null } | null
    partners: { id: string; business_name: string; slug: string; profile_photo_url: string | null } | null
}

interface TicketRow {
    id: string
    ticket_number: string
    qr_code: string | null
    status: string
    tier: string | null
    checked_in_at: string | null
    created_at: string
    events: { id: string; title: string; start_datetime: string; venue_name: string; cover_image_url: string | null } | null
}

interface Claim {
    perk_type: string
    claim_period: string
    status: string
    partner_id: string
}

interface Props {
    user: { id: string; email: string }
    profile: { display_name: string | null; email: string | null; profile_photo_url: string | null } | null
    subscriptions: Subscription[]
    tickets: TicketRow[]
    claims: Claim[]
}

const SUB_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    active:       { label: 'Active',       variant: 'default' },
    grace_period: { label: 'Grace Period', variant: 'secondary' },
    cancelled:    { label: 'Cancelled',    variant: 'outline' },
    expired:      { label: 'Expired',      variant: 'destructive' },
}

// ─── Main component ───────────────────────────────────────────
export function AccountDashboard({ user, profile, subscriptions, tickets, claims }: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const supabase = createClient()
    const [isPending, startTransition] = useTransition()

    const [subs, setSubs] = useState(subscriptions)
    const displayName = profile?.display_name || user.email.split('@')[0]
    const initials = displayName.slice(0, 2).toUpperCase()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/')
        router.refresh()
    }

    const handleCancel = (subId: string) => {
        if (!confirm('Cancel your subscription? You keep access until the end of your current period.')) return
        startTransition(async () => {
            const result = await cancelSubscription(subId)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                return
            }
            setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: 'cancelled' as const, cancelled_at: new Date().toISOString() } : s))
            toast({ title: 'Subscription cancelled', description: 'You keep access until your period ends.' })
        })
    }

    const upcoming = tickets.filter(t => {
        const event = t.events as any
        return event && new Date(event.start_datetime) >= new Date()
    })
    const past = tickets.filter(t => {
        const event = t.events as any
        return event && new Date(event.start_datetime) < new Date()
    })

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b bg-card">
                <div className="container mx-auto px-4 py-6 max-w-3xl">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {profile?.profile_photo_url ? (
                                <Image
                                    src={profile.profile_photo_url}
                                    alt={displayName}
                                    width={56}
                                    height={56}
                                    className="rounded-full object-cover"
                                />
                            ) : (
                                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                                    <span className="text-lg font-bold text-primary">{initials}</span>
                                </div>
                            )}
                            <div>
                                <p className="font-bold text-lg leading-tight">{displayName}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground gap-1.5">
                            <LogOut className="h-4 w-4" />
                            Sign out
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="container mx-auto px-4 py-8 max-w-3xl">
                <Tabs defaultValue="memberships">
                    <TabsList className="grid grid-cols-3 w-full mb-8">
                        <TabsTrigger value="memberships" className="gap-1.5">
                            <Crown className="h-4 w-4" />
                            Memberships
                            {subs.filter(s => s.status === 'active' || s.status === 'grace_period').length > 0 && (
                                <Badge variant="default" className="h-4 px-1 text-[10px] ml-1">
                                    {subs.filter(s => s.status === 'active' || s.status === 'grace_period').length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="tickets" className="gap-1.5">
                            <Ticket className="h-4 w-4" />
                            Tickets
                            {upcoming.length > 0 && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                                    {upcoming.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="gap-1.5">
                            <Settings className="h-4 w-4" />
                            Settings
                        </TabsTrigger>
                    </TabsList>

                    {/* ── MEMBERSHIPS ── */}
                    <TabsContent value="memberships" className="space-y-4">
                        {subs.length === 0 ? (
                            <Card className="p-12 flex flex-col items-center text-center border-dashed">
                                <Crown className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="font-semibold">No memberships yet</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Subscribe to an organiser's membership to unlock exclusive perks.
                                </p>
                            </Card>
                        ) : (
                            subs.map(sub => {
                                const partner = sub.partners as any
                                const tier = sub.subscription_tiers as any
                                const badge = SUB_STATUS[sub.status] ?? { label: sub.status, variant: 'outline' as const }
                                const isActive = sub.status === 'active' || sub.status === 'grace_period'
                                const subClaims = claims.filter(c => c.partner_id === partner?.id)

                                return (
                                    <Card key={sub.id} className="overflow-hidden">
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                                                <div className="flex items-center gap-3">
                                                    {partner?.profile_photo_url ? (
                                                        <Image
                                                            src={partner.profile_photo_url}
                                                            alt={partner.business_name}
                                                            width={44}
                                                            height={44}
                                                            className="rounded-full object-cover shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                            <span className="text-sm font-bold text-primary">
                                                                {partner?.business_name?.slice(0, 2).toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <Link href={`/${partner?.slug}/membership`} className="font-bold hover:underline">
                                                            {partner?.business_name}
                                                        </Link>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="text-sm text-muted-foreground">{tier?.name}</span>
                                                            <span className="text-xs text-muted-foreground">·</span>
                                                            <span className="text-sm font-medium">₱{Number(tier?.price_monthly).toLocaleString()}/mo</span>
                                                            <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-muted-foreground">
                                                    {sub.status === 'cancelled'
                                                        ? `Access until ${format(new Date(sub.current_period_end), 'MMM d, yyyy')}`
                                                        : isActive
                                                            ? `Renews ${format(new Date(sub.current_period_end), 'MMM d, yyyy')}`
                                                            : `Expired ${format(new Date(sub.current_period_end), 'MMM d, yyyy')}`
                                                    }
                                                </div>
                                            </div>

                                            {/* Perks — only for active subs */}
                                            {isActive && tier?.perks?.length > 0 && sub.id && (
                                                <YourPerks
                                                    tierId={tier.id}
                                                    subscriptionId={sub.id}
                                                    partnerId={partner.id}
                                                    partnerName={partner.business_name}
                                                    perks={tier.perks}
                                                    existingClaims={subClaims}
                                                />
                                            )}
                                        </div>

                                        {isActive && sub.status !== 'cancelled' && (
                                            <div className="px-5 pb-4">
                                                <button
                                                    onClick={() => handleCancel(sub.id)}
                                                    disabled={isPending}
                                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    Cancel membership
                                                </button>
                                            </div>
                                        )}
                                    </Card>
                                )
                            })
                        )}
                    </TabsContent>

                    {/* ── TICKETS ── */}
                    <TabsContent value="tickets" className="space-y-6">
                        {tickets.length === 0 ? (
                            <Card className="p-12 flex flex-col items-center text-center border-dashed">
                                <Ticket className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="font-semibold">No tickets yet</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Your purchased event tickets will appear here.
                                </p>
                            </Card>
                        ) : (
                            <>
                                {upcoming.length > 0 && (
                                    <section className="space-y-3">
                                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                            Upcoming ({upcoming.length})
                                        </h2>
                                        {upcoming.map(ticket => (
                                            <TicketCard key={ticket.id} ticket={ticket} />
                                        ))}
                                    </section>
                                )}
                                {past.length > 0 && (
                                    <section className="space-y-3">
                                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                            Past ({past.length})
                                        </h2>
                                        {past.map(ticket => (
                                            <TicketCard key={ticket.id} ticket={ticket} />
                                        ))}
                                    </section>
                                )}
                            </>
                        )}
                    </TabsContent>

                    {/* ── SETTINGS ── */}
                    <TabsContent value="settings">
                        <AccountSettings userId={user.id} email={user.email} displayName={profile?.display_name ?? ''} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

// ─── Ticket card ──────────────────────────────────────────────
function TicketCard({ ticket }: { ticket: TicketRow }) {
    const [showQr, setShowQr] = useState(false)
    const event = ticket.events as any
    if (!event) return null

    const isPast = new Date(event.start_datetime) < new Date()
    const isCheckedIn = !!ticket.checked_in_at

    return (
        <Card className={`overflow-hidden ${isPast ? 'opacity-60' : ''}`}>
            <div className="flex gap-0">
                {event.cover_image_url && (
                    <div className="relative w-24 shrink-0">
                        <Image src={event.cover_image_url} alt={event.title} fill className="object-cover" />
                    </div>
                )}
                <div className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold leading-tight line-clamp-2">{event.title}</p>
                        {isCheckedIn && (
                            <Badge variant="default" className="text-xs shrink-0 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Attended
                            </Badge>
                        )}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {format(new Date(event.start_datetime), 'EEE, MMM d yyyy · h:mm a')}
                        </p>
                        <p className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {event.venue_name}
                        </p>
                        {ticket.tier && (
                            <p className="flex items-center gap-1.5">
                                <Ticket className="h-3 w-3 shrink-0" />
                                {ticket.tier} · #{ticket.ticket_number}
                            </p>
                        )}
                    </div>

                    {!isPast && ticket.qr_code && (
                        <div className="mt-3">
                            {showQr ? (
                                <div className="space-y-2">
                                    <img
                                        src={ticket.qr_code}
                                        alt="QR Code"
                                        className="w-32 h-32 rounded-lg border"
                                    />
                                    <button
                                        onClick={() => setShowQr(false)}
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        Hide QR
                                    </button>
                                </div>
                            ) : (
                                <Button size="sm" variant="outline" onClick={() => setShowQr(true)} className="gap-1.5">
                                    <QrCode className="h-3.5 w-3.5" />
                                    Show QR
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

// ─── Settings tab ─────────────────────────────────────────────
function AccountSettings({ userId, email, displayName: initial }: { userId: string; email: string; displayName: string }) {
    const { toast } = useToast()
    const supabase = createClient()
    const [isPending, startTransition] = useTransition()
    const [displayName, setDisplayName] = useState(initial)

    const handleSave = () => {
        startTransition(async () => {
            const { error } = await supabase
                .from('users')
                .update({ display_name: displayName.trim() })
                .eq('id', userId)

            if (error) {
                toast({ title: 'Error', description: error.message, variant: 'destructive' })
            } else {
                toast({ title: 'Profile updated' })
            }
        })
    }

    return (
        <div className="space-y-6 max-w-md">
            <Card className="p-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" /> Profile
                </h3>
                <div className="space-y-1.5">
                    <Label>Display Name</Label>
                    <Input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Your display name"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={email} disabled className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed here. Use the HangHut app.</p>
                </div>
                <Button onClick={handleSave} disabled={isPending || !displayName.trim()}>
                    {isPending ? 'Saving…' : 'Save Changes'}
                </Button>
            </Card>

            <Card className="p-6 space-y-3">
                <h3 className="font-semibold text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground">
                    To delete your account, please contact us via the HangHut app or email{' '}
                    <a href="mailto:support@hanghut.com" className="text-primary hover:underline">support@hanghut.com</a>.
                </p>
            </Card>
        </div>
    )
}
