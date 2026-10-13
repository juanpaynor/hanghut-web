'use client'

/**
 * Shrink an image in the browser before it is uploaded.
 *
 * WHY THIS EXISTS
 * Uploads here take two hops: the browser posts the file to a Next server
 * action, which then re-uploads it to Supabase Storage. Every byte therefore
 * crosses the network twice, and the server action buffers the whole file
 * before forwarding it. A 9MB phone photo on a PH mobile connection is a long,
 * silent wait — and the destination is a page BACKGROUND, which never needs
 * more than a couple of thousand pixels on its long edge.
 *
 * Re-encoding to WebP at 2048px typically turns an 8–12MB camera JPEG into
 * 200–500KB. That is the whole fix: the double hop stops mattering once the
 * payload is 30x smaller.
 *
 * SAFETY
 * This must never be the reason an upload fails. Every failure path — no
 * canvas, no WebP encoder, a decode error, a result that came out BIGGER —
 * returns the original File untouched and lets the server deal with it.
 */

export type DownscaleOptions = {
    /** Longest edge, in CSS pixels. Images already smaller are not resized. */
    maxEdge?: number
    /** WebP quality, 0–1. */
    quality?: number
}

const DEFAULTS: Required<DownscaleOptions> = { maxEdge: 2048, quality: 0.82 }

/** Files at or below this are already cheap to send; don't burn CPU on them. */
const SKIP_BELOW_BYTES = 400 * 1024

function swapExtension(name: string, ext: string) {
    const base = name.replace(/\.[^./\\]+$/, '')
    return `${base || 'image'}.${ext}`
}

export async function downscaleImage(file: File, options: DownscaleOptions = {}): Promise<File> {
    const { maxEdge, quality } = { ...DEFAULTS, ...options }

    // GIFs would lose their animation, and SVGs are already vector.
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return file
    }

    let bitmap: ImageBitmap | null = null
    try {
        if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

        // `from-image` applies the EXIF orientation, so portrait phone shots do
        // not come back rotated — the canvas would otherwise bake in the wrong
        // orientation permanently.
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

        const longest = Math.max(bitmap.width, bitmap.height)
        const scale = longest > maxEdge ? maxEdge / longest : 1

        // Already small in both bytes and pixels: nothing worth doing.
        if (scale === 1 && file.size <= SKIP_BELOW_BYTES) return file

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bitmap.width * scale)
        canvas.height = Math.round(bitmap.height * scale)

        const ctx = canvas.getContext('2d')
        if (!ctx) return file
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

        const blob = await new Promise<Blob | null>(resolve => {
            try {
                canvas.toBlob(resolve, 'image/webp', quality)
            } catch {
                resolve(null)
            }
        })

        // A browser without a WebP encoder hands back null, or silently gives a
        // PNG that is larger than the JPEG we started with. Either way, keep the
        // original rather than making the upload worse.
        if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file

        return new File([blob], swapExtension(file.name, 'webp'), {
            type: 'image/webp',
            lastModified: Date.now(),
        })
    } catch {
        return file
    } finally {
        bitmap?.close?.()
    }
}
