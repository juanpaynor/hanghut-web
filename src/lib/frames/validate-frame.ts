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
    bitmap?: ImageBitmap
}

export async function validateFrameFile(file: File): Promise<FrameValidation> {
    const errors: string[] = []

    // 1. PNG. Checked by magic bytes, not by name or the browser-supplied type:
    //    a renamed JPEG passes both of those and fails only once it is a flat
    //    rectangle over someone's face.
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (!PNG_MAGIC.every((b, i) => head[i] === b)) {
        errors.push('That is not a PNG. Export as PNG with transparency.')
        return { ok: false, errors }
    }

    // 2. Size.
    if (file.size > FRAME_MAX_BYTES) {
        errors.push(
            `Too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`,
        )
    }

    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        return { ok: false, errors: [...errors, 'That PNG could not be read.'] }
    }

    // 3. Exact dimensions. Not "roughly 9:16" -- the app composites at exactly
    //    this size and anything else is resampled or letterboxed.
    if (bitmap.width !== FRAME_WIDTH || bitmap.height !== FRAME_HEIGHT) {
        errors.push(
            `Must be exactly ${FRAME_WIDTH}x${FRAME_HEIGHT}. This one is ${bitmap.width}x${bitmap.height}.`,
        )
    }

    // 4. Real alpha. A PNG can carry an alpha channel in which every pixel is
    //    opaque, which is the usual way a "transparent" export goes wrong -- and
    //    it would cover the user's photo completely.
    if (!(await hasRealTransparency(bitmap))) {
        errors.push(
            'No transparent area. The frame would cover the whole photo — export with a transparent background.',
        )
    }

    return { ok: errors.length === 0, errors, width: bitmap.width, height: bitmap.height, bitmap }
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
