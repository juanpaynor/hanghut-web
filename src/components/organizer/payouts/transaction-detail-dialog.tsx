'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getTransactionDetail, refundTransaction, recordManualRefund, sendDisbursementRefund, type TransactionDetail } from '@/lib/organizer/transaction-actions'
import { Loader2, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { getSettlementInfo, getPaymentChannel } from '@/lib/utils/settlement'
import { getProcessingFee } from '@/lib/payment/processing-fees'
import { disbursementFee, isEwalletChannel } from '@/lib/organizer/disbursement-fees'
import { PHILIPPINE_BANKS } from '@/lib/constants/banks'

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
    // QRPH refund method: 'auto' = send via Xendit disbursement, 'manual' = record off-platform.
    const [qrphMode, setQrphMode] = useState<'auto' | 'manual'>('auto')
    const [disbChannel, setDisbChannel] = useState<string>('PH_GCASH')
    const [accountNumber, setAccountNumber] = useState('')
    const [accountName, setAccountName] = useState('')
    // Persistent, specific failure message (survives so the organizer can read + fix + retry).
    const [refundError, setRefundError] = useState<{ title: string; detail?: string; hint?: string } | null>(null)

    useEffect(() => {
        if (!open || !transactionId) return
        setDetail(null); setRefundMode(false); setRefunding(false)
        setReference(''); setNote(''); setChannel('gcash')
        setQrphMode('auto'); setDisbChannel('PH_GCASH'); setAccountNumber(''); setAccountName('')
        setRefundError(null)
        // (disbChannel default GCash — the most common QRPH refund destination)
        setLoading(true)
        getTransactionDetail(transactionId).then(r => {
            if (r.detail) {
                setDetail(r.detail); setAmount(String(r.detail.total_amount))
                // Prefill the disbursement destination from the phone captured at checkout
                // (in PH this is almost always the GCash-linked number). Organizer confirms/edits.
                setAccountName(r.detail.buyer_name || '')
                setAccountNumber(r.detail.buyer_phone || '')
            }
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

    // For QRPH: 'auto' sends a real Xendit transfer, 'manual' just records an off-platform payout.
    const isAutoDisbursement = isManualOnly && qrphMode === 'auto'
    const transferFee = disbursementFee(disbChannel)

    // Turn a refund failure (code + raw message) into a specific, actionable message.
    function describeRefundFailure(r: { error?: string; code?: string; available_balance?: number; required?: number; shortfall?: number }): { title: string; detail?: string; hint?: string } {
        const peso = (n?: number) => (typeof n === 'number' ? `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '')
        switch (r.code) {
            case 'INSUFFICIENT_BALANCE':
            case 'INSUFFICIENT_SUBWALLET_BALANCE':
                return {
                    title: 'Not enough wallet balance',
                    detail: r.required != null ? `This refund needs ${peso(r.required)} but your wallet has ${peso(r.available_balance)}${r.shortfall ? ` (short ${peso(r.shortfall)})` : ''}.` : r.error,
                    hint: 'Top up your Xendit wallet or wait for more ticket sales, then try again.',
                }
            case 'PAYOUT_FAILED':
                return {
                    title: 'Transfer was rejected',
                    detail: r.error,
                    hint: 'Check the account name and number match the recipient’s account exactly, or pick a different channel. You can also switch to “Record manual refund”.',
                }
            case 'REFUND_IN_PROGRESS':
                return { title: 'A refund is already in progress', detail: 'This order already has a refund being processed.', hint: 'Close and reopen to see its latest status before trying again.' }
            case 'ALREADY_REFUNDED':
                return { title: 'Already refunded', detail: 'This order has already been fully refunded.' }
            case 'MISSING_XENDIT_REF':
                return { title: 'Couldn’t find the original payment', detail: r.error, hint: 'This payment may be too old to auto-reverse. Use “Record manual refund” or a bank/e-wallet transfer instead.' }
            case 'NOT_QRPH':
                return { title: 'Wrong refund method', detail: 'Bank/e-wallet transfers apply to QRPH orders only.' }
            case 'OVER_REFUND':
                return { title: 'Amount too high', detail: r.error, hint: 'Lower the amount to what’s still refundable on this order.' }
            case 'NETWORK':
                return { title: 'Connection problem', detail: r.error, hint: 'Check your connection and try again — no money has moved.' }
            default:
                return { title: 'Refund failed', detail: r.error || 'Something went wrong. No money has moved.' }
        }
    }

    async function handleRefund() {
        if (!detail) return
        setRefundError(null)
        const amt = Number(amount)
        if (isNaN(amt) || amt <= 0 || amt > detail.total_amount) {
            setRefundError({ title: 'Invalid amount', detail: `Enter an amount between ₱1 and ₱${detail.total_amount.toLocaleString()}.` })
            return
        }
        if (isAutoDisbursement) {
            if (!accountName.trim() || !accountNumber.trim()) {
                setRefundError({ title: 'Destination required', detail: 'Enter the customer’s account name and number to send the transfer.' })
                return
            }
        } else if (isManualOnly && channel !== 'cash' && !reference.trim()) {
            setRefundError({ title: 'Reference required', detail: 'Enter the GCash/bank reference number for this disbursement.' })
            return
        }
        setRefunding(true)
        const r = isAutoDisbursement && detail.purchase_intent_id
            ? await sendDisbursementRefund(detail.purchase_intent_id, amt, disbChannel, accountNumber.trim(), accountName.trim(), reason)
            : isManualOnly
                ? await recordManualRefund(detail.id, amt, channel, reference.trim(), note.trim())
                : await refundTransaction(detail.id, amt, reason)
        setRefunding(false)
        if (r.success) {
            toast({
                title: isAutoDisbursement ? 'Refund transfer sent' : isManualOnly ? 'Manual refund recorded' : 'Refund issued',
                description: isAutoDisbursement
                    ? `₱${amt.toLocaleString()} is on its way to the customer. Tickets void once Xendit confirms the transfer.`
                    : `₱${amt.toLocaleString()} ${isManualOnly ? 'recorded as refunded to the customer.' : 'refunded to the customer.'}`,
            })
            onOpenChange(false)
            router.refresh()
        } else {
            // Keep the modal open with a specific, persistent error so they can fix + retry.
            setRefundError(describeRefundFailure(r))
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
                                <RotateCcw className="h-4 w-4 mr-2" /> {isManualOnly ? 'Refund customer' : 'Issue refund'}
                            </Button>
                        )}

                        {canRefund && refundMode && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 space-y-3">
                                {/* QRPH: choose how to refund — send automatically via Xendit, or record an off-platform payout. */}
                                {isManualOnly && (
                                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/60 p-1 border border-amber-200">
                                        <button type="button" onClick={() => { setQrphMode('auto'); setRefundError(null) }}
                                            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${qrphMode === 'auto' ? 'bg-amber-600 text-white' : 'text-amber-800 hover:bg-amber-100'}`}>
                                            Send via Xendit
                                        </button>
                                        <button type="button" onClick={() => { setQrphMode('manual'); setRefundError(null) }}
                                            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${qrphMode === 'manual' ? 'bg-amber-600 text-white' : 'text-amber-800 hover:bg-amber-100'}`}>
                                            Record manual refund
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-start gap-2 text-sm text-amber-800">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {isAutoDisbursement
                                            ? 'We’ll transfer the refund straight to the customer’s GCash/bank from your Xendit wallet. A transfer fee applies (shown below) and a full refund voids the tickets once the transfer settles. HangHut’s platform fee is not returned.'
                                            : isManualOnly
                                                ? 'Pay the customer back directly (GCash/bank/cash), then record it here. A full refund voids the tickets. HangHut’s platform fee is not returned.'
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

                                {isAutoDisbursement ? (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label>Send to</Label>
                                            <Select value={disbChannel} onValueChange={(v) => setDisbChannel(v)}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {PHILIPPINE_BANKS.map(b => (
                                                        <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="disb-acct-name">Account name<span className="text-destructive"> *</span></Label>
                                            <Input id="disb-acct-name" value={accountName} onChange={(e) => setAccountName(e.target.value)}
                                                placeholder="Exact name on the account" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="disb-acct-no">{isEwalletChannel(disbChannel) ? 'Mobile number' : 'Account number'}<span className="text-destructive"> *</span></Label>
                                            <Input id="disb-acct-no" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                                                placeholder={isEwalletChannel(disbChannel) ? '09XXXXXXXXX' : 'Bank account number'} />
                                            {isEwalletChannel(disbChannel) && detail.buyer_phone && accountNumber === detail.buyer_phone && (
                                                <p className="text-[11px] text-muted-foreground">Prefilled from the number given at checkout — confirm it&apos;s their {PHILIPPINE_BANKS.find(b => b.code === disbChannel)?.name || 'e-wallet'} number.</p>
                                            )}
                                        </div>
                                        {/* Itemized transfer-fee disclosure — the organizer's wallet pays amount + fee. */}
                                        <div className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Refund to customer</span><span className="font-medium">₱{(Number(amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Transfer fee</span><span className="font-medium">₱{transferFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                            <div className="flex justify-between border-t border-amber-200 mt-1 pt-1"><span className="font-semibold">Debited from your wallet</span><span className="font-semibold text-destructive">₱{((Number(amount) || 0) + transferFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                            <p className="text-[11px] text-muted-foreground mt-1.5">The transfer fee is charged by Xendit to send the payout and is deducted from your wallet on top of the refund. Estimated — the exact fee is set by Xendit at payout.</p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Reason</Label>
                                            <Select value={reason} onValueChange={setReason}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                ) : isManualOnly ? (
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

                                {refundError && (
                                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                                        <p className="flex items-center gap-1.5 font-semibold text-destructive">
                                            <AlertTriangle className="h-4 w-4 shrink-0" /> {refundError.title}
                                        </p>
                                        {refundError.detail && <p className="mt-1 text-destructive/90">{refundError.detail}</p>}
                                        {refundError.hint && <p className="mt-1.5 text-xs text-muted-foreground">{refundError.hint}</p>}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button variant="ghost" className="flex-1" onClick={() => setRefundMode(false)} disabled={refunding}>Cancel</Button>
                                    <Button className="flex-1" onClick={handleRefund} disabled={refunding}>
                                        {refunding
                                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isAutoDisbursement ? 'Sending…' : isManualOnly ? 'Recording…' : 'Refunding…'}</>
                                            : <><CheckCircle2 className="h-4 w-4 mr-2" />{isAutoDisbursement ? 'Send transfer' : isManualOnly ? 'Record refund' : 'Confirm refund'}</>}
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
