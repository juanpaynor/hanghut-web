import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page'
import { source } from '@/lib/docs/source'
import { openapi } from '@/lib/docs/openapi'
import { OpenAPIPage } from '../openapi-page'

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params
    const page = source.getPage(slug)

    // The spec produces one page per operation and no root. Without this the
    // reference's own front door -- /docs/api, and so docs.hanghut.com/api --
    // would 404, which is the one URL everything else links to.
    if (!page) {
        if (slug?.length) notFound()
        return <IndexPage />
    }

    // `OpenAPIPageProps` is a union: the spec variant carries `payload`, the
    // preloaded variant carries `preloaded`. Spreading both produces a hybrid
    // the renderer rejects with "the document ... is not in the page props",
    // so resolve the bundled document here and pass only the spec variant.
    const props = page.data.getOpenAPIPageProps()
    const { bundled } = await openapi.getSchema(props.document)

    return (
        <DocsPage toc={page.data.toc}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription>{page.data.description}</DocsDescription>
            <DocsBody>
                <OpenAPIPage {...props} payload={{ bundled }} />
            </DocsBody>
        </DocsPage>
    )
}

/** Front door: every operation, grouped by the tag the spec gives it. */
function IndexPage() {
    const groups = new Map<string, { url: string; title: string; description?: string }[]>()

    for (const p of source.getPages()) {
        // `slugs` is [operationId]; the tag is what the spec's `tags` put it under.
        const tag = (p.data as { _openapi?: { tag?: string } })._openapi?.tag ?? 'Reference'
        const list = groups.get(tag) ?? []
        // title is optional on a page; fall back to the operationId, which is
        // what the slug already is, so a row is never blank.
        list.push({ url: p.url, title: p.data.title ?? p.slugs.join('/'), description: p.data.description })
        groups.set(tag, list)
    }

    return (
        <DocsPage>
            <DocsTitle>HangHut API</DocsTitle>
            <DocsDescription>
                Ticketing, attendees and payouts. Every endpoint takes a Bearer API key
                from Organizer → Settings → API, and is limited to 100 requests a minute.
            </DocsDescription>
            <DocsBody>
                {[...groups.entries()].map(([tag, items]) => (
                    <section key={tag}>
                        <h2>{tag}</h2>
                        <ul>
                            {items.map((i) => (
                                <li key={i.url}>
                                    <Link href={i.url}>{i.title}</Link>
                                    {i.description ? ` — ${i.description}` : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </DocsBody>
        </DocsPage>
    )
}

export async function generateMetadata(
    { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Metadata> {
    const { slug } = await params
    const page = source.getPage(slug)
    if (!page) {
        return {
            title: 'API Documentation | HangHut',
            description:
                'REST API for events, checkout, tickets, orders and webhooks.',
        }
    }
    return {
        title: `${page.data.title ?? 'API'} | HangHut API`,
        description: page.data.description,
    }
}

export function generateStaticParams() {
    return [{ slug: [] }, ...source.generateParams()]
}
