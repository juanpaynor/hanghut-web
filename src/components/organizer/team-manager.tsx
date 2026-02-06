'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Trash2, UserPlus, Clock, Shield, User } from 'lucide-react'
import { inviteTeamMember, removeTeamMember, cancelInvite } from '@/lib/organizer/team-actions'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface TeamManagerProps {
    partnerId: string
    currentUserId: string
    members: any[]
    invites: any[]
    userRole: string // 'owner' | 'manager' | 'viewer'
}

export function TeamManager({ partnerId, currentUserId, members, invites, userRole }: TeamManagerProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteName, setInviteName] = useState('')
    const [invitePassword, setInvitePassword] = useState('')
    const [inviteRole, setInviteRole] = useState('scanner')
    const [newCredentials, setNewCredentials] = useState<{ email: string, password: string } | null>(null)

    const canManage = userRole === 'owner' || userRole === 'manager'
    const isOwner = userRole === 'owner'

    const handleInvite = async () => {
        if (!inviteEmail) return
        setIsLoading(true)

        const result = await inviteTeamMember(partnerId, inviteEmail, inviteRole, invitePassword, inviteName)

        if (result.error) {
            toast({
                title: 'Error',
                description: result.error,
                variant: 'destructive',
            })
        } else {
            if (result.newUser) {
                // Ensure password is treated as string since we know it exists here
                setNewCredentials({
                    email: result.newUser.email,
                    password: result.newUser.password || ''
                })
                toast({
                    title: 'User Created',
                    description: 'New user account created successfully.',
                })
            } else {
                toast({
                    title: 'Member Added',
                    description: `Successfully added ${inviteEmail} to the team`,
                })
            }

            setIsInviteOpen(false)
            setInviteEmail('')
            setInviteName('')
            setInvitePassword('')
            setInviteRole('scanner')
            router.refresh()
        }
        setIsLoading(false)
    }

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return

        setIsLoading(true)
        const result = await removeTeamMember(memberId)

        if (result.error) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Success', description: 'Member removed' })
            router.refresh()
        }
        setIsLoading(false)
    }

    const handleCancelInvite = async (inviteId: string) => {
        const result = await cancelInvite(inviteId)
        if (result.error) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Success', description: 'Invite cancelled' })
            router.refresh()
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Team Members</h2>
                    <p className="text-muted-foreground">
                        Manage who has access to your organization dashboard.
                    </p>
                </div>
                {canManage && (
                    <Button onClick={() => setIsInviteOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite Member
                    </Button>
                )}
            </div>

            {/* Active Members */}
            <Card>
                <CardHeader>
                    <CardTitle>Active Members</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={member.users?.avatar_url} />
                                            <AvatarFallback>
                                                {member.users?.display_name?.substring(0, 2).toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-medium">{member.users?.display_name}</div>
                                            <div className="text-xs text-muted-foreground">{member.users?.email}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {member.role === 'owner' && <Shield className="mr-1 h-3 w-3 text-yellow-500" />}
                                            {member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {format(new Date(member.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {isOwner && member.user_id !== currentUserId && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveMember(member.id)}
                                                disabled={isLoading}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {member.user_id === currentUserId && (
                                            <span className="text-xs text-muted-foreground italic">You</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pending Invites */}
            {invites.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Invites</CardTitle>
                        <CardDescription>Invitations waiting to be accepted.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Sent</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invites.map((invite) => (
                                    <TableRow key={invite.id}>
                                        <TableCell className="flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            {invite.email}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize">{invite.role}</Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {format(new Date(invite.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {canManage && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancelInvite(invite.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Invite Dialog */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Team Member</DialogTitle>
                        <DialogDescription>
                            Enter the email address of the person you want to add.
                            If they don&apos;t have an account, one will be created for them.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                placeholder="colleague@example.com"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                placeholder="John Doe"
                                value={inviteName}
                                onChange={(e) => setInviteName(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">Password (Optional)</Label>
                            <Input
                                id="password"
                                type="text"
                                placeholder="Auto-generate if empty"
                                value={invitePassword}
                                onChange={(e) => setInvitePassword(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Leave empty to auto-generate a secure password.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="role">Role</Label>
                            <Select value={inviteRole} onValueChange={setInviteRole}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manager">
                                        <div className="flex flex-col">
                                            <span className="font-medium">Manager</span>
                                            <span className="text-xs text-muted-foreground">Can create/edit events</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="scanner">
                                        <div className="flex flex-col">
                                            <span className="font-medium">Scanner</span>
                                            <span className="text-xs text-muted-foreground">Can scan tickets only</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                        <Button onClick={handleInvite} disabled={isLoading || !inviteEmail}>
                            {isLoading ? 'Adding...' : 'Add Member'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Credentials Dialog */}
            <Dialog open={!!newCredentials} onOpenChange={(open) => !open && setNewCredentials(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New User Created</DialogTitle>
                        <DialogDescription>
                            A new account has been created for this user. Please share these credentials with them immediately as you won&apos;t see them again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-4 bg-muted rounded-lg space-y-2">
                            <div className="flex justify-between">
                                <span className="font-medium">Email:</span>
                                <span className="font-mono">{newCredentials?.email}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium">Password:</span>
                                <span className="font-mono bg-background px-2 py-0.5 rounded border">
                                    {newCredentials?.password}
                                </span>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                            The user can change their password after logging in.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => {
                            navigator.clipboard.writeText(`Email: ${newCredentials?.email}\nPassword: ${newCredentials?.password}`)
                            toast({ title: 'Copied to clipboard' })
                        }} variant="outline">
                            Copy Credentials
                        </Button>
                        <Button onClick={() => setNewCredentials(null)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
