import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
// NOT 'fumadocs-ui/page' -- that re-exports the DOCS layout's page, and we
// render the NOTEBOOK layout. Mixing them is why the table of contents column
// never appeared: the TOC is a slot the matching layout mounts, so a page from
// the wrong family passes `toc` to something that is not listening.
import { DocsPage, DocsBody, DocsTitle } from 'fumadocs-ui/layouts/notebook/page'
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
        <DocsPage
            toc={page.data.toc}
            // The table of contents is OFF, and it is not a style choice.
            // fumadocs-openapi only emits TOC entries when a page carries
            // `showTitle` (see utils/pages/to-static-data.js) -- and we render ONE
            // operation per page, so the only heading it could list is the page
            // title already at the top. The column was therefore always empty,
            // and an empty column is just dead space on the right.
            tableOfContent={{ enabled: false }}
            tableOfContentPopover={{ enabled: false }}
            // With no TOC to make room for, let the article take the width back.
            // It matters here more than on a prose page: fumadocs-openapi puts
            // the example request and response in a second column.
            full
        >
            <DocsTitle>{page.data.title}</DocsTitle>
            {/* No <DocsDescription>. The description in the spec is Markdown, and
                this slot renders a plain string -- so it printed the raw source,
                asterisks and backticks included, directly above the SAME text
                rendered properly by OpenAPIPage below. */}
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
            <DocsBody>
                <p className="text-fd-muted-foreground">
                    Ticketing, attendees and payouts. Every endpoint takes a Bearer API key
                    from Organizer → Settings → API, and is limited to 100 requests a minute.
                </p>
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
