'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Trash2, Lock, Globe, ExternalLink, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { deleteSubscriptionPost } from '@/lib/subscriptions/actions'

interface Post {
    id: string
    title: string
    body: string
    published_at: string | null
    gated_url: string | null
    gated_url_label: string | null
    created_at: string
    subscription_tiers: { name: string } | null
}

export function PostsList({ posts: initial }: { posts: Post[] }) {
    const { toast } = useToast()
    const [posts, setPosts] = useState(initial)
    const [isPending, startTransition] = useTransition()

    const handleDelete = (postId: string, title: string) => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
        startTransition(async () => {
            const result = await deleteSubscriptionPost(postId)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                setPosts(prev => prev.filter(p => p.id !== postId))
                toast({ title: 'Post deleted' })
            }
        })
    }

    if (posts.length === 0) {
        return (
            <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-semibold">No posts yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first exclusive post for subscribers</p>
            </Card>
        )
    }

    return (
        <div className="space-y-3">
            {posts.map(post => {
                const isPublished = post.published_at && new Date(post.published_at) <= new Date()
                return (
                    <Card key={post.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    {isPublished
                                        ? <Globe className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        : <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    }
                                    <p className="font-semibold truncate">{post.title}</p>
                                    <Badge variant="outline" className="text-xs shrink-0">
                                        {(post.subscription_tiers as any)?.name || 'All tiers'}
                                    </Badge>
                                    {!isPublished && <Badge variant="secondary" className="text-xs">Draft</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                                {post.gated_url && (
                                    <a
                                        href={post.gated_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        {post.gated_url_label || post.gated_url}
                                    </a>
                                )}
                                <p className="text-xs text-muted-foreground mt-2">
                                    {isPublished
                                        ? `Published ${format(new Date(post.published_at!), 'MMM d, yyyy')}`
                                        : `Created ${format(new Date(post.created_at), 'MMM d, yyyy')}`
                                    }
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => handleDelete(post.id, post.title)}
                                disabled={isPending}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </Card>
                )
            })}
        </div>
    )
}
