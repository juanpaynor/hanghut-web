'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Printer } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { TicketPdfDocument, TicketData, TicketSize } from './ticket-pdf'
import { Attendee } from '@/lib/organizer/attendee-actions'
import { format } from 'date-fns'

interface TicketPrintModalProps {
    attendees: Attendee[]
    eventTitle: string
    eventDate: string
    eventVenue: string
    trigger?: React.ReactNode
}

export function TicketPrintModal({ attendees, eventTitle, eventDate, eventVenue, trigger }: TicketPrintModalProps) {
    const [size, setSize] = useState<TicketSize>('a4')
    const [isGenerating, setIsGenerating] = useState(false)
    const [open, setOpen] = useState(false)

    const handlePrint = async () => {
        setIsGenerating(true)
        try {
            // Transform attendee data to ticket data
            const tickets: TicketData[] = attendees.map((attendee) => ({
                id: attendee.id,
                ticket_code: attendee.id.substring(0, 8).toUpperCase(), // Use shortened ID as ticket code
                attendee_name: attendee.guest_info?.name || attendee.user?.display_name || 'Guest',
                attendee_email: attendee.guest_info?.email || attendee.user?.email || '',
                event_title: eventTitle,
                event_date: eventDate,
                event_venue: eventVenue,
                tier_name: attendee.tier?.name,
                qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${attendee.id}`, // Generate QR dynamically
            }))

            // Generate PDF
            const doc = <TicketPdfDocument tickets={tickets} size={size} />
            const blob = await pdf(doc).toBlob()

            // Download
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `tickets_${size}_${new Date().getTime()}.pdf`
            link.click()
            URL.revokeObjectURL(url)

            setOpen(false)
        } catch (error) {
            console.error('Failed to generate PDF:', error)
            alert('Failed to generate tickets. Please try again.')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Tickets
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Print Tickets</DialogTitle>
                    <DialogDescription>
                        Select the ticket size and format. {attendees.length} ticket{attendees.length !== 1 ? 's' : ''} will be generated.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-3">
                        <Label>Ticket Size</Label>
                        <RadioGroup value={size} onValueChange={(val) => setSize(val as TicketSize)}>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="a4" id="a4" />
                                <Label htmlFor="a4" className="flex-1 cursor-pointer">
                                    <div className="font-semibold">A4 (Standard)</div>
                                    <div className="text-sm text-muted-foreground">4 tickets per page • Best for office printers</div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="thermal" id="thermal" />
                                <Label htmlFor="thermal" className="flex-1 cursor-pointer">
                                    <div className="font-semibold">Thermal (80mm)</div>
                                    <div className="text-sm text-muted-foreground">Receipt printer • 1 ticket per page</div>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                                <RadioGroupItem value="wristband" id="wristband" />
                                <Label htmlFor="wristband" className="flex-1 cursor-pointer">
                                    <div className="font-semibold">Wristband</div>
                                    <div className="text-sm text-muted-foreground">For wearable tickets • Compact layout</div>
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
                        Cancel
                    </Button>
                    <Button onClick={handlePrint} disabled={isGenerating}>
                        {isGenerating ? (
                            <>Generating...</>
                        ) : (
                            <>
                                <Printer className="h-4 w-4 mr-2" />
                                Generate PDF
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
