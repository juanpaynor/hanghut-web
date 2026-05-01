'use client'

import { useState } from 'react'
import { Plus, Trash2, Tag, Loader2, Calendar, Hash, TrendingUp, BarChart3, Smartphone } from 'lucide-react'
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
import { createPromoCode, deletePromoCode, getPromoCodes, togglePromoCode, PromoCode } from '@/lib/organizer/promo-actions'
import { format } from 'date-fns'

interface PromoCodeManagerProps {
    eventId: string
    initialCodes: PromoCode[]
}

export function PromoCodeManager({ eventId, initialCodes }: PromoCodeManagerProps) {
    const [codes, setCodes] = useState<PromoCode[]>(initialCodes)
    const [isCreating, setIsCreating] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    // Form State
    const [newCode, setNewCode] = useState('')
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>('percentage')
    const [amount, setAmount] = useState('')
    const [usageLimit, setUsageLimit] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [appOnly, setAppOnly] = useState(false)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        const formData = new FormData()
        formData.append('code', newCode)
        formData.append('discount_type', discountType)
        formData.append('discount_amount', amount)
        if (usageLimit) formData.append('usage_limit', usageLimit)
        if (expiresAt) formData.append('expires_at', expiresAt)
        formData.append('app_only', appOnly ? 'true' : 'false')

        const result = await createPromoCode(eventId, formData)

        if (result.error) {
            toast({
                title: "Error",
                description: result.error,
                variant: "destructive"
            })
        } else {
            toast({
                title: "Success",
                description: "Promo code created successfully",
            })
            refreshCodes()
            setNewCode('')
            setAmount('')
            setUsageLimit('')
            setExpiresAt('')
            setAppOnly(false)
            setIsCreating(false)
        }
        setIsLoading(false)
    }

    const refreshCodes = async () => {
        const { data } = await getPromoCodes(eventId)
        if (data) setCodes(data)
    }

    const handleToggle = async (id: string, currentStatus: boolean) => {
        const result = await togglePromoCode(id, !currentStatus, eventId)
        if (result.success) {
            setCodes(codes.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c))
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this promo code?')) return

        const result = await deletePromoCode(id, eventId)
        if (result.success) {
            setCodes(codes.filter(c => c.id !== id))
            toast({ title: "Deleted", description: "Promo code deleted" })
        }
    }

    // Analytics
    const totalUses = codes.reduce((sum, c) => sum + c.usage_count, 0)
    const activeCodes = codes.filter(c => c.is_active).length
    const bestCode = codes.length > 0
        ? codes.reduce((best, c) => c.usage_count > best.usage_count ? c : best, codes[0])
        : null

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
                {!isCreating && (
                    <Button onClick={() => setIsCreating(true)}>
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

            {isCreating && (
                <Card className="p-6 border-primary/20 bg-primary/5">
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Promo Code *</Label>
                                <Input
                                    value={newCode}
                                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                                    placeholder="e.g. EARLYBIRD"
                                    required
                                    maxLength={20}
                                />
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
                                    min="1"
                                />
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
                                    <p className="text-xs text-amber-700">Restrict this code to the HangHut app — won't work on web checkout</p>
                                </div>
                                <Switch checked={appOnly} onCheckedChange={setAppOnly} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Create Code
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

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
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDelete(code.id)}
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
