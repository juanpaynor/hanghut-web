'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, Share2, CalendarPlus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AddToCalendarButtonProps {
    title: string
    startDatetime: string
    endDatetime?: string | null
    location?: string | null
    description?: string | null
}

export function AddToCalendarButton({ title, startDatetime, endDatetime, location, description }: AddToCalendarButtonProps) {
    function formatGcal(dt: string) {
        return new Date(dt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    const start = formatGcal(startDatetime)
    const end = endDatetime ? formatGcal(endDatetime) : formatGcal(new Date(new Date(startDatetime).getTime() + 2 * 60 * 60 * 1000).toISOString())
    const loc = location || ''
    const desc = description || ''

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&location=${encodeURIComponent(loc)}&details=${encodeURIComponent(desc)}`

    function downloadIcs() {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//HangHut//EN',
            'BEGIN:VEVENT',
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${title}`,
            loc ? `LOCATION:${loc}` : '',
            desc ? `DESCRIPTION:${desc.replace(/\n/g, '\\n')}` : '',
            `UID:${startDatetime}-${title.replace(/\s+/g, '')}@hanghut.com`,
            'END:VEVENT',
            'END:VCALENDAR',
        ].filter(Boolean).join('\r\n')

        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.ics`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-1 mt-2 text-xs text-primary bg-primary/10 hover:bg-primary/20 cursor-pointer px-2 py-1 rounded-full w-fit transition-colors font-medium">
                    <CalendarPlus className="h-3 w-3" />
                    Add to Calendar
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                        Google Calendar
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadIcs}>
                    Apple / Outlook (.ics)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface MobileTicketButtonProps {
    showTickets: boolean
    isSoldOut: boolean
    isExternal?: boolean
    externalUrl?: string
}

export function MobileTicketButton({ showTickets, isSoldOut, isExternal, externalUrl }: MobileTicketButtonProps) {
    if (!showTickets) return null
    if (!isExternal && isSoldOut) return null

    if (isExternal && externalUrl) {
        return (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t md:hidden z-50 animate-in slide-in-from-bottom">
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full h-12 text-lg font-bold shadow-lg bg-blue-600 hover:bg-blue-700">
                        Get Tickets <ExternalLink className="h-4 w-4 ml-2" />
                    </Button>
                </a>
            </div>
        )
    }

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
