'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, UserPlus, Trash2, Edit2, Crown, Headset, Wallet, ShieldCheck } from 'lucide-react'
import {
    getAdminUsers,
    addAdminUser,
    updateAdminRole,
    removeAdminUser,
} from '@/lib/admin/admin-management-actions'

type AdminUser = {
    id: string
    email: string
    display_name: string | null
    admin_role: string
    is_admin: boolean
    created_at: string
    last_active_at: string | null
}

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
    super_admin: {
        label: 'Super Admin',
        icon: Crown,
        color: 'text-amber-600 bg-amber-50 border-amber-200',
        description: 'Full access + admin management',
    },
    admin: {
        label: 'Admin',
        icon: ShieldCheck,
        color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        description: 'Full access to all sections',
    },
    support: {
        label: 'Support',
        icon: Headset,
        color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        description: 'Users, Reports, Tickets, Events',
    },
    finance_admin: {
        label: 'Finance',
        icon: Wallet,
        color: 'text-blue-600 bg-blue-50 border-blue-200',
        description: 'Accounting, Audit, Partners (view)',
    },
}

export default function AdminManagementPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Add admin dialog
    const [addOpen, setAddOpen] = useState(false)
    const [addEmail, setAddEmail] = useState('')
    const [addRole, setAddRole] = useState<string>('support')
    const [addLoading, setAddLoading] = useState(false)
    const [addError, setAddError] = useState<string | null>(null)

    // Edit role dialog
    const [editUser, setEditUser] = useState<AdminUser | null>(null)
    const [editRole, setEditRole] = useState<string>('')
    const [editLoading, setEditLoading] = useState(false)

    // Remove confirmation
    const [removeUser, setRemoveUser] = useState<AdminUser | null>(null)
    const [removeLoading, setRemoveLoading] = useState(false)

    const loadAdmins = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAdminUsers()
            setAdmins(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadAdmins()
    }, [loadAdmins])

    const handleAdd = async () => {
        setAddLoading(true)
        setAddError(null)
        try {
            await addAdminUser(addEmail, addRole as any)
            setSuccess(`Added ${addEmail} as ${ROLE_CONFIG[addRole]?.label}`)
            setAddOpen(false)
            setAddEmail('')
            setAddRole('support')
            await loadAdmins()
        } catch (err: any) {
            setAddError(err.message)
        } finally {
            setAddLoading(false)
        }
    }

    const handleUpdateRole = async () => {
        if (!editUser) return
        setEditLoading(true)
        try {
            await updateAdminRole(editUser.id, editRole as any)
            setSuccess(`Updated ${editUser.email} to ${ROLE_CONFIG[editRole]?.label}`)
            setEditUser(null)
            await loadAdmins()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setEditLoading(false)
        }
    }

    const handleRemove = async () => {
        if (!removeUser) return
        setRemoveLoading(true)
        try {
            await removeAdminUser(removeUser.id)
            setSuccess(`Removed admin access for ${removeUser.email}`)
            setRemoveUser(null)
            await loadAdmins()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setRemoveLoading(false)
        }
    }

    // Clear success/error after 5 seconds
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(null), 5000)
            return () => clearTimeout(t)
        }
    }, [success])

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000)
            return () => clearTimeout(t)
        }
    }, [error])

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Admin Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Manage admin roles and access levels</p>
                </div>

                {/* Add Admin Button */}
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Admin
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Admin User</DialogTitle>
                            <DialogDescription>
                                The user must already have a HangHut account. Enter their email to grant admin access.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input
                                    type="email"
                                    placeholder="user@hanghut.com"
                                    value={addEmail}
                                    onChange={e => setAddEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select value={addRole} onValueChange={setAddRole}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Admin — Full access</SelectItem>
                                        <SelectItem value="support">Support — Users, Reports, Tickets</SelectItem>
                                        <SelectItem value="finance_admin">Finance — Accounting, Audit</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">
                                    {ROLE_CONFIG[addRole]?.description}
                                </p>
                            </div>
                            {addError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{addError}</AlertDescription>
                                </Alert>
                            )}
                            <Button
                                onClick={handleAdd}
                                disabled={addLoading || !addEmail}
                                className="w-full"
                            >
                                {addLoading ? 'Adding...' : 'Add Admin'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Status messages */}
            {success && (
                <Alert className="mb-6 bg-green-50 border-green-200">
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Roles legend */}
            <div className="grid grid-cols-4 gap-3 mb-8">
                {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                    const Icon = config.icon
                    return (
                        <div key={key} className={`px-3 py-2 rounded-lg border ${config.color}`}>
                            <div className="flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold">{config.label}</span>
                            </div>
                            <p className="text-[10px] mt-0.5 opacity-70">{config.description}</p>
                        </div>
                    )
                })}
            </div>

            {/* Admin list */}
            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading...</div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Active</th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {admins.map(admin => {
                                const roleConfig = ROLE_CONFIG[admin.admin_role] || ROLE_CONFIG.admin
                                const Icon = roleConfig.icon
                                const isSuperAdmin = admin.admin_role === 'super_admin'

                                return (
                                    <tr key={admin.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">
                                                {admin.display_name || admin.email.split('@')[0]}
                                            </div>
                                            <div className="text-sm text-slate-500">{admin.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleConfig.color}`}>
                                                <Icon className="h-3 w-3" />
                                                {roleConfig.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {admin.last_active_at
                                                ? new Date(admin.last_active_at).toLocaleDateString()
                                                : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {!isSuperAdmin && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditUser(admin)
                                                            setEditRole(admin.admin_role)
                                                        }}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => setRemoveUser(admin)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Edit Role Dialog */}
            <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Role</DialogTitle>
                        <DialogDescription>
                            Update the admin role for {editUser?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="support">Support</SelectItem>
                                <SelectItem value="finance_admin">Finance</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handleUpdateRole} disabled={editLoading} className="w-full">
                            {editLoading ? 'Updating...' : 'Update Role'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Remove Confirmation Dialog */}
            <Dialog open={!!removeUser} onOpenChange={open => !open && setRemoveUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove Admin Access</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove admin access for <strong>{removeUser?.email}</strong>?
                            They will lose all admin privileges immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setRemoveUser(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={handleRemove}
                            disabled={removeLoading}
                        >
                            {removeLoading ? 'Removing...' : 'Remove Access'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
