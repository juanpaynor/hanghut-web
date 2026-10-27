import { notFound } from 'next/navigation'
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page'
import { source } from '@/lib/docs/source'
import { openapi } from '@/lib/docs/openapi'
import { OpenAPIPage } from '../openapi-page'

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params
    const page = source.getPage(slug)
    if (!page) notFound()

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

export function generateStaticParams() {
    return source.generateParams()
}
