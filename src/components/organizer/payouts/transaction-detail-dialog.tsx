'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getTransactionDetail, refundTransaction, recordManualRefund, type TransactionDetail } from '@/lib/organizer/transaction-actions'
import { Loader2, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { getSettlementInfo, getPaymentChannel } from '@/lib/utils/settlement'
import { getProcessingFee } from '@/lib/payment/processing-fees'

const REASONS = [
    { value: 'Requested by customer', label: 'Requested by customer' },
    { value: 'Duplicate', label: 'Duplicate charge' },
    { value: 'Cancellation', label: 'Event cancelled' },
    { value: 'Fraudulent', label: 'Fraudulent' },
    { value: 'Others', label: 'Other reason' },
]

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={strong ? 'font-semibold' : 'font-medium'}>{value}</span>
        </div>
    )
}

export function TransactionDetailDialog({
    transactionId,
    open,
    onOpenChange,
}: {
    transactionId: string | null
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [detail, setDetail] = useState<TransactionDetail | null>(null)
    const [loading, setLoading] = useState(false)
    const [refundMode, setRefundMode] = useState(false)
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('Requested by customer')
    const [refunding, setRefunding] = useState(false)
    // Manual-refund (QRPH) fields
    const [channel, setChannel] = useState<'gcash' | 'bank' | 'cash'>('gcash')
    const [reference, setReference] = useState('')
    const [note, setNote] = useState('')

    useEffect(() => {
        if (!open || !transactionId) return
        setDetail(null); setRefundMode(false); setRefunding(false)
        setReference(''); setNote(''); setChannel('gcash')
        setLoading(true)
        getTransactionDetail(transactionId).then(r => {
            if (r.detail) { setDetail(r.detail); setAmount(String(r.detail.total_amount)) }
            else toast({ title: 'Could not load transaction', description: r.error, variant: 'destructive' })
            setLoading(false)
        })
    }, [open, transactionId])

    const alreadyRefunded = !!detail && (detail.intent_status === 'refunded' || !!detail.refunded_at)
    const canRefund = !!detail && detail.status === 'completed' && detail.intent_status === 'completed' && !alreadyRefunded && !!detail.purchase_intent_id
    // QRPH can't be reversed via Xendit — must be refunded off-platform and recorded manually.
    const isManualOnly = (detail?.payment_method || '').toLowerCase() === 'qrph'
    const settlement = detail ? getSettlementInfo(detail.created_at, detail.payment_method) : null
    const totalFees = detail ? detail.platform_fee + detail.payment_processing_fee + (detail.fixed_fee || 0) + (detail.vat || 0) : 0

    async function handleRefund() {
        if (!detail) return
        const amt = Number(amount)
        if (isNaN(amt) || amt <= 0 || amt > detail.total_amount) {
            toast({ title: 'Invalid amount', description: `Enter an amount between ₱1 and ₱${detail.total_amount.toLocaleString()}.`, variant: 'destructive' })
            return
        }
        if (isManualOnly && channel !== 'cash' && !reference.trim()) {
            toast({ title: 'Reference required', description: 'Enter the GCash/bank reference number for this disbursement.', variant: 'destructive' })
            return
        }
        setRefunding(true)
        const r = isManualOnly
            ? await recordManualRefund(detail.id, amt, channel, reference.trim(), note.trim())
            : await refundTransaction(detail.id, amt, reason)
        setRefunding(false)
        if (r.success) {
            toast({
                title: isManualOnly ? 'Manual refund recorded' : 'Refund issued',
                description: `₱${amt.toLocaleString()} ${isManualOnly ? 'recorded as refunded to the customer.' : 'refunded to the customer.'}`,
            })
            onOpenChange(false)
            router.refresh()
        } else {
            toast({ title: isManualOnly ? 'Could not record refund' : 'Refund failed', description: r.error, variant: 'destructive' })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Transaction details</DialogTitle>
                </DialogHeader>

                {loading || !detail ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="space-y-5">
                        {alreadyRefunded && (
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                <RotateCcw className="h-4 w-4" />
                                Refunded {detail.refunded_amount ? `₱${detail.refunded_amount.toLocaleString()}` : ''}{detail.refund_method === 'manual' ? ' (manual)' : ''}{detail.refunded_at ? ` on ${format(new Date(detail.refunded_at), 'MMM d, yyyy')}` : ''}.
                            </div>
                        )}

                        {/* Buyer + event */}
                        <div className="rounded-lg border p-4">
                            <p className="font-semibold">{detail.event_title}</p>
                            <p className="text-sm text-muted-foreground">{detail.buyer_name || 'Guest'}{detail.buyer_email ? ` · ${detail.buyer_email}` : ''}</p>
                            <p className="text-xs text-muted-foreground mt-1">{format(new Date(detail.created_at), 'MMM d, yyyy · h:mm a')}</p>
                        </div>

                        {/* Amount breakdown. Start from what the customer was actually
                            charged (total_amount) and subtract every deduction taken from
                            the sub-wallet — platform fee, booking fee, VAT and processing —
                            landing at the true net. Processing: use the value captured at
                            sale if present, else compute from method + total (PH rates fixed). */}
                        {(() => {
                            const processingFee = detail.payment_processing_fee > 0
                                ? detail.payment_processing_fee
                                : getProcessingFee(detail.payment_method, detail.total_amount)
                            const vat = detail.vat || 0
                            const netToWallet = detail.total_amount - detail.platform_fee - (detail.fixed_fee || 0) - vat - processingFee
                            return (
                        <div className="rounded-lg border p-4">
                            <Row label="Amount charged" value={`₱${detail.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                            <Row label="Platform fee" value={`-₱${detail.platform_fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                            {detail.fixed_fee ? <Row label="Booking fee" value={`-₱${detail.fixed_fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} /> : null}
                            {vat > 0 ? <Row label="VAT (12%)" value={`-₱${vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} /> : null}
                            <Row label="Processing fee" value={`-₱${processingFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                            <div className="border-t mt-1 pt-1">
                                <Row label="Net to your wallet" strong value={<span className="text-emerald-600">₱{netToWallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>} />
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">Processing fee and VAT are charged by Xendit and deducted from your wallet.</p>
                            {detail.pass_fees ? (
                                <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
                                    Your attendee covered the platform + booking fee on top of the ₱{detail.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ticket price (included in the amount charged above).
                                </p>
                            ) : null}
                        </div>
                            )
                        })()}

                        {/* Meta */}
                        <div className="rounded-lg border p-4">
                            <Row label="Channel" value={getPaymentChannel(detail.payment_method)} />
                            <Row label="Method" value={detail.payment_method?.toUpperCase() || 'UNKNOWN'} />
                            <Row label="Quantity" value={`${detail.quantity} ticket${detail.quantity === 1 ? '' : 's'}`} />
                            {settlement && <Row label="Settlement" value={settlement.status === 'settled' ? 'Settled' : `Pending · ETA ${format(settlement.etaDate, 'MMM d')}`} />}
                            {detail.xendit_transaction_id && <Row label="Ref" value={<span className="font-mono text-xs">{detail.xendit_transaction_id}</span>} />}
                        </div>

                        {/* Tickets */}
                        {detail.tickets.length > 0 && (
                            <div className="rounded-lg border p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tickets</p>
                                <ul className="space-y-1.5">
                                    {detail.tickets.map((t, i) => (
                                        <li key={i} className="flex items-center justify-between text-sm">
                                            <span>
                                                {t.tier || 'Ticket'}
                                                {t.seat_info?.label ? ` · ${t.seat_info.label}` : ''}
                                                {t.ticket_number ? <span className="text-muted-foreground"> · {t.ticket_number}</span> : ''}
                                            </span>
                                            <span className={`text-xs ${t.status === 'refunded' ? 'text-slate-500' : t.status === 'used' ? 'text-emerald-600' : 'text-foreground'}`}>{t.status}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Refund action */}
                        {canRefund && !refundMode && (
                            <Button variant="outline" className="w-full" onClick={() => setRefundMode(true)}>
                                <RotateCcw className="h-4 w-4 mr-2" /> {isManualOnly ? 'Record manual refund' : 'Issue refund'}
                            </Button>
                        )}

                        {canRefund && refundMode && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 space-y-3">
                                <div className="flex items-start gap-2 text-sm text-amber-800">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {isManualOnly
                                            ? 'QRPH can’t be refunded automatically. Pay the customer back directly (GCash/bank/cash), then record it here. A full refund voids the tickets. HangHut’s platform fee is not returned.'
                                            : 'Refunds are paid from your Xendit wallet and can’t be undone. A full refund also voids the tickets.'}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="refund-amount">Refund amount (max ₱{detail.total_amount.toLocaleString()})</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                                        <Input id="refund-amount" type="number" className="pl-7" value={amount}
                                            onChange={(e) => setAmount(e.target.value)} min={1} max={detail.total_amount} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">{Number(amount) >= detail.total_amount ? 'Full refund — tickets will be voided.' : 'Partial refund — tickets stay valid.'}</p>
                                </div>

                                {isManualOnly ? (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label>How did you pay the customer?</Label>
                                            <Select value={channel} onValueChange={(v) => setChannel(v as 'gcash' | 'bank' | 'cash')}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="gcash">GCash</SelectItem>
                                                    <SelectItem value="bank">Bank transfer</SelectItem>
                                                    <SelectItem value="cash">Cash</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="refund-ref">Reference no.{channel !== 'cash' && <span className="text-destructive"> *</span>}</Label>
                                            <Input id="refund-ref" value={reference} onChange={(e) => setReference(e.target.value)}
                                                placeholder={channel === 'cash' ? 'Optional' : 'e.g. GCash ref / bank txn no.'} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="refund-note">Note (optional)</Label>
                                            <Input id="refund-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-1.5">
                                        <Label>Reason</Label>
                                        <Select value={reason} onValueChange={setReason}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button variant="ghost" className="flex-1" onClick={() => setRefundMode(false)} disabled={refunding}>Cancel</Button>
                                    <Button className="flex-1" onClick={handleRefund} disabled={refunding}>
                                        {refunding
                                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isManualOnly ? 'Recording…' : 'Refunding…'}</>
                                            : <><CheckCircle2 className="h-4 w-4 mr-2" />{isManualOnly ? 'Record refund' : 'Confirm refund'}</>}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
