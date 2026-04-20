'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { banUser, type BanAction } from '@/lib/admin/actions'
import { deleteReportedContent, resolveReport } from '@/lib/admin/moderation-actions'
import { Ban, ShieldAlert, Trash2, AlertTriangle } from 'lucide-react'

interface ReportActionsProps {
    reportId: string
    currentStatus: string
    reportedUserId?: string | null
    targetType: string
    targetId: string
    adminId: string
}

export function ReportActions({
    reportId,
    currentStatus,
    reportedUserId,
    targetType,
    targetId,
    adminId,
}: ReportActionsProps) {
    const [status, setStatus] = useState(currentStatus)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()
    const supabase = createClient()

    // Ban dialog state
    const [banDialogOpen, setBanDialogOpen] = useState(false)
    const [banAction, setBanAction] = useState<BanAction>('suspend')
    const [banReason, setBanReason] = useState('')
    const [banLoading, setBanLoading] = useState(false)

    // Delete content dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)

    // Warn dialog state
    const [warnDialogOpen, setWarnDialogOpen] = useState(false)
    const [warnMessage, setWarnMessage] = useState('')
    const [warnLoading, setWarnLoading] = useState(false)

    const handleStatusUpdate = async () => {
        if (status === currentStatus) {
            toast({
                title: 'No changes',
                description: 'Status is already set to this value',
            })
            return
        }

        setLoading(true)

        const { error } = await supabase
            .from('reports')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', reportId)

        if (error) {
            toast({
                title: 'Error',
                description: 'Failed to update report status',
                variant: 'destructive',
            })
            setLoading(false)
            return
        }

        toast({
            title: 'Success',
            description: 'Report status updated successfully',
        })

        setLoading(false)
        router.refresh()
    }

    const handleBanUser = async () => {
        if (!banReason.trim() || !reportedUserId) return

        setBanLoading(true)
        const result = await banUser(reportedUserId, banAction, banReason, adminId)
        setBanLoading(false)

        if (result.success) {
            // Auto-resolve the report
            await resolveReport(reportId)

            toast({
                title: 'User ' + (banAction === 'ban' ? 'banned' : banAction === 'suspend' ? 'suspended' : 'activated'),
                description: result.message,
            })
            setBanDialogOpen(false)
            setBanReason('')
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to update user status',
                variant: 'destructive',
            })
        }
    }

    const handleDeleteContent = async () => {
        setDeleteLoading(true)
        const result = await deleteReportedContent(targetType, targetId)
        setDeleteLoading(false)

        if (result.success) {
            // Auto-resolve the report
            await resolveReport(reportId)

            toast({
                title: 'Content deleted',
                description: `The reported ${targetType} has been removed.`,
            })
            setDeleteDialogOpen(false)
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to delete content',
                variant: 'destructive',
            })
        }
    }

    const handleWarnUser = async () => {
        if (!warnMessage.trim() || !reportedUserId) return

        setWarnLoading(true)

        // Log warning as an admin action
        const { error } = await supabase
            .from('admin_actions')
            .insert({
                admin_id: adminId,
                action_type: 'warn',
                target_user_id: reportedUserId,
                reason: warnMessage,
                metadata: { report_id: reportId },
            })

        if (!error) {
            // Mark report as reviewed
            await supabase
                .from('reports')
                .update({ status: 'reviewed', updated_at: new Date().toISOString() })
                .eq('id', reportId)

            toast({
                title: 'Warning logged',
                description: 'Warning has been recorded in the admin audit trail.',
            })
            setWarnDialogOpen(false)
            setWarnMessage('')
            router.refresh()
        } else {
            toast({
                title: 'Error',
                description: 'Failed to log warning',
                variant: 'destructive',
            })
        }

        setWarnLoading(false)
    }

    const canDeleteContent = ['post', 'table', 'comment', 'message'].includes(targetType)

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">
                            Update Status
                        </label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="bg-card border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="reviewed">Reviewed</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="dismissed">Dismissed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        onClick={handleStatusUpdate}
                        disabled={loading || status === currentStatus}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {loading ? 'Updating...' : 'Update Status'}
                    </Button>
                </div>

                <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-2">Moderation Actions</p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="border-yellow-600 text-yellow-500 hover:bg-yellow-600 hover:text-white"
                            onClick={() => setWarnDialogOpen(true)}
                            disabled={!reportedUserId}
                        >
                            <ShieldAlert className="h-4 w-4 mr-2" />
                            Warn User
                        </Button>
                        <Button
                            variant="outline"
                            className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                            onClick={() => setBanDialogOpen(true)}
                            disabled={!reportedUserId}
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            Ban User
                        </Button>
                        <Button
                            variant="outline"
                            className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={!canDeleteContent}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Content
                        </Button>
                    </div>
                </div>
            </CardContent>

            {/* Warn User Dialog */}
            <Dialog open={warnDialogOpen} onOpenChange={setWarnDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-yellow-500" />
                            Warn User
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Log a warning against this user. This will be recorded in the admin audit trail.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Warning Message *</Label>
                            <Textarea
                                value={warnMessage}
                                onChange={(e) => setWarnMessage(e.target.value)}
                                placeholder="E.g., First warning for inappropriate content..."
                                className="bg-slate-900 border-slate-700 text-white min-h-[100px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setWarnDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleWarnUser}
                            disabled={warnLoading || !warnMessage.trim()}
                            className="bg-yellow-600 hover:bg-yellow-700"
                        >
                            {warnLoading ? 'Logging...' : 'Log Warning'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ban/Suspend Dialog */}
            <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Ban className="h-5 w-5 text-red-500" />
                            Ban / Suspend User
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Choose an action and provide a reason. The report will be auto-resolved.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Action</Label>
                            <Select value={banAction} onValueChange={(val) => setBanAction(val as BanAction)}>
                                <SelectTrigger className="bg-slate-900 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ban">Ban (Permanent)</SelectItem>
                                    <SelectItem value="suspend">Suspend (Temporary)</SelectItem>
                                    <SelectItem value="activate">Activate (Remove Ban/Suspend)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Reason *</Label>
                            <Textarea
                                value={banReason}
                                onChange={(e) => setBanReason(e.target.value)}
                                placeholder="E.g., Multiple spam reports, Policy violation..."
                                className="bg-slate-900 border-slate-700 text-white min-h-[100px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBanDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleBanUser}
                            disabled={banLoading || !banReason.trim()}
                            variant="destructive"
                        >
                            {banLoading ? 'Processing...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Content Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Delete Reported Content
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            This will permanently delete the reported {targetType}. The report will be auto-resolved.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-slate-700">
                            You are about to delete a <strong className="text-white">{targetType}</strong> with ID:
                        </p>
                        <p className="font-mono text-xs text-slate-400 mt-1 bg-slate-900 rounded px-3 py-2">
                            {targetId}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDeleteContent}
                            disabled={deleteLoading}
                            variant="destructive"
                        >
                            {deleteLoading ? 'Deleting...' : 'Delete Content'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
