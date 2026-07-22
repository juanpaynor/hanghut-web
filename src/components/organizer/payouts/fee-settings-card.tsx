'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { setPassFeesToCustomer } from '@/lib/organizer/payout-actions'
import { Receipt, Loader2 } from 'lucide-react'

interface FeeSettingsCardProps {
    /** Current pass_fees_to_customer value for this partner. */
    passFees: boolean
    /** Platform commission % (e.g. 2). */
    platformPct: number
    /** Fixed booking fee per ticket (₱). */
    fixedFee: number
}

export function FeeSettingsCard({ passFees, platformPct, fixedFee }: FeeSettingsCardProps) {
    const [enabled, setEnabled] = useState(passFees)
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    const handleToggle = (next: boolean) => {
        const previous = enabled
        setEnabled(next) // optimistic
        startTransition(async () => {
            const res = await setPassFeesToCustomer(next)
            if (!res.success) {
                setEnabled(previous) // revert
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
                return
            }
            toast({
                title: next ? 'Fees now passed to attendees' : "You're now covering the fees",
                description: next
                    ? `Attendees pay the ${platformPct}% + ₱${fixedFee} platform fee on top of the ticket price.`
                    : `The ${platformPct}% + ₱${fixedFee} platform fee comes out of your payout.`,
            })
        })
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Platform Fees</CardTitle>
                        <CardDescription>
                            Choose who covers the {platformPct}% + ₱{fixedFee} per-ticket platform fee.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="pass-fees" className="flex items-center gap-2 text-base">
                            Pass fees to attendees
                            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {enabled
                                ? `On — attendees pay the ${platformPct}% + ₱${fixedFee} on top. You receive the full ticket price.`
                                : `Off — the ${platformPct}% + ₱${fixedFee} is deducted from your payout. Attendees pay the ticket price only.`}
                        </p>
                    </div>
                    <Switch
                        id="pass-fees"
                        checked={enabled}
                        onCheckedChange={handleToggle}
                        disabled={isPending}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    Either way, the payment processing fee charged by our payment provider is always
                    covered by you and is deducted at settlement.
                </p>
            </CardContent>
        </Card>
    )
}
