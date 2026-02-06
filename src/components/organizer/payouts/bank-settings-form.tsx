'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { addBankAccount, deleteBankAccount, setPrimaryBankAccount, BankAccountFormState } from '@/lib/organizer/bank-actions'
import { PHILIPPINE_BANKS } from '@/lib/constants/banks'
import { Loader2, Plus, Trash2, CheckCircle2, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BankAccount {
    id: string
    bank_code: string
    bank_name: string // Display name
    account_number: string
    account_holder_name: string
    is_primary: boolean
}

interface BankSettingsFormProps {
    accounts: BankAccount[]
}

export function BankSettingsForm({ accounts }: BankSettingsFormProps) {
    const { toast } = useToast()
    const [isAdding, setIsAdding] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    // Form State
    const [selectedBank, setSelectedBank] = useState<string>('')
    const [accountNumber, setAccountNumber] = useState('')
    const [accountName, setAccountName] = useState('')
    const [isPrimary, setIsPrimary] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)

        const bankEntry = PHILIPPINE_BANKS.find(b => b.code === selectedBank)
        const formData = new FormData()
        formData.append('bank_code', selectedBank)
        formData.append('bank_name', bankEntry?.name || selectedBank) // Store display name
        formData.append('account_number', accountNumber)
        formData.append('account_holder_name', accountName)
        if (isPrimary || accounts.length === 0) formData.append('is_primary', 'on') // First one always primary

        try {
            const res = await addBankAccount(undefined, formData)
            if (res.message?.includes('success')) {
                toast({ title: 'Success', description: 'Bank account added.' })
                setIsAdding(false)
                // Reset form
                setSelectedBank('')
                setAccountNumber('')
                setAccountName('')
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' })
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to add bank account', variant: 'destructive' })
        } finally {
            setIsLoading(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to remove this bank account?')) return
        try {
            await deleteBankAccount(id)
            toast({ title: 'Removed', description: 'Bank account removed successfully.' })
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive', description: 'Failed to remove account.' })
        }
    }

    async function handleSetPrimary(id: string) {
        try {
            await setPrimaryBankAccount(id)
            toast({ title: 'Updated', description: 'Primary payout account updated.' })
        } catch (e) {
            toast({ title: 'Error', variant: 'destructive', description: 'Failed to update setting.' })
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold">Bank Accounts</h2>
                    <p className="text-sm text-muted-foreground">Manage where you receive your payouts.</p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Account
                    </Button>
                )}
            </div>

            {/* List Existing Accounts */}
            <div className="grid gap-4">
                {accounts.map((acc) => (
                    <div key={acc.id} className={cn("flex items-center justify-between p-4 rounded-lg border bg-card", acc.is_primary ? "border-primary/50 bg-primary/5" : "border-border")}>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <Building2 className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-semibold flex items-center gap-2">
                                    {acc.bank_name}
                                    {acc.is_primary && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Primary</span>}
                                </p>
                                <p className="text-sm text-muted-foreground">{acc.account_holder_name} • {acc.account_number}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!acc.is_primary && (
                                <Button variant="ghost" size="sm" onClick={() => handleSetPrimary(acc.id)}>
                                    Make Primary
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(acc.id)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}

                {accounts.length === 0 && !isAdding && (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
                        No bank accounts added yet.
                    </div>
                )}
            </div>

            {/* Add New Form */}
            {isAdding && (
                <Card className="border-primary/20 shadow-lg">
                    <CardHeader>
                        <CardTitle>Add Bank Account</CardTitle>
                        <CardDescription>Enter your bank details carefully.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Bank / E-Wallet</Label>
                                <Select value={selectedBank} onValueChange={setSelectedBank} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Bank" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PHILIPPINE_BANKS.map((bank) => (
                                            <SelectItem key={bank.code} value={bank.code}>
                                                {bank.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Account Number</Label>
                                <Input
                                    value={accountNumber}
                                    onChange={(e) => setAccountNumber(e.target.value)}
                                    placeholder="e.g. 1234567890"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Account Holder Name</Label>
                                <Input
                                    value={accountName}
                                    onChange={(e) => setAccountName(e.target.value)}
                                    placeholder="Has to match bank records"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">Specify exact name linked to the bank account.</p>
                            </div>

                            {accounts.length > 0 && (
                                <div className="flex items-center space-x-2 pt-2">
                                    <Switch id="primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
                                    <Label htmlFor="primary">Set as primary payout account</Label>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2 bg-muted/20 py-4">
                            <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                            <Button type="submit" disabled={isLoading || !selectedBank}>
                                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Account
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            )}
        </div>
    )
}
