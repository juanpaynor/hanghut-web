import { RootProvider } from 'fumadocs-ui/provider/next'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '@/lib/docs/source'

/**
 * RootProvider lives here rather than in the app's root layout: it is only
 * needed by the docs subtree, and the app root is on the money path.
 */
export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <RootProvider>
            <DocsLayout tree={source.pageTree} nav={{ title: 'HangHut API', url: '/docs' }}>
                {children}
            </DocsLayout>
        </RootProvider>
    )
}
