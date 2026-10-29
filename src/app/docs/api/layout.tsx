import { RootProvider } from 'fumadocs-ui/provider/next'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import { source } from '@/lib/docs/source'

/**
 * RootProvider lives here rather than in the app's root layout: it is only
 * needed by the docs subtree, and the app root is on the money path.
 *
 * The NOTEBOOK layout, not the default `docs` one: it puts the brand on a
 * full-width bar and drops the sidebar beneath it, which leaves the content
 * column wider. That width is the point -- fumadocs-openapi renders request and
 * response panels side by side, and in the three-column `docs` layout they are
 * squeezed between a sidebar and a table of contents.
 *
 * The `hh-docs` wrapper is what scopes the display font to the reference. The
 * COLOURS are not scoped here -- they are on :root in globals.css, because
 * Fumadocs portals its search dialog to <body> and a scoped block would skin
 * the page while leaving the dialog grey.
 */
export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <RootProvider
            // White by default, regardless of the reader's OS. Every other page
            // in the product is light -- the landing was deliberately rebuilt
            // from dark for exactly this reason -- and a reference that turns
            // black because of a system setting reads as a different product.
            // The toggle stays, so anyone who wants dark can still have it.
            theme={{ defaultTheme: 'light', enableSystem: false }}
        >
            <div className="hh-docs">
                <DocsLayout
                    tree={source.pageTree}
                    nav={{ title: 'HangHut API', url: '/docs', mode: 'top' }}
                    // Tabs would be a second navigation row above a reference that
                    // already has one group. Off until there is a second section.
                    tabs={false}
                >
                    {children}
                </DocsLayout>
            </div>
        </RootProvider>
    )
}
