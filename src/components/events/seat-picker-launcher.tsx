'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Armchair, Loader2 } from 'lucide-react'
import { trackEventInteraction } from '@/lib/analytics/track-event'

const SeatMapPicker = dynamic(
    () => import('@/components/events/seat-map-picker').then(m => m.SeatMapPicker),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-[420px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        ),
    }
)

interface SeatPickerLauncherProps {
    eventId: string
    fullWidth?: boolean
    /** Event's max tickets per order — forwarded to the picker's selection cap. */
    maxPerOrder?: number
}

export function SeatPickerLauncher({ eventId, fullWidth = false, maxPerOrder }: SeatPickerLauncherProps) {
    const [open, setOpen] = useState(false)

    // Open straight away when the URL asks for it: checkout bounces back here
    // with ?error=select_seats when the seats are missing/expired, and the
    // "Change seats" link lands here too — making the buyer find the button
    // again is one more place to lose them.
    useEffect(() => {
        try {
            const q = new URLSearchParams(window.location.search)
            if (q.get('seats') === '1' || q.get('error') === 'select_seats') setOpen(true)
        } catch { /* noop */ }
    }, [])

    return (
        <>
            <Button
                size="lg"
                className={`${fullWidth ? 'w-full' : 'w-full md:w-auto'} bg-primary text-primary-foreground hover:bg-primary/90 font-semibold`}
                onClick={() => { trackEventInteraction(eventId, 'pick_seats'); setOpen(true) }}
            >
                <Armchair className="h-5 w-5 mr-2" />
                Pick Your Seats
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                {/* Fixed-height flex column: the header stays put and the picker
                    fills the rest, so its pinned selection bar / Continue button
                    is always visible without scrolling the dialog.

                    Phones get the whole screen — 100dvh, not 100vh, so iOS's
                    collapsing address bar can't crop the Continue button — with
                    no rounding, border or wide padding stealing space. From sm
                    up it becomes a floating panel again, and it is allowed to
                    grow to 1400px so a real venue map has room; max-w-4xl used
                    to cap it at 896px no matter how big the screen was. */}
                <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none border-0 p-4 gap-3 flex flex-col overflow-hidden sm:w-[96vw] sm:h-[94vh] sm:max-w-[1400px] sm:rounded-lg sm:border sm:p-6">
                    <DialogHeader className="shrink-0 pr-10 text-left">
                        <DialogTitle>Choose Your Seats</DialogTitle>
                        {/* Kept for screen readers on phones, where the line is
                            not worth the vertical space the map needs. */}
                        <DialogDescription className="sr-only sm:not-sr-only">
                            Tap a section and we&apos;ll find the best seats together — or pick your own.
                        </DialogDescription>
                    </DialogHeader>
                    {open && (
                        <div className="flex-1 min-h-0 flex flex-col min-w-0">
                            <SeatMapPicker eventId={eventId} maxPerOrder={maxPerOrder} />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
