"use client"

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventForm } from '@/components/organizer/event-form'
import { TicketTiersManager } from '@/components/organizer/ticket-tiers-manager'
import { AttendeeManager } from '@/components/organizer/attendee-manager'
import { PromoCodeManager } from '@/components/organizer/promo-code-manager'
import { CheckInStats } from '@/components/organizer/check-in-stats'
import { EventDashboardOverview } from '@/components/organizer/event-dashboard-overview'
import { FileText, Ticket, Users, LayoutDashboard, Settings } from 'lucide-react'
import { Attendee } from '@/lib/organizer/attendee-actions'
import { PromoCode } from '@/lib/organizer/promo-actions'

interface EventDashboardTabsProps {
    partnerId: string
    commissionRate: number
    event: any
    eventId: string
    tiers: any[]
    initialAttendees: Attendee[]
    promoCodes: PromoCode[]
    stats: {
        totalRevenue: number
        ticketsSold: number
        totalCapacity: number
        checkedInCount: number
        refundedAmount?: number
    }
}

export function EventDashboardTabs({
    partnerId,
    commissionRate,
    event,
    eventId,
    tiers,
    initialAttendees,
    promoCodes,
    stats
}: EventDashboardTabsProps) {
    const [activeTab, setActiveTab] = useState('overview')

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-3xl grid-cols-5 bg-muted/50 p-1">
                <TabsTrigger value="overview" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Overview
                </TabsTrigger>
                <TabsTrigger value="attendees" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Attendees
                </TabsTrigger>
                <TabsTrigger value="tickets" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    Tickets
                </TabsTrigger>
                <TabsTrigger value="edit" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Edit Details
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2" disabled>
                    <Settings className="h-4 w-4" />
                    Settings
                </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 animate-in fade-in-50 duration-300">
                <EventDashboardOverview event={event} stats={stats} />
            </TabsContent>

            <TabsContent value="attendees" className="mt-6 animate-in fade-in-50 duration-300 space-y-8">
                <CheckInStats eventId={eventId} />
                <div className="border-t pt-8">
                    <h3 className="text-xl font-semibold mb-4">Attendee List</h3>
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
                </div>
            </TabsContent>

            <TabsContent value="tickets" className="mt-6 animate-in fade-in-50 duration-300 space-y-8">
                <div className="grid gap-8">
                    <div>
                        <h3 className="text-xl font-semibold mb-4">Ticket Tiers</h3>
                        <TicketTiersManager eventId={eventId} tiers={tiers} commissionRate={commissionRate} />
                    </div>
                    <div className="border-t pt-8">
                        <h3 className="text-xl font-semibold mb-4">Promo Codes</h3>
                        <PromoCodeManager eventId={eventId} initialCodes={promoCodes} />
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="edit" className="mt-6 animate-in fade-in-50 duration-300">
                <EventForm
                    partnerId={partnerId}
                    commissionRate={commissionRate}
                    initialData={event}
                    eventId={eventId}
                />
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
                <div className="p-8 text-center text-muted-foreground">
                    Advanced settings coming soon.
                </div>
            </TabsContent>
        </Tabs>
    )
}
