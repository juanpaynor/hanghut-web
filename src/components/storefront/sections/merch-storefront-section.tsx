import { MerchSection } from '@/components/merch/merch-section'
import type { PublicMerchProduct } from '@/lib/merch/public-actions'

/**
 * Merch on the brand page.
 *
 * A thin wrapper around the same <MerchSection> the event page uses — cart,
 * variant picker, claim/ship choice and checkout are shared, so a fix in one
 * place lands on both surfaces.
 *
 * The only real difference is that no `eventId` is passed. That flows through
 * create-merch-intent as `event_id: null`, which is exactly what a storefront
 * purchase is: merch bought from the brand rather than at a specific show.
 * `getPublicMerch` already enforces the per-partner merch_enabled gate, and
 * reserve_merch enforces it again server-side, so an ungated partner can never
 * sell here even if this section were somehow configured.
 */
export function MerchStorefrontSection({
    organizerId,
    products,
    config,
}: {
    organizerId: string
    products: PublicMerchProduct[]
    config?: { heading?: string; subheading?: string }
}) {
    if (products.length === 0) return null

    return (
        <section id="merch" className="container mx-auto px-4 py-12">
            <div className="mb-6">
                <h2 data-hh-section-title className="text-2xl md:text-3xl font-bold tracking-tight">
                    {config?.heading || 'Merch'}
                </h2>
                {config?.subheading && (
                    <p className="text-muted-foreground mt-1">{config.subheading}</p>
                )}
            </div>
            <MerchSection organizerId={organizerId} products={products} showHeading={false} />
        </section>
    )
}
