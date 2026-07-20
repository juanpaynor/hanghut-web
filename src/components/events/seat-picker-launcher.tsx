'use client'

import { useState } from 'react'
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
                    is always visible without scrolling the dialog. */}
                <DialogContent className="max-w-4xl w-[95vw] h-[92vh] flex flex-col gap-3 overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Choose Your Seats</DialogTitle>
                        <DialogDescription>
                            Tap a section, then tap seats to select them. Prices are shown per category.
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
