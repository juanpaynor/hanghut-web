'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, Search, Plus, Loader2, Pencil, Trash2, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog"
import { Switch } from '@/components/ui/switch'

interface Subscriber {
    id: string
    email: string
    full_name: string | null
    source: string
    subscribed_at: string
    is_active: boolean
}

const PAGE_SIZE = 20

export function SubscribersTable() {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [searchInput, setSearchInput] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [page, setPage] = useState(0)
    const supabase = createClient()
    const { toast } = useToast()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Add Subscriber State
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [newEmail, setNewEmail] = useState('')
    const [newName, setNewName] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    // Edit Subscriber State
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null)
    const [editName, setEditName] = useState('')
    const [editActive, setEditActive] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    // CSV Upload State
    const [isUploading, setIsUploading] = useState(false)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchInput), 300)
        return () => clearTimeout(timer)
    }, [searchInput])

    // Reload on debounced search or page change
    useEffect(() => {
        loadSubscribers()
    }, [debouncedSearch, page])

    async function loadSubscribers() {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get partner ID
            const { data: partner } = await supabase
                .from('partners')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle()

            let partnerId = partner?.id
            if (!partnerId) {
                const { data: teamMember } = await supabase
                    .from('partner_team_members')
                    .select('partner_id')
                    .eq('user_id', user.id)
                    .maybeSingle()
                partnerId = teamMember?.partner_id
            }

            if (!partnerId) return

            // Build query
            let query = supabase
                .from('partner_subscribers')
                .select('*', { count: 'exact' })
                .eq('partner_id', partnerId)

            // Apply search filter
            if (debouncedSearch) {
                query = query.or(`email.ilike.%${debouncedSearch}%,full_name.ilike.%${debouncedSearch}%`)
            }

            // Apply pagination
            const from = page * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            const { data, count, error } = await query
                .order('subscribed_at', { ascending: false })
                .range(from, to)

            if (error) throw error

            if (data) {
                setSubscribers(data)
                setTotalCount(count || 0)
            }
        } catch (error) {
            console.error('Failed to load subscribers:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAddSubscriber = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsAdding(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                toast({ title: "Error", description: "Not authenticated", variant: "destructive" })
                return
            }

            const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).maybeSingle()
            let partnerId = partner?.id
            if (!partnerId) {
                const { data: tm } = await supabase.from('partner_team_members').select('partner_id').eq('user_id', user.id).maybeSingle()
                partnerId = tm?.partner_id
            }

            if (!partnerId) {
                toast({ title: "Error", description: "No partner account found", variant: "destructive" })
                return
            }

            const { error } = await supabase.from('partner_subscribers').insert({
                partner_id: partnerId,
                email: newEmail,
                full_name: newName || null,
                source: 'manual',
                is_active: true
            })

            if (error) throw error

            toast({ title: "Success", description: "Subscriber added successfully" })
            setNewEmail('')
            setNewName('')
            setIsAddDialogOpen(false)
            loadSubscribers()

        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error",
                description: err.message || "Failed to add subscriber",
                variant: "destructive"
            })
        } finally {
            setIsAdding(false)
        }
    }

    const handleEditSubscriber = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingSubscriber) return
        setIsEditing(true)

        try {
            const { error } = await supabase
                .from('partner_subscribers')
                .update({
                    full_name: editName || null,
                    is_active: editActive
                })
                .eq('id', editingSubscriber.id)

            if (error) throw error

            toast({ title: "Success", description: "Subscriber updated successfully" })
            setIsEditDialogOpen(false)
            setEditingSubscriber(null)
            loadSubscribers()

        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error",
                description: err.message || "Failed to update subscriber",
                variant: "destructive"
            })
        } finally {
            setIsEditing(false)
        }
    }

    const handleDeleteSubscriber = async (subscriber: Subscriber) => {
        if (!confirm(`Delete subscriber ${subscriber.email}?`)) return

        try {
            const { error } = await supabase
                .from('partner_subscribers')
                .delete()
                .eq('id', subscriber.id)

            if (error) throw error

            toast({ title: "Deleted", description: "Subscriber removed" })
            loadSubscribers()

        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error",
                description: err.message || "Failed to delete subscriber",
                variant: "destructive"
            })
        }
    }

    const openEditDialog = (subscriber: Subscriber) => {
        setEditingSubscriber(subscriber)
        setEditName(subscriber.full_name || '')
        setEditActive(subscriber.is_active)
        setIsEditDialogOpen(true)
    }

    // Download CSV Template
    const handleDownloadTemplate = () => {
        const csvContent = "email,full_name\njohn@example.com,John Doe\njane@example.com,Jane Smith"
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'subscriber_template.csv'
        a.click()
        window.URL.revokeObjectURL(url)
    }

    // Handle CSV Upload
    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)

        try {
            const text = await file.text()
            const lines = text.split('\n').filter(line => line.trim())

            if (lines.length < 2) {
                toast({ title: "Error", description: "CSV file is empty", variant: "destructive" })
                return
            }

            // Parse CSV (simple parsing, assumes comma-separated)
            const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
            const emailIndex = headers.indexOf('email')
            const nameIndex = headers.indexOf('full_name')

            if (emailIndex === -1) {
                toast({ title: "Error", description: "CSV must have 'email' column", variant: "destructive" })
                return
            }

            // Get partner ID
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                toast({ title: "Error", description: "Not authenticated", variant: "destructive" })
                return
            }

            const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).maybeSingle()
            let partnerId = partner?.id
            if (!partnerId) {
                const { data: tm } = await supabase.from('partner_team_members').select('partner_id').eq('user_id', user.id).maybeSingle()
                partnerId = tm?.partner_id
            }

            if (!partnerId) {
                toast({ title: "Error", description: "No partner account found", variant: "destructive" })
                return
            }

            // Parse rows
            const subscribers = []
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
                const email = values[emailIndex]
                const fullName = nameIndex !== -1 ? values[nameIndex] : null

                if (email && email.includes('@')) {
                    subscribers.push({
                        partner_id: partnerId,
                        email,
                        full_name: fullName || null,
                        source: 'csv_import',
                        is_active: true
                    })
                }
            }

            if (subscribers.length === 0) {
                toast({ title: "Error", description: "No valid emails found in CSV", variant: "destructive" })
                return
            }

            // Bulk insert
            const { error } = await supabase.from('partner_subscribers').insert(subscribers)

            if (error) throw error

            toast({
                title: "Success",
                description: `${subscribers.length} subscriber(s) imported successfully`
            })

            loadSubscribers()

        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error",
                description: err.message || "Failed to import CSV",
                variant: "destructive"
            })
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    const canGoPrevious = page > 0
    const canGoNext = page < totalPages - 1

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                    <CardTitle>Subscriber List ({totalCount})</CardTitle>
                    <CardDescription>
                        Manage people who have opted in to receive your updates.
                    </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                    {/* Download Template */}
                    <Button variant="outline" onClick={handleDownloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                    </Button>

                    {/* Upload CSV */}
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload CSV
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleCSVUpload}
                    />

                    {/* Add Single */}
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Subscriber
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Manual Subscriber</DialogTitle>
                                <DialogDescription>
                                    Manually add someone to your email list.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleAddSubscriber} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Email Address *</Label>
                                    <Input
                                        type="email"
                                        required
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        placeholder="john@example.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Full Name (Optional)</Label>
                                    <Input
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={isAdding}>
                                        {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Add Subscriber
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Edit Dialog */}
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Subscriber</DialogTitle>
                            <DialogDescription>
                                Update subscriber details.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleEditSubscriber} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={editingSubscriber?.email || ''}
                                    disabled
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={editActive}
                                    onCheckedChange={setEditActive}
                                />
                                <Label>Active Subscription</Label>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isEditing}>
                                    {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="mb-4">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by email or name..."
                            value={searchInput}
                            onChange={(e) => {
                                setSearchInput(e.target.value)
                                setPage(0)
                            }}
                            className="pl-8 max-w-sm"
                        />
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Subscribed Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
                            </TableRow>
                        ) : subscribers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No subscribers found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            subscribers.map((sub) => (
                                <TableRow key={sub.id}>
                                    <TableCell className="font-medium">{sub.email}</TableCell>
                                    <TableCell>{sub.full_name || '-'}</TableCell>
                                    <TableCell className="capitalize">{sub.source}</TableCell>
                                    <TableCell>
                                        {sub.is_active ? (
                                            <div className="flex items-center gap-2 text-green-600">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span className="text-xs">Active</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-red-500">
                                                <XCircle className="h-4 w-4" />
                                                <span className="text-xs">Unsubscribed</span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {format(new Date(sub.subscribed_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(sub)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-700"
                                                onClick={() => handleDeleteSubscriber(sub)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                            Page {page + 1} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => p - 1)}
                                disabled={!canGoPrevious}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => p + 1)}
                                disabled={!canGoNext}
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
