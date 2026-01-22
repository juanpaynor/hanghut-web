'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MapPin, Calendar, Users, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

interface TableDetailsModalProps {
    tableId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function TableDetailsModal({ tableId, open, onOpenChange }: TableDetailsModalProps) {
    const [table, setTable] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (open && tableId) {
            loadTableDetails()
        }
    }, [open, tableId])

    const loadTableDetails = async () => {
        setLoading(true)
        const supabase = createClient()

        // Get table details (without foreign key relations to avoid 400 error)
        const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('*')
            .eq('id', tableId)
            .single()

        if (tableError || !tableData) {
            console.error('Error fetching table:', tableError)
            setLoading(false)
            return
        }

        // Get host separately
        let host = null
        if (tableData.host_id) {
            const { data: hostData } = await supabase
                .from('users')
                .select('id, display_name, user_photos(photo_url)')
                .eq('id', tableData.host_id)
                .single()
            host = hostData
        }

        // Get participants
        const { data: participantsData } = await supabase
            .from('table_participants')
            .select('*')
            .eq('table_id', tableId)

        // Get user details for participants
        const participants = []
        if (participantsData && participantsData.length > 0) {
            const userIds = participantsData.map(p => p.user_id).filter(Boolean)
            if (userIds.length > 0) {
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, display_name, user_photos(photo_url)')
                    .in('id', userIds)

                const usersMap = new Map(usersData?.map(u => [u.id, u]))

                for (const p of participantsData) {
                    participants.push({
                        ...p,
                        user: usersMap.get(p.user_id)
                    })
                }
            }
        }

        setTable({
            ...tableData,
            host,
            participants
        })
        setLoading(false)
    }

    const hostAvatarUrl = table?.host?.user_photos?.[0]?.photo_url
    const hostInitials = table?.host?.display_name?.slice(0, 2).toUpperCase() || '??'

    // Safe date formatting
    const formatTableDate = (datetime: string | null) => {
        if (!datetime) return 'No date set'
        try {
            const date = new Date(datetime)
            return isNaN(date.getTime()) ? 'Invalid date' : format(date, 'MMMM d, yyyy \'at\' h:mm a')
        } catch (e) {
            return 'Invalid date'
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">{table?.title || 'Table Details'}</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-32 bg-slate-700" />
                        <Skeleton className="h-24 bg-slate-700" />
                        <Skeleton className="h-24 bg-slate-700" />
                    </div>
                ) : table ? (
                    <div className="space-y-6">
                        {/* Main Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h3 className="text-sm font-medium text-slate-400 mb-2">Date & Time</h3>
                                <div className="flex items-center gap-2 text-white">
                                    <Calendar className="h-4 w-4 text-slate-500" />
                                    {formatTableDate(table.datetime)}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-slate-400 mb-2">Location</h3>
                                <div className="flex items-center gap-2 text-white">
                                    <MapPin className="h-4 w-4 text-slate-500" />
                                    {table.latitude && table.longitude ? (
                                        <a
                                            href={`https://www.google.com/maps?q=${table.latitude},${table.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-blue-400 underline"
                                        >
                                            {table.location_name || 'View on Map'}
                                        </a>
                                    ) : table.location_name ? (
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(table.location_name + (table.venue_address ? ' ' + table.venue_address : ''))}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-blue-400 underline"
                                        >
                                            {table.location_name}
                                        </a>
                                    ) : (
                                        'No location'
                                    )}
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
                                    {(table.status || 'unknown').toUpperCase()}
                                </span>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-slate-400 mb-2">Capacity</h3>
                                <div className="flex items-center gap-2 text-white">
                                    <Users className="h-4 w-4 text-slate-500" />
                                    {table.current_capacity || 0} / {table.max_guests || 0} guests
                                </div>
                            </div>

                            {(table.marker_emoji || table.marker_image_url) && (
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-2">Marker</h3>
                                    <div className="flex items-center gap-2 text-white">
                                        {table.marker_image_url ? (
                                            <img
                                                src={table.marker_image_url}
                                                alt="Table Marker"
                                                className="w-8 h-8 object-contain"
                                            />
                                        ) : (
                                            <span className="text-2xl">{table.marker_emoji}</span>
                                        )}
                                    </div>
                                </div>
                            )}
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

                        {/* Host */}
                        <div className="border-t border-slate-700 pt-4">
                            <h3 className="text-sm font-medium text-slate-400 mb-3">Host</h3>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={hostAvatarUrl} />
                                    <AvatarFallback className="bg-slate-700 text-white">{hostInitials}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <h4 className="text-white font-semibold">{table.host?.display_name || 'Unknown'}</h4>
                                </div>
                                {table.host?.id && (
                                    <Link href={`/admin/users/${table.host.id}`} onClick={() => onOpenChange(false)}>
                                        <Button size="sm" variant="outline" className="border-slate-600 hover:bg-slate-700">
                                            View Profile
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>

                        {/* Participants */}
                        <div className="border-t border-slate-700 pt-4">
                            <h3 className="text-sm font-medium text-slate-400 mb-3">
                                Participants ({table.participants?.length || 0})
                            </h3>
                            {!table.participants || table.participants.length === 0 ? (
                                <p className="text-slate-400 text-center py-4">No participants yet</p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {table.participants.map((participant: any) => {
                                        const avatarUrl = participant.user?.user_photos?.[0]?.photo_url
                                        const initials = participant.user?.display_name?.slice(0, 2).toUpperCase() || '??'

                                        return (
                                            <div key={participant.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={avatarUrl} />
                                                        <AvatarFallback className="bg-slate-700 text-white text-xs">{initials}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="text-white text-sm font-medium">{participant.user?.display_name || 'Unknown'}</p>
                                                        <p className="text-xs text-slate-400">
                                                            Status: <span className="capitalize">{participant.status || 'unknown'}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                {participant.user?.id && (
                                                    <Link href={`/admin/users/${participant.user.id}`} onClick={() => onOpenChange(false)}>
                                                        <Button size="sm" variant="ghost" className="hover:bg-slate-700 text-xs">
                                                            View
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-slate-400 text-center py-8">Table not found</p>
                )}
            </DialogContent>
        </Dialog>
    )
}
