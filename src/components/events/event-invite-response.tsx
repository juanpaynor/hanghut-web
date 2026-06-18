'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check } from 'lucide-react'
import { respondToEventInvite } from '@/lib/organizer/event-invite-actions'
import { useToast } from '@/hooks/use-toast'

interface EventInviteResponseProps {
    token: string
    organizerName: string
    inviteeName?: string | null
    /** 'invited' shows Accept/Decline; 'declined' shows a gentle re-accept prompt. */
    initialStatus: 'invited' | 'declined'
}

export function EventInviteResponse({ token, organizerName, inviteeName, initialStatus }: EventInviteResponseProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [declined, setDeclined] = useState(initialStatus === 'declined')

    const respond = (response: 'accepted' | 'declined') => {
        startTransition(async () => {
            const r = await respondToEventInvite(token, response)
            if (r.error) {
                toast({ title: 'Something went wrong', description: r.error, variant: 'destructive' })
                return
            }
            if (response === 'declined') {
                setDeclined(true)
            } else {
                // Server recomputes to "accepted" and reveals the registration/ticket CTA
                router.refresh()
            }
        })
    }

    if (declined) {
        return (
            <div className="rounded-2xl border bg-muted/30 p-6 text-center space-y-3">
                <p className="font-semibold">You declined this invitation</p>
                <p className="text-sm text-muted-foreground">Changed your mind? You can still join.</p>
                <Button onClick={() => respond('accepted')} disabled={isPending} className="mt-1">
                    {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Accept Invite
                </Button>
            </div>
        )
    }

    return (
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
            <div className="bg-primary/10 px-5 py-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">You&apos;re invited by {organizerName}</span>
            </div>
            <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                    {inviteeName ? `Hi ${inviteeName} — ` : ''}you&apos;ve been personally invited to this private event.
                    Accept to register and secure your spot.
                </p>
                <div className="flex gap-3">
                    <Button onClick={() => respond('accepted')} disabled={isPending} className="flex-1 h-12 text-base font-semibold">
                        {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                        Accept Invite
                    </Button>
                    <Button onClick={() => respond('declined')} disabled={isPending} variant="outline" className="h-12">
                        Decline
                    </Button>
                </div>
            </div>
        </div>
    )
}
