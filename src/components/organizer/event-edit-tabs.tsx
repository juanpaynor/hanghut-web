'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventForm } from '@/components/organizer/event-form'
import { TicketTiersManager } from '@/components/organizer/ticket-tiers-manager'
import { AttendeeManager } from '@/components/organizer/attendee-manager'
import { PromoCodeManager } from '@/components/organizer/promo-code-manager'
import { CheckInStats } from '@/components/organizer/check-in-stats'
import { FileText, Ticket, Users, Tag, UserCheck } from 'lucide-react'
import { Attendee } from '@/lib/organizer/attendee-actions'
import { PromoCode } from '@/lib/organizer/promo-actions'

interface EventEditTabsProps {
    partnerId: string
    commissionRate: number
    event: any
    eventId: string
    tiers: any[]
    initialAttendees: Attendee[]
    promoCodes: PromoCode[]
}

export function EventEditTabs({ partnerId, commissionRate, event, eventId, tiers, initialAttendees, promoCodes }: EventEditTabsProps) {
    const [activeTab, setActiveTab] = useState('details')

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-5">
                <TabsTrigger value="details" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Details
                </TabsTrigger>
                <TabsTrigger value="tickets" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    Tickets
                </TabsTrigger>
                <TabsTrigger value="promotions" className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Promo
                </TabsTrigger>
                <TabsTrigger value="check-ins" className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Check-ins
                </TabsTrigger>
                <TabsTrigger value="attendees" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Attendees
                </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6">
                <EventForm
                    partnerId={partnerId}
                    commissionRate={commissionRate}
                    initialData={event}
                    eventId={eventId}
                />
            </TabsContent>

            <TabsContent value="tickets" className="mt-6">
                <TicketTiersManager eventId={eventId} tiers={tiers} />
            </TabsContent>

            <TabsContent value="promotions" className="mt-6">
                <PromoCodeManager eventId={eventId} initialCodes={promoCodes} />
            </TabsContent>

            <TabsContent value="check-ins" className="mt-6">
                <CheckInStats eventId={eventId} />
            </TabsContent>

            <TabsContent value="attendees" className="mt-6">
                <AttendeeManager
                    eventId={eventId}
                    initialAttendees={initialAttendees}
                    eventTitle={event.title}
                    eventDate={new Date(event.start_datetime).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}
                    eventVenue={event.venue_name || 'TBA'}
                />
            </TabsContent>
        </Tabs>
    )
}
