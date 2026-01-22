import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Calendar, Shield, MapPin, User as UserIcon } from 'lucide-react'
import { format } from 'date-fns'
import { UserReportsList } from '@/components/admin/user-reports-list'
import { TablesList } from '@/components/admin/tables-list-wrapper'
import { UserActions } from '@/components/admin/user-actions'
import { UserStatusBadge } from '@/components/admin/user-status-badge'

async function getUserProfile(id: string) {
    const supabase = await createClient()

    const { data: user, error } = await supabase
        .from('users')
        .select(`
      *,
      user_photos (
        photo_url
      )
    `)
        .eq('id', id)
        .single()

    if (error || !user) {
        notFound()
    }

    return user
}

async function getAdminId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || ''
}

function UserProfileSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex gap-6">
                <Skeleton className="h-32 w-32 rounded-full bg-slate-700" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-8 w-64 bg-slate-700" />
                    <Skeleton className="h-4 w-32 bg-slate-700" />
                    <Skeleton className="h-24 w-full bg-slate-700" />
                </div>
            </div>
        </div>
    )
}

export default async function UserProfilePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    return (
        <div className="p-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6">
                    <Link href="/admin/users">
                        <Button variant="ghost" className="hover:bg-slate-700 mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Users
                        </Button>
                    </Link>
                    <Suspense fallback={<UserProfileSkeleton />}>
                        <UserProfileContent id={id} />
                    </Suspense>
                </div>
            </div>
        </div>
    )
}

async function UserProfileContent({ id }: { id: string }) {
    const user = await getUserProfile(id)
    const adminId = await getAdminId()

    const avatarUrl = user.user_photos?.[0]?.photo_url
    const initials = user.display_name?.slice(0, 2).toUpperCase() || '??'

    return (
        <div className="space-y-8">
            {/* Header Profile Card */}
            <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <Avatar className="h-32 w-32 border-4 border-slate-700">
                            <AvatarImage src={avatarUrl} alt={user.display_name} />
                            <AvatarFallback className="text-4xl bg-slate-600 text-white">
                                {initials}
                            </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 space-y-4 w-full">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h1 className="text-3xl font-bold text-white">{user.display_name}</h1>
                                        <UserStatusBadge status={user.status || 'active'} />
                                    </div>
                                    <p className="text-slate-400 flex items-center gap-2 mt-1">
                                        <UserIcon className="h-4 w-4" />
                                        User ID: <span className="font-mono text-xs">{user.id}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-900/50 rounded-lg">
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Trust Score</p>
                                    <p className={`text-2xl font-bold ${user.trust_score >= 80 ? 'text-green-500' :
                                        user.trust_score >= 50 ? 'text-yellow-500' :
                                            'text-red-500'
                                        }`}>
                                        {user.trust_score}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Joined</p>
                                    <p className="text-xl font-semibold text-white">
                                        {format(new Date(user.created_at), 'MMM yyyy')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Gender</p>
                                    <p className="text-xl font-semibold text-white capitalize">
                                        {user.gender_identity || 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Role</p>
                                    <p className="text-xl font-semibold text-white">
                                        {user.is_admin ? 'Admin' : 'User'}
                                    </p>
                                </div>
                            </div>

                            {user.bio && (
                                <div>
                                    <h3 className="text-sm font-medium text-slate-400 mb-1">Bio</h3>
                                    <p className="text-slate-300">{user.bio}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* User Actions */}
            <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-6">
                    <UserActions
                        userId={id}
                        userEmail={user.email}
                        currentStatus={user.status || 'active'}
                        adminId={adminId}
                    />
                </CardContent>
            </Card>

            {/* Activity Tabs */}
            <Tabs defaultValue="tables" className="w-full">
                <TabsList className="bg-slate-800 border border-slate-700 text-slate-400">
                    <TabsTrigger
                        value="tables"
                        className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
                    >
                        <MapPin className="h-4 w-4 mr-2" />
                        Tables Hosted
                    </TabsTrigger>
                    <TabsTrigger
                        value="reports"
                        className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
                    >
                        <Shield className="h-4 w-4 mr-2" />
                        Reports Against
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tables" className="mt-6">
                    <Suspense fallback={<Skeleton className="h-48 w-full bg-slate-800" />}>
                        <TablesList hostId={id} />
                    </Suspense>
                </TabsContent>

                <TabsContent value="reports" className="mt-6">
                    <Suspense fallback={<Skeleton className="h-48 w-full bg-slate-800" />}>
                        <UserReportsList userId={id} />
                    </Suspense>
                </TabsContent>
            </Tabs>
        </div>
    )
}
