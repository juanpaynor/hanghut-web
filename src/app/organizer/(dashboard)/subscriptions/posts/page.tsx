import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PostComposer } from '@/components/organizer/subscriptions/post-composer'
import { PostsList } from '@/components/organizer/subscriptions/posts-list'

export const dynamic = 'force-dynamic'

async function getPostsAndTiers(partnerId: string) {
    const supabase = await createClient()
    const [postsRes, tiersRes] = await Promise.all([
        supabase
            .from('subscription_posts')
            .select('*, subscription_tiers(name)')
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false }),
        supabase
            .from('subscription_tiers')
            .select('id, name, price_monthly')
            .eq('partner_id', partnerId)
            .eq('is_active', true)
            .order('price_monthly', { ascending: true }),
    ])
    return { posts: postsRes.data || [], tiers: tiersRes.data || [] }
}

export default async function PostsPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const { posts, tiers } = await getPostsAndTiers(partnerId)

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2">
                <PostsList posts={posts} />
            </div>
            <div>
                <PostComposer tiers={tiers} />
            </div>
        </div>
    )
}
