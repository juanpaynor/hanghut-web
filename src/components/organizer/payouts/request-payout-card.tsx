'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPayout } from '@/lib/organizer/payout-actions'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

interface RequestPayoutCardProps {
    balance: number
    partnerId: string
    hasBank: boolean
}

export function RequestPayoutCard({ balance, partnerId, hasBank }: RequestPayoutCardProps) {
    const { toast } = useToast()
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    async function handleRequest() {
        if (!amount) return
        const val = parseInt(amount)
        if (isNaN(val) || val <= 0) {
            toast({ title: 'Invalid Amount', description: 'Please enter a valid amount.', variant: 'destructive' })
            return
        }
        if (val > balance) {
            toast({ title: 'Insufficient Balance', description: `You can only request up to ₱${balance.toLocaleString()}`, variant: 'destructive' })
            return
        }

        setIsLoading(true)
        try {
            const res = await requestPayout(partnerId, val)
            if (res.success) {
                toast({ title: 'Success', description: res.message })
                setAmount('')
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' })
            }
        } catch (error) {
            toast({ title: 'Request Failed', description: 'Something went wrong.', variant: 'destructive' })
        } finally {
            setIsLoading(false)
        }
    }

    if (!hasBank) {
        return (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardHeader>
                    <CardTitle className="text-yellow-700">Setup Bank Account</CardTitle>
                    <CardDescription className="text-yellow-600">
                        You need to add a bank account before you can request payouts.
                        Go to the "Settings" tab to add one.
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    if (balance <= 0) {
        return (
            <Card className="opacity-75">
                <CardHeader>
                    <CardTitle>Payout Request</CardTitle>
                    <CardDescription>You need a positive balance to request a payout.</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Request Payout</CardTitle>
                <CardDescription>
                    Enter amount to withdraw.
                    <br />
                    <span className="text-xs text-muted-foreground">
                        Amounts under ₱50,000 may be processed immediately.
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="amount">Amount (PHP)</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0.00"
                            className="pl-8 text-lg font-bold"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            max={balance}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Available: ₱{balance.toLocaleString()}</span>
                        <button
                            type="button"
                            onClick={() => setAmount(balance.toString())}
                            className="text-primary hover:underline"
                        >
                            Max
                        </button>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    className="w-full"
                    onClick={handleRequest}
                    disabled={isLoading || !amount || Number(amount) <= 0}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        'Submit Request'
                    )}
                </Button>
            </CardFooter>
        </Card>
    )
}
