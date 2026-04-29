'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { generateInvoicesForMonth, updateInvoiceStatus } from './actions'
import { useToast } from '@/hooks/use-toast'
import { Receipt, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'

type Invoice = {
    id: string
    invoice_month: string
    total_clicks: number
    total_usd: number
    status: 'pending' | 'paid' | 'waived' | 'void'
    notes: string | null
    created_at: string
    paid_at: string | null
    paid_by: string | null
    partner: {
        id: string
        business_name: string
        contact_email: string
    } | null
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    paid:    'bg-green-100 text-green-800 border-green-200',
    waived:  'bg-blue-100 text-blue-800 border-blue-200',
    void:    'bg-gray-100 text-gray-500 border-gray-200',
}

interface Props {
    invoices: Invoice[]
    selectedMonth: string
    selectedStatus: string
    months: string[]
    pendingClickCount: number
}

export function AdInvoicesClient({
    invoices,
    selectedMonth,
    selectedStatus,
    months,
    pendingClickCount,
}: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [actionInvoice, setActionInvoice] = useState<Invoice | null>(null)
    const [actionType, setActionType] = useState<'paid' | 'waived' | 'void' | null>(null)
    const [notes, setNotes] = useState('')
    const [isActioning, setIsActioning] = useState(false)

    const totalUsd = invoices.reduce((s, i) => s + Number(i.total_usd), 0)
    const totalClicks = invoices.reduce((s, i) => s + i.total_clicks, 0)

    function setMonth(month: string) {
        const params = new URLSearchParams()
        params.set('month', month)
        if (selectedStatus !== 'all') params.set('status', selectedStatus)
        router.push(`/admin/ad-invoices?${params.toString()}`)
    }

    function setStatus(status: string) {
        const params = new URLSearchParams()
        params.set('month', selectedMonth)
        if (status !== 'all') params.set('status', status)
        router.push(`/admin/ad-invoices?${params.toString()}`)
    }

    function handleGenerate() {
        startTransition(async () => {
            const result = await generateInvoicesForMonth(selectedMonth)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                toast({ title: 'Invoices generated', description: `${result.count} invoice(s) created for ${selectedMonth}.` })
                router.refresh()
            }
        })
    }

    function openAction(invoice: Invoice, type: 'paid' | 'waived' | 'void') {
        setActionInvoice(invoice)
        setActionType(type)
        setNotes(invoice.notes || '')
    }

    async function confirmAction() {
        if (!actionInvoice || !actionType) return
        setIsActioning(true)
        const result = await updateInvoiceStatus(actionInvoice.id, actionType, notes)
        setIsActioning(false)
        if (result.error) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Invoice updated', description: `Marked as ${actionType}.` })
            setActionInvoice(null)
            setActionType(null)
            router.refresh()
        }
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Receipt className="h-6 w-6 text-indigo-600" />
                        Ad Invoices (PPC)
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">External event click billing — $0.10 USD per unique click per user per month</p>
                </div>
            </div>

            {/* Filters + Generate */}
            <div className="flex flex-wrap gap-3 items-center">
                <Select value={selectedMonth} onValueChange={setMonth}>
                    <SelectTrigger className="w-40 bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setStatus}>
                    <SelectTrigger className="w-36 bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                </Select>

                {pendingClickCount > 0 && (
                    <Button
                        onClick={handleGenerate}
                        disabled={isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Generate Invoices ({pendingClickCount} new click{pendingClickCount !== 1 ? 's' : ''})
                    </Button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Invoices', value: invoices.length },
                    { label: 'Total Clicks', value: totalClicks.toLocaleString() },
                    { label: 'Total Billed (USD)', value: `$${totalUsd.toFixed(2)}` },
                    { label: 'Pending', value: invoices.filter(i => i.status === 'pending').length },
                ].map(card => (
                    <Card key={card.label} className="bg-white border border-slate-200">
                        <CardHeader className="pb-1 pt-4 px-4">
                            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">{card.label}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Table */}
            <Card className="bg-white border border-slate-200">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            <TableHead>Partner</TableHead>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">Amount (USD)</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Paid by</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                                    No invoices for {selectedMonth}
                                    {pendingClickCount > 0 && ' — click "Generate Invoices" to create them'}
                                </TableCell>
                            </TableRow>
                        ) : invoices.map(inv => (
                            <TableRow key={inv.id} className="hover:bg-slate-50">
                                <TableCell>
                                    <div className="font-medium text-slate-900">{inv.partner?.business_name ?? '—'}</div>
                                    <div className="text-xs text-slate-400">{inv.partner?.contact_email}</div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{inv.invoice_month}</TableCell>
                                <TableCell className="text-right font-medium">{inv.total_clicks}</TableCell>
                                <TableCell className="text-right font-bold">${Number(inv.total_usd).toFixed(2)}</TableCell>
                                <TableCell>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[inv.status]}`}>
                                        {inv.status}
                                    </span>
                                </TableCell>
                                <TableCell className="text-sm text-slate-500">{inv.paid_by ?? '—'}</TableCell>
                                <TableCell className="text-sm text-slate-500 max-w-[160px] truncate">{inv.notes ?? '—'}</TableCell>
                                <TableCell className="text-right">
                                    {inv.status === 'pending' && (
                                        <div className="flex gap-1 justify-end">
                                            <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50 h-7 px-2" onClick={() => openAction(inv, 'paid')}>
                                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Paid
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-blue-700 border-blue-200 hover:bg-blue-50 h-7 px-2" onClick={() => openAction(inv, 'waived')}>
                                                Waive
                                            </Button>
                                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 h-7 px-2" onClick={() => openAction(inv, 'void')}>
                                                <XCircle className="h-3.5 w-3.5 mr-1" /> Void
                                            </Button>
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            {/* Confirm Dialog */}
            <Dialog open={!!actionInvoice} onOpenChange={(open) => { if (!open) { setActionInvoice(null); setActionType(null) } }}>
                <DialogContent className="bg-white">
                    <DialogHeader>
                        <DialogTitle className="capitalize">Mark as {actionType}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-slate-600">
                            <strong>{actionInvoice?.partner?.business_name}</strong> — {actionInvoice?.invoice_month} — ${Number(actionInvoice?.total_usd ?? 0).toFixed(2)} USD
                        </p>
                        <Textarea
                            placeholder="Optional notes..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="h-20"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setActionInvoice(null); setActionType(null) }}>Cancel</Button>
                        <Button onClick={confirmAction} disabled={isActioning} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {isActioning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
