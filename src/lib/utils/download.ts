/**
 * One download path for every export in the dashboard.
 *
 * SheetJS's own `writeFile` sniffs the environment first — it probes for
 * `fs.writeFileSync` before falling back to a Blob, and under a bundler that
 * probe is neither a working Node path nor a clean failure. Building the
 * anchor by hand has always downloaded correctly, so everything uses this.
 *
 * ── The revoke is deferred on purpose ────────────────────────────────
 *
 * Revoking the object URL in the same frame as `click()` cancels the download
 * in Safari, and on iOS — where `download` opens a preview rather than saving
 * a file — it leaves that preview loading forever against a URL that no longer
 * resolves. That is the "it downloads but the loading screen gets stuck" report
 * from the payouts tab: its export revoked immediately, having been written
 * before this helper existed.
 *
 * This file is the only place that number lives, so the next export to be
 * added cannot get it wrong again.
 */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
        a.remove()
        URL.revokeObjectURL(url)
    }, 0)
}

/** The filename a Content-Disposition header asked for, or null if the server
 *  did not name one. Lets a download keep the server's name — which carries
 *  the date range — instead of the caller guessing it a second time. */
export function filenameFromDisposition(header: string | null): string | null {
    if (!header) return null
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
    if (star?.[1]) {
        try { return decodeURIComponent(star[1]) } catch { /* fall through */ }
    }
    const plain = /filename="?([^";]+)"?/i.exec(header)
    return plain?.[1] ?? null
}
