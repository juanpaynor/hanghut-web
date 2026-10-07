'use client'

import { useState } from 'react'
import { Plus, Trash2, Tag, Loader2, Calendar, Hash, TrendingUp, BarChart3, Smartphone, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import {
    createPromoCode, deletePromoCode, getPromoCodes, togglePromoCode, updatePromoCode,
    createExperiencePromoCode, deleteExperiencePromoCode,
    getExperiencePromoCodes, toggleExperiencePromoCode, updateExperiencePromoCode,
    PromoCode,
} from '@/lib/organizer/promo-actions'
import { format } from 'date-fns'

interface PromoCodeManagerProps {
    /** Exactly one of these. Mirrors promo_codes_one_target in the database. */
    eventId?: string
    experienceId?: string
    initialCodes: PromoCode[]
}

export function PromoCodeManager({ eventId, experienceId, initialCodes }: PromoCodeManagerProps) {
    // Resolved once so the handlers below read identically for both targets —
    // the alternative is a ternary at four separate call sites, which is exactly
    // where a copy-paste sends an experience's code to an event.
    const targetId = (experienceId ?? eventId)!
    const isExperience = !!experienceId
    const actions = isExperience
        ? {
              create: createExperiencePromoCode,
              list: getExperiencePromoCodes,
              toggle: toggleExperiencePromoCode,
              remove: deleteExperiencePromoCode,
              update: updateExperiencePromoCode,
          }
        : {
              create: createPromoCode,
              list: getPromoCodes,
              toggle: togglePromoCode,
              remove: deletePromoCode,
              update: updatePromoCode,
          }

    const [codes, setCodes] = useState<PromoCode[]>(initialCodes)
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    // Form State
    const [newCode, setNewCode] = useState('')
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>('percentage')
    const [amount, setAmount] = useState('')
    const [usageLimit, setUsageLimit] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [appOnly, setAppOnly] = useState(false)

    // The code currently being edited, when any. Carried as the row rather than
    // just the id because usage_count decides whether the name is editable.
    const editingCode = editingId ? codes.find(c => c.id === editingId) ?? null : null

    const resetForm = () => {
        setNewCode('')
        setDiscountType('percentage')
        setAmount('')
        setUsageLimit('')
        setExpiresAt('')
        setAppOnly(false)
        setIsCreating(false)
        setEditingId(null)
    }

    const startEdit = (code: PromoCode) => {
        setIsCreating(false)
        setEditingId(code.id)
        setNewCode(code.code)
        setDiscountType(code.discount_type)
        setAmount(String(code.discount_amount))
        setUsageLimit(code.usage_limit ? String(code.usage_limit) : '')
        // datetime-local wants a zoneless 'yyyy-MM-ddTHH:mm'; the column is a
        // timestamptz, so it has to be reduced to local wall-clock here or the
        // input renders empty and a silent save would wipe the expiry.
        setExpiresAt(code.expires_at ? format(new Date(code.expires_at), "yyyy-MM-dd'T'HH:mm") : '')
        setAppOnly(code.app_only)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        const formData = new FormData()
        formData.append('code', newCode)
        formData.append('discount_type', discountType)
        formData.append('discount_amount', amount)
        if (usageLimit) formData.append('usage_limit', usageLimit)
        if (expiresAt) formData.append('expires_at', expiresAt)
        formData.append('app_only', appOnly ? 'true' : 'false')

        const result = editingId
            ? await actions.update(editingId, targetId, formData)
            : await actions.create(targetId, formData)

        if (result.error) {
            toast({
                title: "Error",
                description: result.error,
                variant: "destructive"
            })
        } else {
            toast({
                title: "Success",
                description: editingId ? "Promo code updated" : "Promo code created successfully",
            })
            refreshCodes()
            resetForm()
        }
        setIsLoading(false)
    }

    const refreshCodes = async () => {
        const { data } = await actions.list(targetId)
        if (data) setCodes(data)
    }

    const handleToggle = async (id: string, currentStatus: boolean) => {
        const result = await actions.toggle(id, !currentStatus, targetId)
        if (result.success) {
            setCodes(codes.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c))
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this promo code?')) return

        const result = await actions.remove(id, targetId)
        if (result.error) {
            // This branch used to be missing entirely: a refused delete -- which is
            // every code that has ever been redeemed -- did nothing at all on screen.
            toast({ title: "Can't delete", description: result.error, variant: "destructive" })
            return
        }
        setCodes(codes.filter(c => c.id !== id))
        toast({ title: "Deleted", description: "Promo code deleted" })
    }

    // Analytics
    const totalUses = codes.reduce((sum, c) => sum + c.usage_count, 0)
    const activeCodes = codes.filter(c => c.is_active).length
    const bestCode = codes.length > 0
        ? codes.reduce((best, c) => c.usage_count > best.usage_count ? c : best, codes[0])
        : null

    // One form serves create and edit. They differ only in which action runs and
    // whether the name is editable, so a second copy would be two places to fix
    // every time a field is added.
    // One form serves create and edit. They differ only in which action runs and
    // whether the name is editable, so a second copy would be two places to fix
    // every time a field is added.
    const nameLocked = !!editingCode && editingCode.usage_count > 0
    const codeForm = (
        <Card className="p-6 border-primary/20 bg-primary/5">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Promo Code *</Label>
                        <Input
                            value={newCode}
                            onChange={e => setNewCode(e.target.value.toUpperCase())}
                            placeholder="e.g. EARLYBIRD"
                            required
                            maxLength={20}
                            disabled={nameLocked}
                        />
                        {nameLocked && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                                <Lock className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>
                                    Locked — redeemed {editingCode!.usage_count}&times; already, and it may be
                                    on a poster or in someone&apos;s messages.
                                </span>
                            </p>
                        )}
                    </div>
                    <div>
                        <Label>Discount Type</Label>
                        <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="percentage">Percentage Off (%)</SelectItem>
                                <SelectItem value="fixed_amount">Fixed Amount Off (₱)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label>Discount Value *</Label>
                        <Input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder={discountType === 'percentage' ? "e.g. 15" : "e.g. 100"}
                            min="0"
                            required
                        />
                    </div>
                    <div>
                        <Label>Usage Limit (Optional)</Label>
                        <Input
                            type="number"
                            value={usageLimit}
                            onChange={e => setUsageLimit(e.target.value)}
                            placeholder="Unlimited"
                            min={editingCode ? Math.max(editingCode.usage_count, 1) : 1}
                        />
                        {editingCode && editingCode.usage_count > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Can&apos;t go below {editingCode.usage_count} already redeemed.
                            </p>
                        )}
                    </div>
                    <div>
                        <Label>Expires At (Optional)</Label>
                        <Input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={e => setExpiresAt(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <Smartphone className="h-4 w-4 text-amber-600 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-amber-900">App Only</p>
                            <p className="text-xs text-amber-700">Restrict this code to the HangHut app — won&apos;t work on web checkout</p>
                        </div>
                        <Switch checked={appOnly} onCheckedChange={setAppOnly} />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={resetForm}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editingId ? 'Save Changes' : 'Create Code'}
                    </Button>
                </div>
            </form>
        </Card>
    )

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Tag className="h-6 w-6" />
                        Promotions
                    </h2>
                    <p className="text-muted-foreground">Create discount codes for your event</p>
                </div>
                {!isCreating && !editingId && (
                    <Button onClick={() => { setEditingId(null); setIsCreating(true) }}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Code
                    </Button>
                )}
            </div>

            {/* Analytics Summary */}
            {codes.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <Card className="p-4 bg-primary/5 border-primary/10">
                        <div className="flex items-center gap-2 mb-1">
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Codes</span>
                        </div>
                        <p className="text-2xl font-bold">{activeCodes} <span className="text-sm font-normal text-muted-foreground">/ {codes.length}</span></p>
                    </Card>
                    <Card className="p-4 bg-emerald-500/5 border-emerald-500/10">
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Uses</span>
                        </div>
                        <p className="text-2xl font-bold">{totalUses}</p>
                    </Card>
                    <Card className="p-4 bg-amber-500/5 border-amber-500/10">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Code</span>
                        </div>
                        <p className="text-2xl font-bold truncate">
                            {bestCode && bestCode.usage_count > 0 ? bestCode.code : '—'}
                        </p>
                    </Card>
                </div>
            )}

            {isCreating && codeForm}

            <div className="grid gap-4">
                {codes.length === 0 && !isCreating ? (
                    <Card className="p-8 text-center text-muted-foreground border-dashed">
                        No promo codes created yet.
                    </Card>
                ) : (
                    codes.map(code => {
                        const usagePercent = code.usage_limit
                            ? Math.round((code.usage_count / code.usage_limit) * 100)
                            : null
                        const isExpired = code.expires_at && new Date(code.expires_at) < new Date()
                        const isExhausted = code.usage_limit && code.usage_count >= code.usage_limit

                        // The form replaces the row it edits, so the values on screen
                        // are never two different versions of the same code.
                        if (editingId === code.id) {
                            return <div key={code.id}>{codeForm}</div>
                        }

                        return (
                            <Card key={code.id} className={`p-4 ${!code.is_active && 'opacity-60 bg-muted'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                                            %
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-lg tracking-wide">{code.code}</h3>
                                                <Badge variant="secondary" className="text-xs">
                                                    {code.discount_type === 'percentage'
                                                        ? `${code.discount_amount}% OFF`
                                                        : `₱${code.discount_amount} OFF`}
                                                </Badge>
                                                {isExpired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                                                {isExhausted && <Badge variant="destructive" className="text-xs">Limit Reached</Badge>}
                                                {code.app_only && (
                                                    <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                                                        <Smartphone className="h-3 w-3 mr-1" />App Only
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <Hash className="h-3 w-3" />
                                                    Used: <span className="font-medium text-foreground">{code.usage_count}</span>
                                                    {code.usage_limit ? ` / ${code.usage_limit}` : ''}
                                                </span>
                                                {code.expires_at && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {isExpired ? 'Expired' : 'Expires'}: {format(new Date(code.expires_at), 'MMM d, yyyy h:mm a')}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Usage progress bar */}
                                            {code.usage_limit && (
                                                <div className="mt-2">
                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full max-w-[200px]">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                usagePercent! >= 90 ? 'bg-red-500' :
                                                                usagePercent! >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                                            }`}
                                                            style={{ width: `${Math.min(usagePercent!, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs text-muted-foreground">Active</Label>
                                            <Switch
                                                checked={code.is_active}
                                                onCheckedChange={() => handleToggle(code.id, code.is_active)}
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => startEdit(code)}
                                            aria-label={`Edit ${code.code}`}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDelete(code.id)}
                                            aria-label={`Delete ${code.code}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        )
                    })
                )}
            </div>
        </div>
    )
}
