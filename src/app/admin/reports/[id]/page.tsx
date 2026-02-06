import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/admin/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ReportActions } from './report-actions'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User } from 'lucide-react'
import Image from 'next/image'
import { getReportById } from '@/lib/supabase/queries'

function UserProfileCard({
    user,
    label,
    reportCount
}: {
    user: any
    label: string
    reportCount?: number
}) {
    const avatarUrl = user?.user_photos?.[0]?.photo_url
    const initials = user?.display_name?.slice(0, 2).toUpperCase() || '??'

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-start gap-4">
                {user ? (
                    <>
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={avatarUrl} alt={user.display_name} />
                            <AvatarFallback className="bg-muted text-foreground">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-foreground">{user.display_name}</h3>
                            <p className="text-sm text-muted-foreground">Trust Score: {user.trust_score || 'N/A'}</p>
                            {reportCount !== undefined && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    Reports Against: <span className="text-orange-400 font-medium">{reportCount}</span>
                                </p>
                            )}
                            <Link href={`/admin/users/${user.id}`} className="mt-2 inline-block">
                                <Button size="sm" variant="outline" className="border-border hover:bg-muted">
                                    <User className="h-4 w-4 mr-2" />
                                    View Profile
                                </Button>
                            </Link>
                        </div>
                    </>
                ) : (
                    <div className="text-muted-foreground italic">User information not available or not a user.</div>
                )}
            </CardContent>
        </Card>
    )
}

function ReportDetailsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <Skeleton className="h-48 flex-1 bg-muted" />
                <Skeleton className="h-48 flex-1 bg-muted" />
            </div>
            <Skeleton className="h-64 bg-muted" />
        </div>
    )
}

export default async function ReportDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    return (
        <div className="p-8">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6">
                    <Link href="/admin/reports">
                        <Button variant="ghost" className="hover:bg-muted mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Reports
                        </Button>
                    </Link>
                    <h1 className="text-4xl font-bold mb-2">Report Details</h1>
                    <p className="text-muted-foreground">ID: {id}</p>
                </div>

                <Suspense fallback={<ReportDetailsSkeleton />}>
                    <ReportDetailsContent id={id} />
                </Suspense>
            </div>
        </div>
    )
}

async function ReportDetailsContent({ id }: { id: string }) {
    const supabase = await createClient()
    const report = await getReportById(supabase, id)

    if (!report) {
        notFound()
    }

    return (
        <div className="space-y-6">
            {/* Target Information (if not user) */}
            {report.target_type !== 'user' && (
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle>Report Target</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-foreground">Target Type: <span className="font-bold uppercase">{report.target_type}</span></p>
                        <p className="text-muted-foreground text-sm mt-1">ID: {report.target_id}</p>
                    </CardContent>
                </Card>
            )}

            {/* User Profiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <UserProfileCard user={report.reporter} label="Reporter" />
                {report.target_type === 'user' && (
                    <UserProfileCard
                        user={report.reported}
                        label="Reported User"
                        reportCount={report.reportedUserReportCount}
                    />
                )}
            </div>

            {/* Report Details */}
            <Card className="bg-card border-border">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Report Information</CardTitle>
                        <StatusBadge status={report.status} />
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Reason Category</h3>
                        <p className="text-foreground capitalize">{report.reason_category}</p>
                    </div>

                    {report.description && (
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                            <p className="text-foreground">{report.description}</p>
                        </div>
                    )}

                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Submitted</h3>
                        <p className="text-foreground">
                            {format(new Date(report.created_at), 'MMMM d, yyyy \'at\' h:mm a')}
                        </p>
                    </div>

                    {report.evidence_url && (
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Evidence</h3>
                            <div className="mt-2 relative aspect-video max-w-md rounded-lg overflow-hidden bg-muted">
                                <Image
                                    src={report.evidence_url}
                                    alt="Report evidence"
                                    fill
                                    className="object-contain"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Actions */}
            <ReportActions reportId={id} currentStatus={report.status} />
        </div>
    )
}
