import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ArrowLeft, ShieldCheck, ShieldOff, ExternalLink, Calendar, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Experience Review — HangHut Admin',
}

// ── Server Actions ─────────────────────────────────────────────────────────────

async function setVerified(experienceId: string, verified: boolean) {
    'use server'
    const supabase = await createClient()
    await supabase
        .from('tables')
        .update({ verified_by_hanghut: verified })
        .eq('id', experienceId)
        .eq('is_experience', true)
    revalidatePath(`/admin/experiences/${experienceId}`)
    revalidatePath('/admin/experiences')
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AdminExperienceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: isAdmin } = await supabase.rpc('is_user_admin')
    if (!isAdmin) redirect('/login')

    const { data: exp, error } = await supabase
        .from('tables')
        .select(`
            id,
            title,
            description,
            location_name,
            experience_type,
            price_per_person,
            currency,
            images,
            video_url,
            host_id,
            host_bio,
            host_avatar_url,
            verified_by_hanghut,
            included_items,
            requirements,
            created_at,
            experience_schedules(*)
        `)
        .eq('id', id)
        .eq('is_experience', true)
        .single()

    if (error || !exp) notFound()

    // Fetch host display name from public.users (IDs match auth.users)
    const { data: hostUser } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', exp.host_id)
        .single()

    const schedules = ((exp.experience_schedules ?? []) as any[]).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    const hostName = hostUser?.display_name ?? 'Unknown'
    const hostAvatarUrl = exp.host_avatar_url ?? hostUser?.avatar_url ?? null
    const images: string[] = (exp.images as string[]) ?? []
    const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')

    const verifyAction = setVerified.bind(null, exp.id, true)
    const unverifyAction = setVerified.bind(null, exp.id, false)

    return (
        <div className="p-8 space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-start gap-4 flex-wrap">
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                    <Link href="/admin/experiences">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                    </Link>
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-bold text-slate-900 leading-tight">{exp.title}</h1>
                        {exp.verified_by_hanghut ? (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                                <ShieldCheck className="h-3 w-3" /> Verified
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                                Pending Verification
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        {exp.location_name} · <strong>{hostName}</strong> · {exp.experience_type ?? 'Experience'}
                    </p>
                </div>

                <div className="flex gap-2 shrink-0">
                    {!exp.verified_by_hanghut ? (
                        <form action={verifyAction}>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                                <ShieldCheck className="h-4 w-4" /> Verify Experience
                            </Button>
                        </form>
                    ) : (
                        <form action={unverifyAction}>
                            <Button type="submit" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50 gap-2">
                                <ShieldOff className="h-4 w-4" /> Remove Verification
                            </Button>
                        </form>
                    )}
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/experiences/${exp.id}`} target="_blank">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Public Page
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── LEFT ── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Image Gallery */}
                    {images.length > 0 && (
                        <Card>
                            <CardHeader><CardTitle className="text-base">Images ({images.length})</CardTitle></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-2">
                                    {images.map((src, i) => (
                                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                                            <Image src={src} alt={`Image ${i + 1}`} fill className="object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Description */}
                    <Card>
                        <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {exp.description || 'No description provided.'}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Included + Requirements */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(exp.included_items as string[] | null)?.length! > 0 && (
                            <Card>
                                <CardHeader><CardTitle className="text-base">What's Included</CardTitle></CardHeader>
                                <CardContent>
                                    <ul className="space-y-1 text-sm text-muted-foreground">
                                        {(exp.included_items as string[]).map((item, i) => (
                                            <li key={i} className="flex items-center gap-2"><span className="text-green-500">✓</span> {item}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}
                        {(exp.requirements as string[] | null)?.length! > 0 && (
                            <Card>
                                <CardHeader><CardTitle className="text-base">Requirements</CardTitle></CardHeader>
                                <CardContent>
                                    <ul className="space-y-1 text-sm text-muted-foreground">
                                        {(exp.requirements as string[]).map((req, i) => (
                                            <li key={i} className="flex items-center gap-2"><span className="text-orange-400">!</span> {req}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Schedules */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calendar className="h-4 w-4" /> Schedules ({schedules.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead>Date & Time</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Capacity</TableHead>
                                        <TableHead>Booked</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Price Override</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {schedules.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                                                No schedules yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : schedules.map((s: any) => {
                                        const start = parseISO(s.start_time)
                                        const end = parseISO(s.end_time)
                                        const durationHrs = Math.round((end.getTime() - start.getTime()) / 3600000 * 10) / 10
                                        const spotsLeft = s.max_guests - s.current_guests
                                        const statusColors: Record<string, string> = {
                                            open: 'bg-green-100 text-green-700',
                                            full: 'bg-yellow-100 text-yellow-700',
                                            cancelled: 'bg-red-100 text-red-700',
                                            completed: 'bg-blue-100 text-blue-700',
                                        }
                                        return (
                                            <TableRow key={s.id}>
                                                <TableCell className="text-sm font-medium">{format(start, 'EEE, MMM d • h:mm a')}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{durationHrs}h</TableCell>
                                                <TableCell className="text-sm">
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3 w-3 text-muted-foreground" />{s.max_guests}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {s.current_guests} <span className="text-muted-foreground">({spotsLeft} left)</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase ${statusColors[s.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                                        {s.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {s.price_per_person ? `${symbol}${Number(s.price_per_person).toLocaleString()}` : '—'}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* ── RIGHT ── */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Base Price</p>
                                <p className="font-bold text-lg">{symbol}{Number(exp.price_per_person).toLocaleString()} <span className="text-muted-foreground font-normal text-sm">/ person</span></p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Location</p>
                                <p className="text-muted-foreground">{exp.location_name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
                                <Badge variant="outline" className="uppercase text-[10px] tracking-wider">
                                    {exp.experience_type ?? '—'}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Video</p>
                                {exp.video_url ? (
                                    <Link href={exp.video_url} target="_blank" className="text-blue-600 hover:underline text-xs break-all">
                                        {exp.video_url}
                                    </Link>
                                ) : (
                                    <p className="text-muted-foreground">None</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Host Bio</p>
                                <p className="text-muted-foreground line-clamp-4">{exp.host_bio || 'Not provided'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Created</p>
                                <p className="text-muted-foreground">{new Date(exp.created_at).toLocaleDateString()}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Host Card */}
                    <Card>
                        <CardHeader><CardTitle className="text-base">Host</CardTitle></CardHeader>
                        <CardContent className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 shrink-0">
                                {hostAvatarUrl ? (
                                    <Image src={hostAvatarUrl} alt={hostName} width={40} height={40} className="object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold text-sm">
                                        {hostName.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <p className="font-medium text-sm">{hostName}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
