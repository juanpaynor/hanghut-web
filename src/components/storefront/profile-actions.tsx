'use client'

import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface ProfileActionsProps {
    shareUrl: string
}

export function ProfileActions({ shareUrl }: ProfileActionsProps) {
    const { toast } = useToast()

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

    return (
        <Button
            variant="outline"
            className="w-full rounded-xl border-dashed"
            onClick={handleShare}
        >
            <Share2 className="h-4 w-4 mr-2" />
            Share Profile
        </Button>
    )
}
