/**
 * The four checks the app team asked for in team_comms #365, run in the browser
 * before anything is uploaded.
 *
 * These are a courtesy to the organizer, not the enforcement: the bucket itself
 * caps at 2 MB and image/png. The point of doing it here is that "your PNG has
 * no transparency" is a fixable sentence, where a storage rejection is not.
 */
export const FRAME_WIDTH = 1080
export const FRAME_HEIGHT = 1920
export const FRAME_MAX_BYTES = 2 * 1024 * 1024

/** Instagram's chrome. Anything here is covered by their UI. */
export const SAFE_TOP = 250
export const SAFE_BOTTOM = 390

export interface FrameValidation {
    ok: boolean
    errors: string[]
    width?: number
    height?: number
    /**
     * Whether a browser-side resize would clear every error that remains.
     *
     * True only when the file is a real PNG with real transparency and the only
     * complaints are its pixel size and its byte size -- the two things redrawing
     * it on a 1080x1920 canvas actually changes. We never offer to "fix" a JPEG
     * or an opaque export, because resizing neither adds an alpha channel nor
     * makes one mean anything.
     */
    canResize: boolean
    /**
     * True when the source is already 9:16, so a resize is a pure downscale with
     * nothing cropped and nothing padded. False means a resize will letterbox:
     * still lossless, but the artwork ends up smaller than the frame with
     * transparent bands, which the organizer should see before they accept it.
     */
    aspectMatches: boolean
}

export async function validateFrameFile(file: File): Promise<FrameValidation> {
    const errors: string[] = []
    const no = { canResize: false, aspectMatches: false }

    // 1. PNG. Checked by magic bytes, not by name or the browser-supplied type:
    //    a renamed JPEG passes both of those and fails only once it is a flat
    //    rectangle over someone's face.
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (!PNG_MAGIC.every((b, i) => head[i] === b)) {
        errors.push('That is not a PNG. Export as PNG with transparency.')
        return { ok: false, errors, ...no }
    }

    // 2. Size.
    const tooBig = file.size > FRAME_MAX_BYTES
    if (tooBig) {
        errors.push(
            `Too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`,
        )
    }

    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        return { ok: false, errors: [...errors, 'That PNG could not be read.'], ...no }
    }

    // 3. Exact dimensions. Not "roughly 9:16" -- the app composites at exactly
    //    this size and anything else is resampled or letterboxed.
    const wrongSize = bitmap.width !== FRAME_WIDTH || bitmap.height !== FRAME_HEIGHT
    if (wrongSize) {
        errors.push(
            `Must be exactly ${FRAME_WIDTH}x${FRAME_HEIGHT}. This one is ${bitmap.width}x${bitmap.height}.`,
        )
    }

    // 4. Real alpha. A PNG can carry an alpha channel in which every pixel is
    //    opaque, which is the usual way a "transparent" export goes wrong -- and
    //    it would cover the user's photo completely.
    const transparent = await hasRealTransparency(bitmap)
    if (!transparent) {
        errors.push(
            'No transparent area. The frame would cover the whole photo — export with a transparent background.',
        )
    }

    // A one-pixel rounding tolerance, so 1485x2640 and friends read as 9:16
    // rather than as a near miss that triggers a letterbox warning.
    const aspectMatches =
        Math.abs(bitmap.width / bitmap.height - FRAME_WIDTH / FRAME_HEIGHT) < 0.002

    const { width, height } = bitmap
    bitmap.close()

    return {
        ok: errors.length === 0,
        errors,
        width,
        height,
        canResize: transparent && (wrongSize || tooBig),
        aspectMatches,
    }
}

/**
 * Redraw the artwork at exactly 1080x1920 and hand back a new PNG.
 *
 * Fitted, never stretched: the scale is the smaller of the two ratios, so the
 * art keeps its proportions and any leftover is transparent canvas rather than
 * distortion. For a source that is already 9:16 the fit is exact and this is a
 * plain downscale.
 *
 * The byte size is a RESULT, not a guarantee. Re-encoding usually shrinks a file
 * because there are fewer pixels, but canvas PNG output is unoptimised and a
 * photographic frame can still land over 2 MB -- so the caller re-validates
 * rather than assuming this fixed anything.
 */
export async function resizeFrameFile(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file)

    const canvas = document.createElement('canvas')
    canvas.width = FRAME_WIDTH
    canvas.height = FRAME_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        bitmap.close()
        throw new Error('This browser cannot resize images. Export at 1080x1920 instead.')
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const scale = Math.min(FRAME_WIDTH / bitmap.width, FRAME_HEIGHT / bitmap.height)
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    // The canvas starts fully transparent, so anything the art does not cover
    // stays see-through -- which for a frame is exactly right.
    ctx.drawImage(bitmap, Math.round((FRAME_WIDTH - w) / 2), Math.round((FRAME_HEIGHT - h) / 2), w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('Could not re-encode that PNG.')

    const base = file.name.replace(/\.png$/i, '')
    return new File([blob], `${base}-${FRAME_WIDTH}x${FRAME_HEIGHT}.png`, {
        type: 'image/png',
        lastModified: Date.now(),
    })
}

/**
 * True when a meaningful share of pixels is see-through.
 *
 * Samples on a grid rather than reading every pixel: 1080x1920 is 2.07M pixels
 * and this runs on the organizer's laptop while they wait. A frame is a border
 * or a lower third, so transparency is the majority of the canvas and a grid
 * finds it immediately; the 2% floor is low enough not to reject a heavy design
 * and high enough to catch a fully opaque one.
 */
async function hasRealTransparency(bitmap: ImageBitmap): Promise<boolean> {
    const STEP = 8
    const w = Math.ceil(bitmap.width / STEP)
    const h = Math.ceil(bitmap.height / STEP)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return true // cannot prove otherwise; do not block the upload

    ctx.drawImage(bitmap, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    let transparent = 0
    const total = w * h
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) transparent++
    }
    return transparent / total > 0.02
}
