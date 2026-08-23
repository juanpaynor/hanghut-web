import { LoadingOverlay } from '@/components/ui/loading-overlay'

/**
 * Scoped deliberately.
 *
 * This used to live at src/app/loading.tsx, which put a Suspense boundary above
 * EVERY route. Next flushes the shell as soon as it can stream, which locks the
 * HTTP status at 200 — so notFound() could still render the 404 page but never
 * send a 404. Every missing event, storefront and mistyped URL on the site was a
 * soft 404, and search engines index those as real pages.
 *
 * Keeping it here retains the transition overlay for the heavy authenticated
 * areas, where nothing is indexed and the status code does not matter.
 */
export default function Loading() {
    return <LoadingOverlay isLoading message="HangHut..." />
}
