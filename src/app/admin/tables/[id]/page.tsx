import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, MapPin, Calendar, Users, DollarSign } from 'lucide-react'
import { format } from 'date-fns'

async function getTableDetails(id: string) {
    const supabase = await createClient()

    const { data: table, error } = await supabase
        .from('tables')
        .select(`
      *,
      host:host_id (
        id,
        display_name,
        user_photos (
          photo_url
        )
      )
    `)
        .eq('id', id)
        .single()

    if (error || !table) {
        notFound()
    }

    // Get participants
    const { data: participants } = await supabase
        .from('table_participants')
        .select(`
      *,
      user:user_id (
        id,
        display_name,
        user_photos (
          photo_url
        )
      )
    `)
        .eq('table_id', id)

    return {
        ...table,
        participants: participants || []
    }
}

function TableDetailsSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-48 bg-slate-700" />
            <Skeleton className="h-32 bg-slate-700" />
        </div>
    )
}

export default async function TableDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    return (
        <div className="p-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6">
                    <Link href="/admin/tables">
                        <Button variant="ghost" className="hover:bg-slate-700 mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Tables
                        </Button>
                    </Link>
                    <h1 className="text-4xl font-bold mb-2">Table Details</h1>
                    <p className="text-slate-400">Event ID: {id}</p>
                </div>

                <Suspense fallback={<TableDetailsSkeleton />}>
                    <TableDetailsContent id={id} />
                </Suspense>
            </div>
        </div>
    )
}

async function TableDetailsContent({ id }: { id: string }) {
    const table = await getTableDetails(id)

    const hostAvatarUrl = table.host?.user_photos?.[0]?.photo_url
    const hostInitials = table.host?.display_name?.slice(0, 2).toUpperCase() || '??'

    return (
        <div className="space-y-6">
            {/* Main Info Card */}
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="text-2xl">{table.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Date & Time</h3>
                            <div className="flex items-center gap-2 text-white">
                                <Calendar className="h-4 w-4 text-slate-500" />
                                {format(new Date(table.datetime), 'MMMM d, yyyy \'at\' h:mm a')}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Location</h3>
                            <div className="flex items-center gap-2 text-white">
                                <MapPin className="h-4 w-4 text-slate-500" />
                                {table.location_name}
                            </div>
                            {table.venue_address && (
                                <p className="text-sm text-slate-400 mt-1">{table.venue_address}</p>
                            )}
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Status</h3>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${table.status === 'open' ? 'bg-green-500/10 text-green-500' :
                                    table.status === 'full' ? 'bg-yellow-500/10 text-yellow-500' :
                                        table.status === 'completed' ? 'bg-blue-500/10 text-blue-500' :
                                            'bg-gray-500/10 text-gray-500'
                                }`}>
                                {table.status.toUpperCase()}
                            </span>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Capacity</h3>
                            <div className="flex items-center gap-2 text-white">
                                <Users className="h-4 w-4 text-slate-500" />
                                {table.current_capacity} / {table.max_guests} guests
                            </div>
                        </div>
                    </div>

                    {table.description && (
                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Description</h3>
                            <p className="text-white">{table.description}</p>
                        </div>
                    )}

                    {table.cuisine_type && (
                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Cuisine Type</h3>
                            <p className="text-white capitalize">{table.cuisine_type}</p>
                        </div>
                    )}

                    {table.price_per_person && (
                        <div>
                            <h3 className="text-sm font-medium text-slate-400 mb-2">Price Per Person</h3>
                            <div className="flex items-center gap-2 text-white">
                                <DollarSign className="h-4 w-4 text-slate-500" />
                                ${table.price_per_person}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Host Card */}
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle>Host</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={hostAvatarUrl} />
                            <AvatarFallback className="bg-slate-700 text-white">{hostInitials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h3 className="text-white font-semibold">{table.host?.display_name || 'Unknown'}</h3>
                        </div>
                        <Link href={`/admin/users/${table.host?.id}`}>
                            <Button size="sm" variant="outline" className="border-slate-600 hover:bg-slate-700">
                                View Profile
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Participants Card */}
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle>Participants ({table.participants.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {table.participants.length === 0 ? (
                        <p className="text-slate-400 text-center py-4">No participants yet</p>
                    ) : (
                        <div className="space-y-3">
                            {table.participants.map((participant: any) => {
                                const avatarUrl = participant.user?.user_photos?.[0]?.photo_url
                                const initials = participant.user?.display_name?.slice(0, 2).toUpperCase() || '??'

                                return (
                                    <div key={participant.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={avatarUrl} />
                                                <AvatarFallback className="bg-slate-700 text-white">{initials}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-white font-medium">{participant.user?.display_name || 'Unknown'}</p>
                                                <p className="text-sm text-slate-400">
                                                    Status: <span className="capitalize">{participant.status}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <Link href={`/admin/users/${participant.user?.id}`}>
                                            <Button size="sm" variant="ghost" className="hover:bg-slate-700">
                                                View
                                            </Button>
                                        </Link>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
