'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Wallet, Plus, AlertTriangle, ExternalLink, Shield, Clock, ArrowDown } from 'lucide-react'
import { initiateTopUp } from '@/lib/organizer/wallet-actions'

interface WalletCardProps {
    xenditAccountId: string | null
    receivable: number
    kycStatus: string | null
    xenditAvailableBalance: number
    pendingSettlement: number
}

export function WalletCard({
    xenditAccountId,
    receivable,
    kycStatus,
    xenditAvailableBalance,
    pendingSettlement,
}: WalletCardProps) {
    const [topUpOpen, setTopUpOpen] = useState(false)
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const isWalletReady = !!xenditAccountId

    const handleTopUp = async () => {
        const numAmount = Number(amount)
        if (!numAmount || numAmount < 100) {
            setError('Minimum top-up is ₱100')
            return
        }

        setLoading(true)
        setError('')

        const result = await initiateTopUp(numAmount)

        if (result.error) {
            setError(result.error)
            setLoading(false)
            return
        }

        if (result.paymentUrl) {
            window.open(result.paymentUrl, '_blank')
            setTopUpOpen(false)
            setAmount('')
        }

        setLoading(false)
    }

    // Not yet set up
    if (!xenditAccountId) {
        return (
            <Card className="p-6 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Xendit Wallet</p>
                        <p className="text-lg font-semibold text-muted-foreground">
                            Not activated
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Wallet will be activated once your account is fully verified
                        </p>
                    </div>
                    <Shield className="h-10 w-10 text-slate-400 opacity-80" />
                </div>
            </Card>
        )
    }

    return (
        <>
            <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-purple-500" />
                        <p className="text-sm font-medium text-muted-foreground">Xendit Wallet</p>
                        {kycStatus === 'verified' ? (
                            <Badge className="bg-green-500/10 text-green-600 text-[10px]">VERIFIED</Badge>
                        ) : kycStatus === 'submitted' ? (
                            <Badge className="bg-yellow-500/10 text-yellow-600 text-[10px]">KYC PENDING</Badge>
                        ) : (
                            <Badge className="bg-red-500/10 text-red-600 text-[10px]">NEEDS KYC</Badge>
                        )}
                    </div>

                    {isWalletReady && (
                        <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="text-purple-600 border-purple-300">
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Top Up
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Top Up Wallet</DialogTitle>
                                    <DialogDescription>
                                        Add funds to your wallet via GCash, bank transfer, or credit card.
                                        {receivable > 0 && (
                                            <span className="block mt-2 text-amber-600 font-medium">
                                                Note: ₱{receivable.toLocaleString()} will be auto-deducted to settle your platform fee balance.
                                            </span>
                                        )}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="topup-amount">Amount (₱)</Label>
                                        <Input
                                            id="topup-amount"
                                            type="number"
                                            min="100"
                                            max="500000"
                                            placeholder="1000"
                                            value={amount}
                                            onChange={(e) => {
                                                setAmount(e.target.value)
                                                setError('')
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Min: ₱100 · Max: ₱500,000
                                        </p>
                                    </div>

                                    {/* Quick amount buttons */}
                                    <div className="flex gap-2">
                                        {[500, 1000, 5000, 10000].map((preset) => (
                                            <Button
                                                key={preset}
                                                variant="outline"
                                                size="sm"
                                                className="flex-1"
                                                onClick={() => {
                                                    setAmount(String(preset))
                                                    setError('')
                                                }}
                                            >
                                                ₱{preset.toLocaleString()}
                                            </Button>
                                        ))}
                                    </div>

                                    {error && (
                                        <p className="text-sm text-destructive">{error}</p>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleTopUp}
                                        disabled={loading || !amount}
                                        className="w-full bg-purple-600 hover:bg-purple-700"
                                    >
                                        {loading ? 'Processing...' : (
                                            <>
                                                Proceed to Pay
                                                <ExternalLink className="ml-2 h-4 w-4" />
                                            </>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>

                {/* Balance Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Available Balance */}
                    <div className="p-4 rounded-lg bg-background/60 border border-border/50">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Wallet className="h-3.5 w-3.5 text-green-500" />
                            <p className="text-xs text-muted-foreground font-medium">Available Balance</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600">
                            ₱{xenditAvailableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Settled funds ready to withdraw
                        </p>
                    </div>

                    {/* Pending Settlement */}
                    <div className="p-4 rounded-lg bg-background/60 border border-border/50">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            <p className="text-xs text-muted-foreground font-medium">Pending Settlement</p>
                        </div>
                        <p className="text-2xl font-bold text-amber-600">
                            ₱{pendingSettlement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Incoming funds (settles in ~1 day)
                        </p>
                    </div>
                </div>

                {/* Platform fee receivable warning */}
                {receivable > 0 && (
                    <div className="flex items-center gap-1.5 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-600 font-medium">
                            ₱{receivable.toLocaleString()} owed to platform (from refunds) — will be auto-deducted from next payout or top-up
                        </p>
                    </div>
                )}
            </Card>
        </>
    )
}
