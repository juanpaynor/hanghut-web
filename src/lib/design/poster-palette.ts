/**
 * Read a palette off the event poster, in the browser, with no dependencies.
 *
 * WHY THIS MOVED HERE. The hue-bucket extractor below started life as a local
 * function inside storefront-customization-form.tsx, powering one button
 * ("Match my cover"). Meanwhile ai-page-design was being told about the poster
 * like this:
 *
 *     has_background_image: !!ev.layout_config?.bg_image_url
 *
 * a boolean. So the model was asked to design around an image it had never
 * seen, while three hundred lines away we were already pulling real colours out
 * of that exact image and throwing them at a colour swatch. This file makes the
 * extraction shared, and widens one vibrant colour into a usable palette.
 *
 * CANVAS, NOT A SERVER DECODE, on purpose. The image is already decoded in the
 * organizer's browser — it is on screen. Reading it costs nothing, needs no
 * WASM decoder in the edge function, and cannot slow down or break a deploy.
 * The cost is CORS: getImageData throws on a canvas tainted by a cross-origin
 * image, and cover_image_url can be ANY host (Supabase Storage sends
 * Access-Control-Allow-Origin, a partner's own bucket may not). That is why
 * every path here returns null instead of throwing — a missing palette must
 * degrade to today's behaviour, never to a broken panel.
 */

export interface PosterPalette {
    /** Most saturated dominant hue — the poster's "colour", good as an accent. */
    vibrant: string
    /**
     * Deepest / palest substantial colours — a usable background-and-text pair.
     *
     * Both are null when the poster has no real contrast in it (a flat
     * monotone, a single-colour field). Reporting the SAME hex twice was the
     * first bug this hit in testing: a dark purple poster with a thin gold
     * accent returned dark === light === #1a1326, and a model told "darkest
     * #1a1326, lightest #1a1326" will happily write invisible text. Saying
     * nothing is correct there; the prompt already instructs the model to
     * lighten or darken for contrast when the palette cannot supply it.
     */
    dark: string | null
    light: string | null
    /** True when the poster is mostly dark, so the page should probably be too. */
    isDark: boolean
    /** Up to 5 colours by visual weight, most-used first. */
    swatches: string[]
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const toHex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('')

/** Pull the poster's pixels into a small array, or null if we are not allowed. */
async function samplePixels(imageUrl: string, size = 64): Promise<Uint8ClampedArray | null> {
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = document.createElement('img')
            // Must be set BEFORE src, or the request is made without CORS and
            // the canvas is tainted even when the host would have allowed it.
            el.crossOrigin = 'anonymous'
            el.onload = () => resolve(el)
            el.onerror = reject
            el.src = imageUrl
        })
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, size, size)
        return ctx.getImageData(0, 0, size, size).data
    } catch {
        return null // CORS, 404 or decode failure — all non-fatal here.
    }
}

/**
 * The original single-colour extractor, unchanged in behaviour.
 *
 * Kept as its own export because "Match my cover" wants exactly this: ONE
 * confident accent. Widening it to return a palette would have made that button
 * pick differently, which is a visible change to a shipped feature nobody asked
 * to change.
 */
export async function extractVibrantColor(imageUrl: string): Promise<string | null> {
    const data = await samplePixels(imageUrl, 48)
    if (!data) return null
    return vibrantFrom(data)
}

function vibrantFrom(data: Uint8ClampedArray): string | null {
    // 12 hue buckets, scored by saturation × mid-tone weight.
    const buckets = Array.from({ length: 12 }, () => ({ score: 0, r: 0, g: 0, b: 0, n: 0 }))
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        const light = (max + min) / 510
        if (sat < 0.25 || light < 0.12 || light > 0.92) continue // skip greys/extremes
        let h = 0
        const d = max - min
        if (d > 0) {
            if (max === r) h = ((g - b) / d + 6) % 6
            else if (max === g) h = (b - r) / d + 2
            else h = (r - g) / d + 4
        }
        const bucket = buckets[Math.floor(h * 2) % 12]
        const score = sat * (1 - Math.abs(light - 0.5))
        bucket.score += score
        bucket.r += r * score; bucket.g += g * score; bucket.b += b * score
        bucket.n += score
    }
    const best = buckets.reduce((a, c) => (c.score > a.score ? c : a))
    if (!best.n) return null
    return toHex(best.r / best.n, best.g / best.n, best.b / best.n)
}

/** Perceived brightness, 0–1. Rec. 601 weights: green reads far brighter to the
 *  eye than blue at the same value, and an unweighted average gets dark/light
 *  backwards on strongly blue or yellow posters. */
const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

/**
 * The full read. One pass over a 64×64 downsample.
 *
 * Colours are bucketed in a coarse 4×4×4 RGB grid rather than by hue, because
 * this half of the job is about WEIGHT ("what is most of this poster made of")
 * rather than vividness. The vibrant accent still comes from the hue pass
 * above, which is better at finding the one saturated colour that matters even
 * when it covers very little of the image.
 */
export async function extractPosterPalette(imageUrl: string): Promise<PosterPalette | null> {
    const data = await samplePixels(imageUrl, 64)
    if (!data) return null

    const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
    let lumaSum = 0
    let pixels = 0

    for (let i = 0; i < data.length; i += 4) {
        // Skip near-transparent pixels: a PNG poster with a cut-out subject is
        // mostly alpha-0 black, which would read as "a very dark poster".
        if (data[i + 3] < 128) continue
        const r = data[i], g = data[i + 1], b = data[i + 2]
        lumaSum += luma(r, g, b)
        pixels++
        const key = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)
        const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
        bin.n++; bin.r += r; bin.g += g; bin.b += b
        bins.set(key, bin)
    }
    if (!pixels) return null

    const ranked = [...bins.values()]
        .map(b => ({
            n: b.n,
            r: b.r / b.n,
            g: b.g / b.n,
            b: b.b / b.n,
        }))
        .sort((a, z) => z.n - a.n)

    // TWO different floors, because the two questions are different.
    //
    // "What is this poster made of" (swatches) wants a high bar — 3% — or the
    // list fills up with antialiasing.
    //
    // "What are its extremes" (dark/light) needs a much lower one. A poster can
    // be 97% deep purple with a thin gold headline, and that gold is the whole
    // design. At a 3% floor it was excluded, the pool collapsed to one colour,
    // and dark and light came back identical.
    const swatchPool = ranked.filter(c => c.n >= pixels * 0.03)
    const extremePool = ranked.filter(c => c.n >= pixels * 0.01)
    const pool = swatchPool.length ? swatchPool : ranked.slice(0, 3)
    const ends = extremePool.length ? extremePool : ranked.slice(0, 3)

    const byLuma = [...ends].sort((a, z) => luma(a.r, a.g, a.b) - luma(z.r, z.g, z.b))
    const darkest = byLuma[0]
    const lightest = byLuma[byLuma.length - 1]

    // Only offer the pair when it is genuinely a pair. Below this gap the two
    // ends are the same tone and recommending them as background-and-text
    // produces unreadable output.
    const hasContrast =
        luma(lightest.r, lightest.g, lightest.b) - luma(darkest.r, darkest.g, darkest.b) >= 0.22

    return {
        vibrant: vibrantFrom(data) ?? toHex(ranked[0].r, ranked[0].g, ranked[0].b),
        dark: hasContrast ? toHex(darkest.r, darkest.g, darkest.b) : null,
        light: hasContrast ? toHex(lightest.r, lightest.g, lightest.b) : null,
        isDark: lumaSum / pixels < 0.5,
        swatches: pool.slice(0, 5).map(c => toHex(c.r, c.g, c.b)),
    }
}
