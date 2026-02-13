'use client'

import { Button } from '@/components/ui/button'
import { Share2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface MobileTicketButtonProps {
    showTickets: boolean
    isSoldOut: boolean
}

export function MobileTicketButton({ showTickets, isSoldOut }: MobileTicketButtonProps) {
    if (!showTickets || isSoldOut) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t md:hidden z-50 animate-in slide-in-from-bottom">
            <Button
                className="w-full h-12 text-lg font-bold shadow-lg"
                onClick={() => document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth' })}
            >
                Get Tickets
            </Button>
        </div>
    )
}

interface ShareButtonProps {
    title: string
    description?: string
    url?: string
}

export function ShareButton({ title, description }: ShareButtonProps) {
    const { toast } = useToast()

    const handleShare = async () => {
        const url = window.location.href

        if (navigator.share) {
            try {
                await navigator.share({
                    title,
                    text: description,
                    url
                })
            } catch (err) {
                console.error('Share failed:', err)
            }
        } else {
            await navigator.clipboard.writeText(url)
            toast({
                title: "Link Copied",
                description: "Event link copied to clipboard",
            })
        }
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleShare}
        >
            <Share2 className="h-4 w-4 mr-2" /> Share this event
        </Button>
    )
}
