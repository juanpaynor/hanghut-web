/**
 * Browser-direct image upload for the event form.
 *
 * Images used to ride the server action alongside the rest of the form. That
 * routed them through a Vercel function, and Vercel refuses any request body
 * over 4.5MB at the edge — before Next, before our code, before any logging.
 * The organizer saw "An unexpected response was received from the server." and
 * we saw nothing at all, because no server code ever ran. `bodySizeLimit` in
 * next.config cannot lift that: the ceiling is the platform's, not the
 * framework's, so raising ours only moved the failure, never fixed it.
 *
 * So the file no longer touches our server. The browser sends it straight to
 * Supabase Storage and only the resulting URL travels in the form, which keeps
 * the action body in the kilobytes. The real ceiling becomes the bucket's own
 * 10MB — which is what the UI has been promising organizers all along.
 *
 * Uploads run as the signed-in partner, NOT the service role. Storage RLS
 * ("Partner owns prefix insert event-covers") already confines writes to a
 * folder named for a partner the caller owns, so the path prefix IS the
 * authorization check and a forged partnerId buys nothing. This is also what
 * the server action did before — it uploaded with the user-scoped client, not
 * the admin one — so the permission model is unchanged, only the hop is.
 */

import { createClient } from '@/lib/supabase/client'

export const COVER_BUCKET = 'event-covers'
export const EXTRA_BUCKET = 'event-images'

/**
 * The event-covers bucket caps a single object at 10MB and accepts these three
 * types and nothing else. Keep both in step with the bucket config: a client
 * cap below the bucket's is a needless rejection, one above it is an upload the
 * organizer waits through and then loses.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_LABEL = '10MB'
export const COVER_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/** Storage keys reject most punctuation outright; mirror what the server did. */
function storageSafeName(name: string): string {
    const cleaned = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '')
    return cleaned || 'image'
}

/**
 * Storage errors are terse and arrive mid-save, so name the three that actually
 * happen. "mime type ... is not supported" in particular is what an iPhone HEIC
 * produces, and that is not guessable from the raw text.
 */
function describeStorageError(message: string, file: File): string {
    const m = message.toLowerCase()
    if (m.includes('payload too large') || m.includes('exceeded the maximum') || m.includes('413')) {
        return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_IMAGE_LABEL} limit. Save a smaller version and try again.`
    }
    if (m.includes('mime') || m.includes('not supported') || m.includes('invalid_mime')) {
        const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        return isHeic
            ? `"${file.name}" is an iPhone HEIC photo, which we cannot read. In Settings → Camera → Formats choose "Most Compatible", or export it as JPEG.`
            : `"${file.name}" is not a format we accept. Use PNG, JPG or WebP.`
    }
    if (m.includes('row-level security') || m.includes('unauthorized') || m.includes('jwt')) {
        return 'Your session expired while uploading. Refresh the page, sign in again, and your draft will still be here.'
    }
    return `Could not upload "${file.name}": ${message}`
}

export interface UploadProgress {
    /** 1-based position and total, for "Uploading image 2 of 4". */
    index: number
    total: number
}

async function putObject(bucket: string, partnerId: string, file: File, suffix = ''): Promise<string> {
    const supabase = createClient()
    const path = `${partnerId}/${Date.now()}${suffix}-${storageSafeName(file.name)}`

    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
    })

    if (error || !data) {
        throw new Error(describeStorageError(error?.message ?? 'unknown storage error', file))
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path)
    return publicUrl
}

/**
 * Upload the cover and any new additional images, in order.
 *
 * Sequential on purpose. The organizers hitting this hardest are on Philippine
 * mobile connections — the last error we captured came from a Galaxy J4+ on
 * Android 8.1 — and six parallel multi-megabyte PUTs on a weak uplink is how
 * you turn a slow save into a failed one. Sequential also makes the progress
 * count honest rather than six bars all crawling at once.
 *
 * Throws on the first failure, with a message naming the file. A partial
 * upload leaves orphaned objects in the bucket and no event row, which is the
 * safe direction: storage is cheap, a half-saved event is not.
 */
export async function uploadEventImages(opts: {
    partnerId: string
    cover: File | null
    extras: File[]
    onProgress?: (p: UploadProgress) => void
}): Promise<{ coverUrl: string | null; extraUrls: string[] }> {
    const { partnerId, cover, extras, onProgress } = opts
    const total = (cover ? 1 : 0) + extras.length
    let done = 0

    let coverUrl: string | null = null
    if (cover) {
        onProgress?.({ index: ++done, total })
        coverUrl = await putObject(COVER_BUCKET, partnerId, cover)
    }

    const extraUrls: string[] = []
    for (let i = 0; i < extras.length; i++) {
        onProgress?.({ index: ++done, total })
        extraUrls.push(await putObject(EXTRA_BUCKET, partnerId, extras[i], `-${i}`))
    }

    return { coverUrl, extraUrls }
}
