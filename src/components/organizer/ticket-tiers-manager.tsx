'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Plus, Edit, Trash2, Ticket, DollarSign, Users } from 'lucide-react'
import { createTicketTier, updateTicketTier, deleteTicketTier } from '@/lib/organizer/tier-actions'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'

interface TicketTier {
    id: string
    name: string
    description: string | null
    price: number
    quantity_total: number
    quantity_sold: number
    min_per_order: number
    max_per_order: number
    sales_start: string | null
    sales_end: string | null
    is_active: boolean
    sort_order: number
}

interface TicketTiersManagerProps {
    eventId: string
    tiers: TicketTier[]
    commissionRate: number
    passFeesToCustomer: boolean
    fixedFeePerTicket: number
}

export function TicketTiersManager({
    eventId,
    tiers: initialTiers,
    commissionRate,
    passFeesToCustomer,
    fixedFeePerTicket
}: TicketTiersManagerProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingTier, setEditingTier] = useState<TicketTier | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        quantity_total: '',
        min_per_order: '1',
        max_per_order: '10',
        is_active: true,
    })

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            price: '',
            quantity_total: '',
            min_per_order: '1',
            max_per_order: '10',
            is_active: true,
        })
        setEditingTier(null)
    }

    const openCreateDialog = () => {
        resetForm()
        setIsDialogOpen(true)
    }

    const openEditDialog = (tier: TicketTier) => {
        setEditingTier(tier)
        setFormData({
            name: tier.name,
            description: tier.description || '',
            price: tier.price.toString(),
            quantity_total: tier.quantity_total.toString(),
            min_per_order: tier.min_per_order.toString(),
            max_per_order: tier.max_per_order.toString(),
            is_active: tier.is_active,
        })
        setIsDialogOpen(true)
    }

    const handleSubmit = async () => {
        if (!formData.name || !formData.price || !formData.quantity_total) {
            toast({
                title: 'Missing Fields',
                description: 'Name, Price, and Quantity are required.',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const tierData = {
                name: formData.name,
                description: formData.description,
                price: parseFloat(formData.price),
                quantity_total: parseInt(formData.quantity_total),
                min_per_order: parseInt(formData.min_per_order),
                max_per_order: parseInt(formData.max_per_order),
                is_active: formData.is_active,
                sort_order: editingTier ? editingTier.sort_order : initialTiers.length,
            }

            let result
            if (editingTier) {
                result = await updateTicketTier(editingTier.id, tierData)
            } else {
                result = await createTicketTier(eventId, tierData)
            }

            if (result.error) {
                toast({
                    title: 'Error',
                    description: result.error,
                    variant: 'destructive',
                })
            } else {
                toast({
                    title: 'Success',
                    description: editingTier ? 'Tier updated successfully' : 'Tier created successfully',
                })
                setIsDialogOpen(false)
                resetForm()
                router.refresh()
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'An unexpected error occurred',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleDelete = async (tierId: string) => {
        if (!confirm('Are you sure you want to delete this tier? This cannot be undone.')) {
            return
        }

        setIsLoading(true)
        const result = await deleteTicketTier(tierId)

        if (result.error) {
            toast({
                title: 'Error',
                description: result.error,
                variant: 'destructive',
            })
        } else {
            toast({
                title: 'Success',
                description: 'Tier deleted successfully',
            })
            router.refresh()
        }
        setIsLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Ticket Tiers</h2>
                    <p className="text-muted-foreground">
                        Manage pricing tiers for your event (VIP, GA, Early Bird, etc.)
                    </p>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Tier
                </Button>
            </div>

            <div className="grid gap-4">
                {initialTiers.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground text-center">
                                No ticket tiers yet. Create one to get started.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    initialTiers.map((tier) => (
                        <Card key={tier.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <CardTitle>{tier.name}</CardTitle>
                                            {!tier.is_active && (
                                                <Badge variant="secondary">Inactive</Badge>
                                            )}
                                            {tier.quantity_sold >= tier.quantity_total && (
                                                <Badge variant="destructive">Sold Out</Badge>
                                            )}
                                        </div>
                                        {tier.description && (
                                            <CardDescription>{tier.description}</CardDescription>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditDialog(tier)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(tier.id)}
                                            disabled={tier.quantity_sold > 0}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">₱{tier.price.toFixed(2)}</p>
                                            <p className="text-xs text-muted-foreground">Price</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">
                                                {tier.quantity_sold} / {tier.quantity_total}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Sold</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Ticket className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">
                                                {tier.min_per_order} - {tier.max_per_order}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Per Order</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingTier ? 'Edit Ticket Tier' : 'Create Ticket Tier'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingTier
                                ? 'Update the details of this ticket tier'
                                : 'Add a new pricing tier for your event'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Tier Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g., VIP, General Admission, Early Bird"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="e.g., Includes 2 free drinks and skip-the-line access"
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                }
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="price">Price (₱) *</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={formData.price}
                                    onChange={(e) =>
                                        setFormData({ ...formData, price: e.target.value })
                                    }
                                />
                                {passFeesToCustomer ? (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Customer Pays (Price + Booking Fee)</span>
                                            <span>
                                                ₱{(
                                                    parseFloat(formData.price) + fixedFeePerTicket
                                                ).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-red-600">
                                            <span>Platform & Processing (paid by you)</span>
                                            <span>
                                                -₱{(
                                                    (parseFloat(formData.price) * commissionRate) +
                                                    (parseFloat(formData.price) * 0.03)
                                                ).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="border-t border-border/50 pt-1 flex justify-between font-medium text-foreground">
                                            <span>Net Earnings</span>
                                            <span className="text-green-600">
                                                ₱{(
                                                    parseFloat(formData.price) -
                                                    (parseFloat(formData.price) * commissionRate) -
                                                    (parseFloat(formData.price) * 0.03)
                                                ).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between">
                                            <span>Platform Fee ({(commissionRate * 100).toFixed(0)}%)</span>
                                            <span>-₱{(parseFloat(formData.price) * commissionRate).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Processing (3% + ₱15)</span>
                                            <span>-₱{((parseFloat(formData.price) * 0.03) + 15).toFixed(2)}</span>
                                        </div>
                                        <div className="border-t border-border/50 pt-1 flex justify-between font-medium text-foreground">
                                            <span>Net Earnings</span>
                                            <span className="text-green-600">
                                                ₱{(
                                                    parseFloat(formData.price) -
                                                    (parseFloat(formData.price) * commissionRate) -
                                                    ((parseFloat(formData.price) * 0.03) + 15)
                                                ).toFixed(2)}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="quantity">Total Quantity *</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    placeholder="100"
                                    value={formData.quantity_total}
                                    onChange={(e) =>
                                        setFormData({ ...formData, quantity_total: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="min">Min Per Order</Label>
                                <Input
                                    id="min"
                                    type="number"
                                    value={formData.min_per_order}
                                    onChange={(e) =>
                                        setFormData({ ...formData, min_per_order: e.target.value })
                                    }
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="max">Max Per Order</Label>
                                <Input
                                    id="max"
                                    type="number"
                                    value={formData.max_per_order}
                                    onChange={(e) =>
                                        setFormData({ ...formData, max_per_order: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="active">Active</Label>
                                <p className="text-sm text-muted-foreground">
                                    Inactive tiers won't be available for purchase
                                </p>
                            </div>
                            <Switch
                                id="active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_active: checked })
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={isLoading}>
                            {isLoading ? 'Saving...' : editingTier ? 'Update Tier' : 'Create Tier'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
