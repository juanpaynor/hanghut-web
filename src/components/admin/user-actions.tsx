'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { useToast } from '@/hooks/use-toast'
import { banUser, resetPassword, deleteAccount, type BanAction } from '@/lib/admin/actions'
import { Ban, ShieldAlert, ShieldCheck, KeyRound, Trash2, AlertTriangle } from 'lucide-react'

interface UserActionsProps {
    userId: string
    userEmail: string
    currentStatus: string
    adminId: string
}

export function UserActions({ userId, userEmail, currentStatus, adminId }: UserActionsProps) {
    const router = useRouter()
    const { toast } = useToast()

    // Ban/Suspend Dialog State
    const [banDialogOpen, setBanDialogOpen] = useState(false)
    const [banAction, setBanAction] = useState<BanAction>('ban')
    const [banReason, setBanReason] = useState('')
    const [banLoading, setBanLoading] = useState(false)

    // Reset Password Dialog State
    const [resetDialogOpen, setResetDialogOpen] = useState(false)
    const [resetLoading, setResetLoading] = useState(false)

    // Delete Account Dialog State
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [hardDelete, setHardDelete] = useState(false)
    const [deleteReason, setDeleteReason] = useState('')
    const [deleteLoading, setDeleteLoading] = useState(false)

    const handleBanUser = async () => {
        if (!banReason.trim()) {
            toast({
                title: 'Reason required',
                description: 'Please provide a reason for this action',
                variant: 'destructive',
            })
            return
        }

        setBanLoading(true)
        const result = await banUser(userId, banAction, banReason, adminId)
        setBanLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
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

    const handleResetPassword = async () => {
        setResetLoading(true)
        const result = await resetPassword(userEmail, adminId)
        setResetLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
                description: `Password reset email sent to ${userEmail}`,
            })
            setResetDialogOpen(false)
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to send reset email',
                variant: 'destructive',
            })
        }
    }

    const handleDeleteAccount = async () => {
        if (!deleteReason.trim()) {
            toast({
                title: 'Reason required',
                description: 'Please provide a reason for account deletion',
                variant: 'destructive',
            })
            return
        }

        setDeleteLoading(true)
        const result = await deleteAccount(userId, hardDelete, deleteReason, adminId)
        setDeleteLoading(false)

        if (result.success) {
            toast({
                title: 'Success',
                description: result.message,
            })
            setDeleteDialogOpen(false)
            setDeleteReason('')
            router.refresh()

            // If hard delete, redirect to users list
            if (hardDelete) {
                setTimeout(() => router.push('/admin/users'), 1000)
            }
        } else {
            toast({
                title: 'Error',
                description: result.error || 'Failed to delete account',
                variant: 'destructive',
            })
        }
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Admin Actions</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Ban/Suspend Button */}
                <Button
                    onClick={() => setBanDialogOpen(true)}
                    variant="outline"
                    className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                >
                    {currentStatus === 'banned' ? (
                        <>
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Unban User
                        </>
                    ) : currentStatus === 'suspended' ? (
                        <>
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Activate User
                        </>
                    ) : (
                        <>
                            <Ban className="h-4 w-4 mr-2" />
                            Ban/Suspend
                        </>
                    )}
                </Button>

                {/* Reset Password Button */}
                <Button
                    onClick={() => setResetDialogOpen(true)}
                    variant="outline"
                    className="border-blue-600 text-blue-500 hover:bg-blue-600 hover:text-white"
                >
                    <KeyRound className="h-4 w-4 mr-2" />
                    Reset Password
                </Button>

                {/* Delete Account Button */}
                <Button
                    onClick={() => setDeleteDialogOpen(true)}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    disabled={currentStatus === 'deleted'}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                </Button>
            </div>

            {/* Ban/Suspend Dialog */}
            <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle>Update User Status</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Choose an action and provide a reason. This will be logged in the audit trail.
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
                                placeholder="E.g., Multiple spam reports, Policy violation, etc."
                                className="bg-slate-900 border-slate-700 text-white min-h-[100px]"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBanDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleBanUser} disabled={banLoading}>
                            {banLoading ? 'Processing...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle>Reset User Password</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Send a password reset email to <strong>{userEmail}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <p className="text-sm text-slate-400 py-4">
                        The user will receive an email with a secure reset link that expires in 1 hour.
                    </p>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setResetDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleResetPassword} disabled={resetLoading}>
                            {resetLoading ? 'Sending...' : 'Send Reset Email'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Account Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            Delete User Account
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            This action will permanently affect the user's account. Choose deletion type carefully.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Deletion Type</Label>
                            <Select value={hardDelete ? 'hard' : 'soft'} onValueChange={(val) => setHardDelete(val === 'hard')}>
                                <SelectTrigger className="bg-slate-900 border-slate-700">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="soft">Soft Delete (Anonymize, keep data)</SelectItem>
                                    <SelectItem value="hard">Hard Delete (GDPR - Permanent removal)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-400">
                                {hardDelete
                                    ? '⚠️ Permanently deletes ALL user data including posts, messages, and events. CANNOT be undone!'
                                    : 'Anonymizes the user but retains data for audit purposes.'
                                }
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Reason *</Label>
                            <Textarea
                                value={deleteReason}
                                onChange={(e) => setDeleteReason(e.target.value)}
                                placeholder="E.g., GDPR request, User requested deletion, etc."
                                className="bg-slate-900 border-slate-700 text-white min-h-[100px]"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDeleteAccount}
                            disabled={deleteLoading}
                            variant={hardDelete ? 'destructive' : 'default'}
                        >
                            {deleteLoading ? 'Processing...' : hardDelete ? 'Permanently Delete' : 'Soft Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
