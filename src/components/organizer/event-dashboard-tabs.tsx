"use client"

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventForm } from '@/components/organizer/event-form'
import { TicketTiersManager } from '@/components/organizer/ticket-tiers-manager'
import { AttendeeManager } from '@/components/organizer/attendee-manager'
import { PromoCodeManager } from '@/components/organizer/promo-code-manager'
import { CheckInStats } from '@/components/organizer/check-in-stats'
import { EventDashboardOverview } from '@/components/organizer/event-dashboard-overview'
import { StorefrontCustomizationForm } from '@/components/organizer/storefront-customization-form'
import { SeatMapTab } from '@/components/organizer/seat-map-tab'
import { FileText, Ticket, Users, LayoutDashboard, Palette, Armchair, ExternalLink, ClipboardList, UserCheck } from 'lucide-react'
import { Attendee } from '@/lib/organizer/attendee-actions'
import { PromoCode } from '@/lib/organizer/promo-actions'
import { RegistrationQuestionsManager, RegistrationQuestion } from '@/components/organizer/registration-questions-manager'
import { RegistrationsManager } from '@/components/organizer/registrations-manager'
import { EventRegistration } from '@/lib/organizer/registration-management-actions'

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
    passFeesToCustomer: boolean
    fixedFeePerTicket: number
    initialQuestions: RegistrationQuestion[]
    initialRegistrations: EventRegistration[]
}

export function EventDashboardTabs({
    partnerId,
    commissionRate,
    event,
    eventId,
    tiers,
    initialAttendees,
    promoCodes,
    stats,
    passFeesToCustomer,
    fixedFeePerTicket,
    initialQuestions,
    initialRegistrations
}: EventDashboardTabsProps) {
    const [activeTab, setActiveTab] = useState('overview')

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full max-w-5xl bg-muted/50 p-1 ${event.seating_type === 'assigned_seating' ? (event.require_approval ? 'grid-cols-8' : 'grid-cols-7') : (event.require_approval ? 'grid-cols-7' : 'grid-cols-6')}`}>
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
                <TabsTrigger value="design" className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Design
                </TabsTrigger>
                <TabsTrigger value="questions" className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Questions
                </TabsTrigger>
                {event.require_approval && (
                    <TabsTrigger value="registrations" className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Registrations
                        {initialRegistrations.filter(r => r.status === 'pending').length > 0 && (
                            <span className="ml-1 bg-amber-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold">
                                {initialRegistrations.filter(r => r.status === 'pending').length}
                            </span>
                        )}
                    </TabsTrigger>
                )}
                {event.seating_type === 'assigned_seating' && (
                    <TabsTrigger value="seatmap" className="flex items-center gap-2">
                        <Armchair className="h-4 w-4" />
                        Seat Map
                    </TabsTrigger>
                )}
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
                {event.is_external ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                        <ExternalLink className="h-10 w-10 mb-3 opacity-40" />
                        <p className="font-semibold text-foreground">External Ticketing Event</p>
                        <p className="text-sm mt-1 max-w-sm">Ticket tiers and promo codes are managed by your external ticketing provider, not HangHut.</p>
                    </div>
                ) : (
                    <div className="grid gap-8">
                        <div>
                            <h3 className="text-xl font-semibold mb-4">Ticket Tiers</h3>
                            <TicketTiersManager
                                eventId={eventId}
                                tiers={tiers}
                                commissionRate={commissionRate}
                                passFeesToCustomer={passFeesToCustomer}
                                fixedFeePerTicket={fixedFeePerTicket}
                            />
                        </div>
                        <div className="border-t pt-8">
                            <h3 className="text-xl font-semibold mb-4">Promo Codes</h3>
                            <PromoCodeManager eventId={eventId} initialCodes={promoCodes} />
                        </div>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="edit" className="mt-6 animate-in fade-in-50 duration-300">
                <EventForm
                    partnerId={partnerId}
                    commissionRate={commissionRate}
                    initialData={event}
                    eventId={eventId}
                    passFeesToCustomer={passFeesToCustomer}
                    fixedFeePerTicket={fixedFeePerTicket}
                />
            </TabsContent>

            <TabsContent value="design" className="mt-6 animate-in fade-in-50 duration-300">
                <StorefrontCustomizationForm
                    eventId={eventId}
                    initialData={event}
                />
            </TabsContent>

            <TabsContent value="questions" className="mt-6 animate-in fade-in-50 duration-300">
                <RegistrationQuestionsManager
                    eventId={eventId}
                    initialQuestions={initialQuestions}
                />
            </TabsContent>

            {event.require_approval && (
                <TabsContent value="registrations" className="mt-6 animate-in fade-in-50 duration-300">
                    <div className="mb-4">
                        <h3 className="text-xl font-semibold">Registration Requests</h3>
                        <p className="text-sm text-muted-foreground mt-1">Review and approve or reject attendee registration requests.</p>
                    </div>
                    <RegistrationsManager
                        eventId={eventId}
                        initialRegistrations={initialRegistrations}
                    />
                </TabsContent>
            )}

            {event.seating_type === 'assigned_seating' && (
                <TabsContent value="seatmap" className="mt-6 animate-in fade-in-50 duration-300">
                    <SeatMapTab
                        eventId={eventId}
                        event={event}
                    />
                </TabsContent>
            )}
        </Tabs >
    )
}
