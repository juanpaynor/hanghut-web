"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Calendar, MapPin, Users, DollarSign,
    Ticket, QrCode, ExternalLink, Edit,
    MoreHorizontal,
    TrendingUp
} from "lucide-react"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"

interface DashboardOverviewProps {
    event: any
    stats: {
        totalRevenue: number
        ticketsSold: number
        totalCapacity: number
        checkedInCount: number
    }
}

export function EventDashboardOverview({ event, stats }: DashboardOverviewProps) {
    const percentSold = stats.totalCapacity > 0
        ? Math.round((stats.ticketsSold / stats.totalCapacity) * 100)
        : 0

    const percentCheckedIn = stats.ticketsSold > 0
        ? Math.round((stats.checkedInCount / stats.ticketsSold) * 100)
        : 0

    const eventDate = new Date(event.start_datetime).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric"
    })

    return (
        <div className="space-y-8">
            {/* Header / Quick Info */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Badge variant={event.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                            {event.status}
                        </Badge>
                        <span className="text-muted-foreground text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {eventDate}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <MapPin className="w-3 h-3" /> {event.venue_name}
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" asChild className="flex-1 md:flex-none">
                        <Link href={`/events/${event.id}`} target="_blank">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Page
                        </Link>
                    </Button>
                    <Button variant="default" asChild className="flex-1 md:flex-none">
                        <Link href={`/organizer/scanner`}>
                            <QrCode className="w-4 h-4 mr-2" />
                            Open Scanner
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₱{stats.totalRevenue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Gross ticket sales
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.ticketsSold}</div>
                        <Progress value={percentSold} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {percentSold}% of {stats.totalCapacity} capacity
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Check-ins</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.checkedInCount}</div>
                        <Progress value={percentCheckedIn} className="h-2 mt-2" />
                        <p className="text-xs text-muted-foreground mt-2">
                            {percentCheckedIn}% of sold tickets
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Page Views</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">-</div>
                        <p className="text-xs text-muted-foreground">
                            Coming soon
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* We can add a sales chart here later */}
            <Card className="hidden">
                <CardHeader>
                    <CardTitle>Sales Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md">
                        Chart coming soon
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
