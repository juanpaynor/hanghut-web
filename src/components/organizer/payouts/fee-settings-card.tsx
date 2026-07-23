'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { setFeePassing } from '@/lib/organizer/payout-actions'
import { Receipt, Loader2 } from 'lucide-react'

interface FeeSettingsCardProps {
    /** Whether the ₱15 booking fee is currently charged to the attendee. */
    passFixed: boolean
    /** Whether the 2% commission is currently charged to the attendee. */
    passPercentage: boolean
    /** Platform commission % (e.g. 2). */
    platformPct: number
    /** Fixed booking fee per ticket (₱). */
    fixedFee: number
}

export function FeeSettingsCard({ passFixed, passPercentage, platformPct, fixedFee }: FeeSettingsCardProps) {
    const [fixedOn, setFixedOn] = useState(passFixed)
    const [pctOn, setPctOn] = useState(passPercentage)
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    // Persist both flags together. `which` names the toggle the user just moved so we
    // can roll back exactly that one if the write fails.
    const persist = (nextFixed: boolean, nextPct: boolean, which: 'fixed' | 'pct') => {
        const prevFixed = fixedOn
        const prevPct = pctOn
        setFixedOn(nextFixed)
        setPctOn(nextPct)
        startTransition(async () => {
            const res = await setFeePassing(nextFixed, nextPct)
            if (!res.success) {
                setFixedOn(prevFixed)
                setPctOn(prevPct)
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
                return
            }
            toast({
                title: 'Fee settings updated',
                description:
                    which === 'fixed'
                        ? nextFixed
                            ? `Attendees now cover the ₱${fixedFee} booking fee.`
                            : `You now cover the ₱${fixedFee} booking fee.`
                        : nextPct
                        ? `Attendees now cover the ${platformPct}% commission.`
                        : `You now cover the ${platformPct}% commission.`,
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
                            HangHut&apos;s fee is a ₱{fixedFee} booking fee + {platformPct}% commission per ticket.
                            Choose who covers each part.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Booking fee (₱15) toggle */}
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="pass-fixed" className="flex items-center gap-2 text-base">
                            ₱{fixedFee} booking fee
                            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {fixedOn
                                ? `Charged to the attendee — added on top of the ticket price at checkout.`
                                : `Covered by you — deducted from your payout.`}
                        </p>
                    </div>
                    <Switch
                        id="pass-fixed"
                        checked={fixedOn}
                        onCheckedChange={(v) => persist(v, pctOn, 'fixed')}
                        disabled={isPending}
                    />
                </div>

                {/* Commission (2%) toggle */}
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="pass-pct" className="flex items-center gap-2 text-base">
                            {platformPct}% commission
                            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {pctOn
                                ? `Charged to the attendee — added on top of the ticket price at checkout.`
                                : `Covered by you — deducted from your payout.`}
                        </p>
                    </div>
                    <Switch
                        id="pass-pct"
                        checked={pctOn}
                        onCheckedChange={(v) => persist(fixedOn, v, 'pct')}
                        disabled={isPending}
                    />
                </div>

                <p className="text-xs text-muted-foreground pt-1">
                    Both the booking fee and commission are HangHut&apos;s platform fee — these toggles only
                    decide who pays each. The payment processing fee charged by our payment provider is always
                    covered by you and is deducted at settlement.
                </p>
            </CardContent>
        </Card>
    )
}
