'use client'

import { useState } from 'react'
import { Share2, Bell, Loader2, CheckCircle2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'

interface ProfileActionsProps {
    shareUrl: string
    partnerId: string
    partnerName: string
}

export function ProfileActions({ shareUrl, partnerId, partnerName }: ProfileActionsProps) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            toast({
                title: "Link Copied!",
                description: "Profile link copied to clipboard.",
            })
        } catch (err) {
            toast({
                title: "Error",
                description: "Failed to copy link.",
                variant: "destructive"
            })
        }
    }

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setStatus('loading')
        try {
            const supabase = createClient()
            const { error } = await supabase.from('partner_subscribers').insert({
                partner_id: partnerId,
                email: email.trim().toLowerCase(),
            })

            if (error) {
                if (error.code === '23505') {
                    setStatus('success')
                    setMessage("You're already following this organizer!")
                } else {
                    setStatus('error')
                    setMessage('Something went wrong. Please try again.')
                }
            } else {
                setStatus('success')
                setMessage("You're now following! We'll notify you about new events.")
                setEmail('')
            }
        } catch {
            setStatus('error')
            setMessage('Something went wrong. Please try again.')
        }
    }

    const resetDialog = () => {
        if (status !== 'loading') {
            setStatus('idle')
            setMessage('')
            setEmail('')
        }
    }

    return (
        <div className="flex gap-2">
            <Dialog
                open={open}
                onOpenChange={(isOpen) => {
                    setOpen(isOpen)
                    if (!isOpen) resetDialog()
                }}
            >
                <DialogTrigger asChild>
                    <Button className="flex-1 rounded-xl">
                        <Bell className="h-4 w-4 mr-2" />
                        Follow
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center">
                                <Mail className="h-4 w-4 text-primary" />
                            </div>
                            Follow {partnerName}
                        </DialogTitle>
                        <DialogDescription>
                            Get notified when {partnerName} posts new events, exclusive promos, and announcements.
                        </DialogDescription>
                    </DialogHeader>

                    {status === 'success' ? (
                        <div className="py-8 text-center space-y-3 animate-in fade-in zoom-in duration-300">
                            <div className="w-14 h-14 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="h-7 w-7 text-green-600" />
                            </div>
                            <p className="font-semibold text-lg">{message}</p>
                            <Button variant="outline" className="rounded-full mt-2" onClick={() => setOpen(false)}>
                                Done
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubscribe} className="space-y-4 pt-2">
                            <div>
                                <label htmlFor="follow-email" className="text-sm font-medium text-muted-foreground mb-1.5 block">
                                    Email address
                                </label>
                                <input
                                    id="follow-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    disabled={status === 'loading'}
                                    className="w-full px-4 py-3 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                />
                            </div>

                            {status === 'error' && (
                                <p className="text-red-500 text-sm">{message}</p>
                            )}

                            <Button
                                type="submit"
                                disabled={status === 'loading'}
                                className="w-full rounded-xl"
                                size="lg"
                            >
                                {status === 'loading' ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Subscribing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Bell className="h-4 w-4" />
                                        Follow & Get Notified
                                    </span>
                                )}
                            </Button>

                            <p className="text-xs text-muted-foreground text-center">
                                We&apos;ll only email you about {partnerName}&apos;s events. Unsubscribe anytime.
                            </p>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            <Button
                variant="outline"
                size="icon"
                className="rounded-xl h-10 w-10"
                onClick={handleShare}
            >
                <Share2 className="h-4 w-4" />
            </Button>
        </div>
    )
}
