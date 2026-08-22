import Image from 'next/image'
import { GalleryHorizontal } from 'lucide-react'

/**
 * Photo gallery.
 *
 * This section has been offered in the builder — and shipped inside the
 * "festival" template — since the section system launched, but the renderer had
 * no case for it. Three live storefronts had a *visible* Gallery section that
 * drew nothing at all. This is that missing renderer.
 */
export function GallerySection({
    config,
}: {
    config: { variant?: 'grid' | 'masonry'; columns?: number; images?: string[]; heading?: string }
}) {
    const images = (config.images ?? []).filter(Boolean)

    // An empty gallery renders nothing rather than an empty frame — a partner who
    // added the section but no photos should look like they have no gallery, not
    // like the page is broken.
    if (images.length === 0) return null

    const columns = config.columns ?? 3
    const colClass =
        columns === 2 ? 'sm:columns-2' : columns === 4 ? 'sm:columns-2 lg:columns-4' : 'sm:columns-2 lg:columns-3'
    const gridClass =
        columns === 2
            ? 'grid-cols-1 sm:grid-cols-2'
            : columns === 4
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

    return (
        <section className="container mx-auto px-4 py-12">
            {config.heading && (
                <h2 data-hh-section-title className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
                    {config.heading}
                </h2>
            )}

            {config.variant === 'masonry' ? (
                // CSS columns give a true masonry flow without measuring anything.
                // break-inside-avoid stops a photo being split across a column.
                <div className={`columns-1 ${colClass} gap-4 [&>*]:mb-4`}>
                    {images.map((src, i) => (
                        <div key={`${src}-${i}`} className="break-inside-avoid overflow-hidden rounded-xl border border-border/50">
                            {/* Heights vary in masonry, so this is the one place the
                                intrinsic ratio has to win — hence img over next/image fill. */}
                            <Image
                                src={src}
                                alt=""
                                width={800}
                                height={800}
                                sizes="(max-width: 640px) 100vw, 33vw"
                                className="w-full h-auto object-cover"
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className={`grid ${gridClass} gap-4`}>
                    {images.map((src, i) => (
                        <div
                            key={`${src}-${i}`}
                            data-hh-card
                            className="relative aspect-square overflow-hidden rounded-xl border border-border/50 group"
                        >
                            <Image
                                src={src}
                                alt=""
                                fill
                                sizes="(max-width: 640px) 100vw, 33vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}

/** Placeholder used by the builder preview when a gallery has no photos yet. */
export function GalleryEmptyHint() {
    return (
        <div className="container mx-auto px-4 py-12">
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
                <GalleryHorizontal className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="font-medium">No photos yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Add images to this section and they&rsquo;ll appear here.
                </p>
            </div>
        </div>
    )
}
