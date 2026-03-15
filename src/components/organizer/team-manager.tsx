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
import { Mail, Trash2, UserPlus, Shield, Copy, Check, ExternalLink } from 'lucide-react'
import { inviteTeamMember, removeTeamMember, cancelInvite, updateMemberRole } from '@/lib/organizer/team-actions'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const ROLES = [
    { value: 'manager', label: 'Manager', desc: 'Can create/edit events, invite members' },
    { value: 'scanner', label: 'Scanner', desc: 'Can scan tickets at the door' },
    { value: 'finance', label: 'Finance', desc: 'Can view payouts and financials' },
    { value: 'marketing', label: 'Marketing', desc: 'Can send email campaigns' },
]

const ROLE_COLORS: Record<string, string> = {
    owner: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    manager: 'bg-blue-100 text-blue-800 border-blue-200',
    scanner: 'bg-green-100 text-green-800 border-green-200',
    finance: 'bg-purple-100 text-purple-800 border-purple-200',
    marketing: 'bg-pink-100 text-pink-800 border-pink-200',
}

interface TeamManagerProps {
    partnerId: string
    currentUserId: string
    members: any[]
    invites: any[]
    userRole: string
}

export function TeamManager({ partnerId, currentUserId, members, invites, userRole }: TeamManagerProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteName, setInviteName] = useState('')
    const [inviteRole, setInviteRole] = useState('scanner')

    // For showing the invite link after successful invite
    const [inviteLink, setInviteLink] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const canManage = userRole === 'owner' || userRole === 'manager'
    const isOwner = userRole === 'owner'

    const handleInvite = async () => {
        if (!inviteEmail) return
        setIsLoading(true)

        const result = await inviteTeamMember(partnerId, inviteEmail, inviteRole, undefined, inviteName)

        if (result.error) {
            toast({
                title: 'Error',
                description: result.error,
                variant: 'destructive',
            })
        } else if (result.inviteToken) {
            const link = `${window.location.origin}/organizer/accept-invite?token=${result.inviteToken}`
            setInviteLink(link)
            toast({
                title: 'Invite Sent!',
                description: `An invite email has been sent to ${inviteEmail}`,
            })
            setInviteEmail('')
            setInviteName('')
            setInviteRole('scanner')
            router.refresh()
        }
        setIsLoading(false)
    }

    const handleRoleChange = async (memberId: string, newRole: string) => {
        const result = await updateMemberRole(memberId, newRole)
        if (result.error) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
            toast({ title: 'Role Updated', description: `Member role changed to ${newRole}` })
            router.refresh()
        }
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        toast({ title: 'Copied to clipboard' })
        setTimeout(() => setCopied(false), 2000)
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
                    <Button onClick={() => { setIsInviteOpen(true); setInviteLink(null) }}>
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
                                        {isOwner && member.user_id !== currentUserId && member.role !== 'owner' ? (
                                            <Select
                                                value={member.role}
                                                onValueChange={(val) => handleRoleChange(member.id, val)}
                                            >
                                                <SelectTrigger className="w-[140px] h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ROLES.map(r => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className={`capitalize ${ROLE_COLORS[member.role] || ''}`}
                                            >
                                                {member.role === 'owner' && <Shield className="mr-1 h-3 w-3" />}
                                                {member.role}
                                            </Badge>
                                        )}
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
                                            <Badge
                                                variant="outline"
                                                className={`capitalize ${ROLE_COLORS[invite.role] || ''}`}
                                            >
                                                {invite.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {format(new Date(invite.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            {canManage && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            const link = `${window.location.origin}/organizer/accept-invite?token=${invite.token}`
                                                            copyToClipboard(link)
                                                        }}
                                                        className="text-muted-foreground"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleCancelInvite(invite.id)}
                                                        className="text-muted-foreground hover:text-destructive"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
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
                    {!inviteLink ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Invite Team Member</DialogTitle>
                                <DialogDescription>
                                    An invite email will be sent with a link to join your organization.
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
                                    <Label htmlFor="name">Full Name (Optional)</Label>
                                    <Input
                                        id="name"
                                        placeholder="John Doe"
                                        value={inviteName}
                                        onChange={(e) => setInviteName(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Select value={inviteRole} onValueChange={setInviteRole}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ROLES.map(r => (
                                                <SelectItem key={r.value} value={r.value}>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{r.label}</span>
                                                        <span className="text-xs text-muted-foreground">{r.desc}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                                <Button onClick={handleInvite} disabled={isLoading || !inviteEmail}>
                                    {isLoading ? 'Sending...' : 'Send Invite'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Invite Sent! ✉️</DialogTitle>
                                <DialogDescription>
                                    An invite email has been sent. You can also share this link directly:
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                                    <code className="text-xs flex-1 break-all">{inviteLink}</code>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyToClipboard(inviteLink)}
                                    >
                                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 text-center">
                                    This link expires in 7 days.
                                </p>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => { setIsInviteOpen(false); setInviteLink(null) }}>
                                    Done
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
