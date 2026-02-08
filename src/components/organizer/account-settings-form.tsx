'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { User, Mail, Lock, Shield } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function AccountSettingsForm() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    // Email change
    const [newEmail, setNewEmail] = useState('')
    const [emailPassword, setEmailPassword] = useState('')
    const [emailChangeLoading, setEmailChangeLoading] = useState(false)

    // Password change
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')
    const [passwordChangeLoading, setPasswordChangeLoading] = useState(false)

    const [currentUser, setCurrentUser] = useState<any>(null)

    // Get current user on mount
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setCurrentUser(user)
        }
        getUser()
    }, [])

    const handleEmailChange = async (e: React.FormEvent) => {
        e.preventDefault()
        setEmailChangeLoading(true)

        try {
            // Re-authenticate first
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: currentUser?.email || '',
                password: emailPassword
            })

            if (signInError) {
                toast({
                    title: 'Authentication Failed',
                    description: 'Incorrect password.',
                    variant: 'destructive'
                })
                setEmailChangeLoading(false)
                return
            }

            // Update email
            const { error: updateError } = await supabase.auth.updateUser({
                email: newEmail
            })

            if (updateError) {
                toast({
                    title: 'Email Change Failed',
                    description: updateError.message,
                    variant: 'destructive'
                })
                setEmailChangeLoading(false)
                return
            }

            toast({
                title: 'Confirmation Emails Sent',
                description: 'Check both your current and new email to confirm the change.'
            })

            setNewEmail('')
            setEmailPassword('')
            setEmailChangeLoading(false)
        } catch (error) {
            toast({
                title: 'Error',
                description: 'An unexpected error occurred.',
                variant: 'destructive'
            })
            setEmailChangeLoading(false)
        }
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        setPasswordChangeLoading(true)

        // Validate
        if (newPassword.length < 8) {
            toast({
                title: 'Invalid Password',
                description: 'Password must be at least 8 characters long.',
                variant: 'destructive'
            })
            setPasswordChangeLoading(false)
            return
        }

        if (newPassword !== confirmNewPassword) {
            toast({
                title: 'Passwords Do Not Match',
                description: 'Please confirm your new password correctly.',
                variant: 'destructive'
            })
            setPasswordChangeLoading(false)
            return
        }

        try {
            // Re-authenticate first
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: currentUser?.email || '',
                password: currentPassword
            })

            if (signInError) {
                toast({
                    title: 'Authentication Failed',
                    description: 'Current password is incorrect.',
                    variant: 'destructive'
                })
                setPasswordChangeLoading(false)
                return
            }

            // Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (updateError) {
                toast({
                    title: 'Password Change Failed',
                    description: updateError.message,
                    variant: 'destructive'
                })
                setPasswordChangeLoading(false)
                return
            }

            toast({
                title: 'Password Updated',
                description: 'Your password has been successfully changed.'
            })

            setCurrentPassword('')
            setNewPassword('')
            setConfirmNewPassword('')
            setPasswordChangeLoading(false)
        } catch (error) {
            toast({
                title: 'Error',
                description: 'An unexpected error occurred.',
                variant: 'destructive'
            })
            setPasswordChangeLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Email Change Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Change Email
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Current Email</Label>
                            <p className="text-lg font-medium">{currentUser?.email || 'Loading...'}</p>
                        </div>

                        <form onSubmit={handleEmailChange} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="newEmail">New Email</Label>
                                <Input
                                    id="newEmail"
                                    type="email"
                                    placeholder="new@email.com"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    required
                                    disabled={emailChangeLoading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="emailPassword">Confirm Password</Label>
                                <Input
                                    id="emailPassword"
                                    type="password"
                                    placeholder="Enter your current password"
                                    value={emailPassword}
                                    onChange={(e) => setEmailPassword(e.target.value)}
                                    required
                                    disabled={emailChangeLoading}
                                />
                            </div>

                            <Alert>
                                <AlertDescription className="text-sm">
                                    You'll receive confirmation emails at both your current and new email addresses.
                                </AlertDescription>
                            </Alert>

                            <Button type="submit" disabled={emailChangeLoading}>
                                {emailChangeLoading ? 'Updating...' : 'Change Email'}
                            </Button>
                        </form>
                    </div>
                </CardContent>
            </Card>

            {/* Password Change Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Change Password
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">Current Password</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                                disabled={passwordChangeLoading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                placeholder="At least 8 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={8}
                                disabled={passwordChangeLoading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Minimum 8 characters
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                            <Input
                                id="confirmNewPassword"
                                type="password"
                                placeholder="Re-enter new password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required
                                disabled={passwordChangeLoading}
                            />
                        </div>

                        <Button type="submit" disabled={passwordChangeLoading}>
                            {passwordChangeLoading ? 'Updating...' : 'Change Password'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
