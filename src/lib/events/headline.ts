/**
 * Headline size, chosen from the title rather than fixed.
 *
 * The copy column is 5 of 12 tracks, so a long UNBREAKABLE word is what decides
 * whether the headline fits — not the total length. "TABACHINGCHONG" is one
 * 14-character token with nowhere to wrap, and at the old flat xl:text-6xl it
 * ran straight out of its track and under the poster panel, which paints over
 * it. Most long titles are safe because they hyphenate ("WIMBLEDON-INSPIRED",
 * "HAHA-LLOWEENIES") and the browser may break after a hyphen; the measurement
 * below splits on hyphens and dashes for that reason, so a hyphenated monster
 * is not punished for a break it can actually take.
 *
 * Across the 273 live and recent events the worst unbreakable run is 14, and 9
 * titles carry a word over 12 — so this is not a one-off for one comedy show.
 */
export function headlineSize(title: string) {
    const t = title.trim()
    // Hyphens, en and em dashes and slashes are all legal break opportunities.
    const runs = t.split(/[\s\u2010-\u2015/-]+/).filter(Boolean)
    const longest = runs.reduce((m, w) => Math.max(m, w.length), 0)

    if (longest >= 14 || t.length > 56) return 'text-3xl md:text-4xl xl:text-5xl'
    if (longest >= 10 || t.length > 34) return 'text-4xl md:text-5xl xl:text-[3.25rem]'
    return 'text-4xl md:text-5xl xl:text-6xl'
}
