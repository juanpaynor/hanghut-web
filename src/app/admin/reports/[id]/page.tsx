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
import { MessageSquare, FileText, MapPin, ExternalLink } from 'lucide-react'

async function getAdminId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || ''
}

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

function ReportedContentCard({
    targetType,
    targetId,
    content,
}: {
    targetType: string
    targetId: string
    content: Record<string, any> | null
}) {
    const icons: Record<string, React.ReactNode> = {
        message: <MessageSquare className="h-4 w-4" />,
        post: <FileText className="h-4 w-4" />,
        table: <MapPin className="h-4 w-4" />,
        app: <ExternalLink className="h-4 w-4" />,
    }

    const typeLabels: Record<string, string> = {
        message: 'Reported Message',
        post: 'Reported Post',
        table: 'Reported Hangout / Venue',
        app: 'App-Level Report',
    }

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {icons[targetType] ?? <ExternalLink className="h-4 w-4" />}
                    {typeLabels[targetType] ?? `Reported ${targetType}`}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-mono mt-1">ID: {targetId}</p>
            </CardHeader>
            <CardContent>
                {!content ? (
                    <div className="p-4 rounded-lg bg-muted/50 border border-dashed border-border text-center">
                        <p className="text-muted-foreground text-sm">
                            {targetType === 'app'
                                ? 'This is an app-level report with no specific content target.'
                                : 'Content not found — it may have already been deleted.'}
                        </p>
                    </div>
                ) : targetType === 'message' ? (
                    <div className="space-y-3">
                        <div className="p-4 rounded-lg bg-muted/50 border border-border">
                            {content.deleted_for_everyone ? (
                                <p className="text-muted-foreground italic text-sm">This message was deleted by the sender.</p>
                            ) : content.content ? (
                                <p className="text-foreground">{content.content}</p>
                            ) : content.gif_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={content.gif_url} alt="GIF" className="max-w-xs rounded" />
                            ) : (
                                <p className="text-muted-foreground italic text-sm">No text content (may be a media message).</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Sender</p>
                                <p className="text-foreground">{content.sender_name || content.sender_id?.slice(0, 8) || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Type</p>
                                <p className="text-foreground capitalize">{content.content_type || 'text'}</p>
                            </div>
                        </div>
                    </div>
                ) : targetType === 'post' ? (
                    <div className="space-y-3">
                        {content.content && (
                            <div className="p-4 rounded-lg bg-muted/50 border border-border">
                                <p className="text-foreground">{content.content}</p>
                            </div>
                        )}
                        {content.image_urls?.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {content.image_urls.slice(0, 4).map((url: string, i: number) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={i} src={url} alt="Post image" className="h-32 w-32 object-cover rounded-lg border border-border" />
                                ))}
                            </div>
                        )}
                        {!content.content && !content.image_urls?.length && content.gif_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={content.gif_url} alt="GIF" className="max-w-xs rounded" />
                        )}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Post Type</p>
                                <p className="text-foreground capitalize">{content.post_type || '—'}</p>
                            </div>
                            {content.vibe_tag && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Vibe</p>
                                    <p className="text-foreground">{content.vibe_tag}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : targetType === 'table' ? (
                    <div className="space-y-3">
                        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-2">
                            <p className="text-foreground font-semibold text-lg">{content.title}</p>
                            {content.description && (
                                <p className="text-muted-foreground text-sm">{content.description}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Location</p>
                                <p className="text-foreground">{content.location_name || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Status</p>
                                <p className="text-foreground capitalize">{content.status || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Type</p>
                                <p className="text-foreground">{content.is_experience ? 'Experience' : 'Hangout'}</p>
                            </div>
                        </div>
                    </div>
                ) : null}
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
    const adminId = await getAdminId()

    if (!report) {
        notFound()
    }

    return (
        <div className="space-y-6">
            {/* Reported Content Preview */}
            {report.target_type !== 'user' && (
                <ReportedContentCard
                    targetType={report.target_type}
                    targetId={report.target_id}
                    content={report.reportedContent}
                />
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
            <ReportActions
                reportId={id}
                currentStatus={report.status}
                reportedUserId={report.target_type === 'user' ? report.target_id : report.reported?.id || null}
                targetType={report.target_type}
                targetId={report.target_id}
                adminId={adminId}
            />
        </div>
    )
}
