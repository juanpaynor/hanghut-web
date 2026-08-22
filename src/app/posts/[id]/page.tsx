import { createPublicClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { cache } from 'react'
import { format } from 'date-fns'
import type { Metadata } from 'next'
import { Heart, MessageCircle, MapPin, BadgeCheck, Ticket } from 'lucide-react'
import { StoreButtons } from '@/components/landing/store-buttons'

/**
 * Public landing page for a shared post — /posts/{id}.
 *
 * This page exists for people who tap a shared link WITHOUT the app installed.
 * With the app installed, iOS/Android hand the URL straight to it and this never
 * renders. Contract agreed with the app team in team_comms #250/#252/#253.
 *
 * ── Visibility is enforced HERE, on every request ─────────────────────────────
 * The app suppresses the share button on non-public and story posts (#253 a/b), so
 * every link it MINTS is public and non-story. That is not the same as every
 * request this route RECEIVES being safe:
 *   - /posts/{uuid} is directly addressable — ids can be typed or guessed,
 *   - and a post can be public when shared and set to private LATER, which the
 *     already-circulating link outlives.
 * So we filter server-side rather than trusting the client gate, and RLS on `posts`
 * (anon sees visibility='public' only) is a second, independent layer under it.
 *
 * force-dynamic for the same reason: caching this would keep serving a post after
 * its author made it private. Correctness beats the cache hit on a page whose whole
 * job is to respect a privacy setting.
 *
 * ── Location is deliberately coarse ───────────────────────────────────────────
 * 243 of the ~438 public posts carry exact latitude/longitude. A crawlable public
 * page must never render those, so this page reads `city` ONLY — no lat/long, no
 * h3_cell (which is fine-grained enough to locate someone at high resolution), and
 * no external_place_name. Confirmed with the app team that their share card sends
 * zero location, so nothing downstream expects precision.
 *
 * ── noindex ───────────────────────────────────────────────────────────────────
 * Personal posts are for link recipients, not for search engines (#253 d). OG tags
 * are still emitted — those drive the chat/social preview and are unaffected by
 * robots directives.
 */

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const getPost = cache(async (id: string) => {
    // Reject anything that isn't a uuid before touching the DB — Postgres raises
    // 22P02 on a malformed uuid, which would surface as a 500 rather than a 404.
    if (!UUID_RE.test(id)) return null

    const supabase = createPublicClient()
    const { data } = await supabase
        .from('posts')
        .select(`
            id, content, image_url, image_urls, video_url, thumbnail_url,
            city, created_at, like_count, comment_count, event_id, vibe_tag,
            events ( slug ),
            user:users!posts_user_id_fkey ( display_name, username, avatar_url, is_verified )
        `)
        .eq('id', id)
        // Both filters are the point of this route — see the header comment.
        .eq('visibility', 'public')
        .eq('is_story', false)
        .maybeSingle()

    return data ?? null
})

/** First usable image, for the share preview and the hero. */
function primaryImage(post: any): string | null {
    const many = Array.isArray(post?.image_urls) ? post.image_urls.filter(Boolean) : []
    return many[0] || post?.image_url || post?.thumbnail_url || null
}

/**
 * PostgREST returns an embedded to-one as an object, but resolves some
 * relationships to a single-element array instead. Normalise rather than let the
 * author silently degrade to "Someone" on the array shape.
 */
function author(post: any): any | null {
    const u = post?.user
    if (!u) return null
    return Array.isArray(u) ? (u[0] ?? null) : u
}

function authorName(post: any): string {
    const u = author(post)
    return u?.display_name || (u?.username ? `@${u.username}` : 'Someone')
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const post = await getPost(id)

    // Deliberately identical to a genuinely missing post: saying "this post is
    // private" would confirm the id exists, which is exactly what 404-over-403
    // avoids (#252 a).
    if (!post) return { title: 'Post not found', robots: { index: false, follow: false } }

    const name = authorName(post)
    const plain = (post.content || '').replace(/\s+/g, ' ').trim()
    const description = plain
        ? plain.slice(0, 157) + (plain.length > 157 ? '…' : '')
        : `See ${name}'s post on HangHut.`

    const img = primaryImage(post)

    return {
        title: `${name} on HangHut`,
        description,
        // Personal content: never index, and don't follow into profiles either.
        robots: { index: false, follow: false },
        openGraph: {
            type: 'article',
            url: `/posts/${post.id}`,
            siteName: 'HangHut',
            title: `${name} on HangHut`,
            description,
            images: img ? [{ url: img, width: 1200, height: 630, alt: description }] : [],
        },
        twitter: {
            card: img ? 'summary_large_image' : 'summary',
            title: `${name} on HangHut`,
            description,
            images: img ? [img] : [],
        },
    }
}

export default async function PublicPostPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const post = await getPost(id)
    if (!post) notFound()

    const user = author(post)
    const name = authorName(post)
    const images: string[] = Array.isArray(post.image_urls) && post.image_urls.length > 0
        ? post.image_urls.filter(Boolean)
        : (post.image_url ? [post.image_url] : [])

    // A to-one embed comes back as an array from PostgREST here, so normalise
    // before reading it rather than trusting either shape.
    const linkedEvent = post.events as unknown as { slug?: string | null } | { slug?: string | null }[] | null
    const eventSlug = Array.isArray(linkedEvent) ? linkedEvent[0]?.slug : linkedEvent?.slug

    return (
        <main className="min-h-screen bg-background">
            <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">

                <article className="rounded-2xl border border-border bg-card overflow-hidden">
                    {/* Author */}
                    <header className="flex items-center gap-3 p-4">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                            {user?.avatar_url ? (
                                <Image
                                    src={user.avatar_url}
                                    alt=""
                                    fill
                                    sizes="44px"
                                    className="object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                                    {name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold">{name}</span>
                                {user?.is_verified && (
                                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified" />
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <time dateTime={post.created_at}>
                                    {format(new Date(post.created_at), 'd MMM yyyy')}
                                </time>
                                {/* City only — never coordinates. See header comment. */}
                                {post.city && (
                                    <>
                                        <span aria-hidden>·</span>
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {post.city}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Caption. Plain user text rendered as text — never as HTML. */}
                    {post.content && (
                        <p className="whitespace-pre-wrap px-4 pb-4 text-[15px] leading-relaxed">
                            {post.content}
                        </p>
                    )}

                    {/* Media */}
                    {images.length > 0 && (
                        <div className={images.length > 1 ? 'grid grid-cols-2 gap-1' : ''}>
                            {images.slice(0, 4).map((src, i) => (
                                <div
                                    key={i}
                                    className={
                                        images.length === 1
                                            ? 'relative aspect-[4/5] w-full bg-muted'
                                            : 'relative aspect-square w-full bg-muted'
                                    }
                                >
                                    <Image
                                        src={src}
                                        alt=""
                                        fill
                                        sizes="(max-width: 672px) 100vw, 672px"
                                        className="object-cover"
                                        priority={i === 0}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {!images.length && post.video_url && (
                        <video
                            controls
                            playsInline
                            poster={post.thumbnail_url || undefined}
                            className="w-full bg-black"
                        >
                            <source src={post.video_url} />
                        </video>
                    )}

                    {/* Counts are informational here — engagement happens in the app. */}
                    <footer className="flex items-center gap-4 px-4 py-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Heart className="h-4 w-4" />
                            {post.like_count ?? 0}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <MessageCircle className="h-4 w-4" />
                            {post.comment_count ?? 0}
                        </span>
                    </footer>
                </article>

                {/* Posts can carry an attached event — the one link worth following on web,
                    since that page is fully functional without the app. */}
                {post.event_id && (
                    <Link
                        href={`/events/${eventSlug || post.event_id}`}
                        className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                    >
                        <Ticket className="h-5 w-5 shrink-0 text-primary" />
                        <div>
                            <div className="font-semibold">View the event</div>
                            <div className="text-sm text-muted-foreground">
                                Get tickets on HangHut
                            </div>
                        </div>
                    </Link>
                )}

                {/* This page only renders for visitors WITHOUT the app — anyone who has it
                    was handed off by the Universal/App Link before reaching here. */}
                <section className="mt-8 rounded-2xl border border-border bg-muted/30 p-6 text-center">
                    <h2 className="text-lg font-semibold">See more on HangHut</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        Get the app to follow {name}, join hangouts near you, and grab tickets to events.
                    </p>
                    <StoreButtons className="mt-5 justify-center" />
                </section>
            </div>
        </main>
    )
}
