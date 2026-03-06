import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ShieldCheck, Eye } from 'lucide-react'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Experiences — HangHut Admin',
}

const TYPE_LABELS: Record<string, string> = {
    workshop: 'Workshop',
    adventure: 'Adventure',
    food_tour: 'Food Tour',
    nightlife: 'Nightlife',
    culture: 'Culture',
    other: 'Other',
}

export default async function AdminExperiencesPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: isAdmin } = await supabase.rpc('is_user_admin')
    if (!isAdmin) redirect('/login')

    const { data: experiences, error } = await supabase
        .from('tables')
        .select(`
            id,
            title,
            location_name,
            experience_type,
            price_per_person,
            currency,
            verified_by_hanghut,
            created_at,
            images,
            host_avatar_url,
            host_id,
            experience_schedules(count)
        `)
        .eq('is_experience', true)
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="p-8 text-red-500">Failed to load experiences: {error.message}</div>
    }

    const pendingCount = experiences?.filter((e) => !e.verified_by_hanghut).length ?? 0

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Experiences</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and verify hosted experiences listed on the map.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-sm px-3 py-1">
                            {pendingCount} Unverified
                        </Badge>
                    )}
                    <Badge variant="outline" className="text-sm px-3 py-1">
                        {experiences?.length ?? 0} Total
                    </Badge>
                </div>
            </div>

            <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Schedules</TableHead>
                            <TableHead>Verified</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {experiences && experiences.length > 0 ? (
                            experiences.map((exp) => {
                                const heroImage = (exp.images as string[])?.[0]
                                const scheduleCount = (exp.experience_schedules as any)?.[0]?.count ?? 0
                                const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')

                                return (
                                    <TableRow key={exp.id} className="hover:bg-slate-50/50">
                                        <TableCell>
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                                                {heroImage ? (
                                                    <Image
                                                        src={heroImage}
                                                        alt={exp.title}
                                                        width={40}
                                                        height={40}
                                                        className="object-cover w-full h-full"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                                        {exp.title?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>

                                        <TableCell className="font-medium text-slate-800 max-w-[200px] truncate">
                                            {exp.title}
                                        </TableCell>

                                        <TableCell className="text-slate-500 text-sm max-w-[160px] truncate">
                                            {exp.location_name}
                                        </TableCell>

                                        <TableCell>
                                            <Badge variant="outline" className="uppercase text-[10px] tracking-wider">
                                                {TYPE_LABELS[exp.experience_type ?? ''] ?? exp.experience_type ?? '—'}
                                            </Badge>
                                        </TableCell>

                                        <TableCell className="text-slate-700 font-medium">
                                            {symbol}{Number(exp.price_per_person).toLocaleString()}
                                        </TableCell>

                                        <TableCell className="text-slate-500 text-sm">
                                            {scheduleCount} slot{scheduleCount !== 1 ? 's' : ''}
                                        </TableCell>

                                        <TableCell>
                                            {exp.verified_by_hanghut ? (
                                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    Verified
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                                                    Pending
                                                </Badge>
                                            )}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <Button asChild size="sm" variant="ghost">
                                                <Link href={`/admin/experiences/${exp.id}`}>
                                                    <Eye className="h-4 w-4 mr-1" />
                                                    Review
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                    No experiences found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
