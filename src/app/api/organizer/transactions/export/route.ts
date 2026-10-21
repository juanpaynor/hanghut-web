import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartnerId, getUserRole } from '@/lib/auth/cached'
import {
    buildCsv,
    buildPdf,
    buildXlsx,
    CONTENT_TYPE,
    exportFilename,
    fetchExportRows,
    isExportFormat,
    type ExportBundle,
} from '@/lib/organizer/transaction-export'

/**
 * The Transactions-tab export, as a file download.
 *
 * GET /api/organizer/transactions/export?format=csv|xlsx|pdf&from=&to=&q=
 *
 * ── Why this replaced a server action ────────────────────────────────
 *
 * The CSV used to come back from a server action as a string, which the
 * browser wrapped in a Blob and clicked through a temporary <a> whose object
 * URL was revoked in the same frame. Two things came out of that:
 *
 *  1. Partners reported the file downloading and then a loading state that
 *     never cleared. Revoking an object URL in the same frame as click() is
 *     exactly the bug registrations-manager's downloadBlob() was written to
 *     avoid — on Safari and iOS it cancels the transfer or leaves the preview
 *     hanging on a URL that no longer resolves.
 *  2. Every new format would have had to serialise its bytes through the RSC
 *     payload. A route hands back a real HTTP response with a real
 *     Content-Disposition, so csv, xlsx and pdf are one code path.
 *
 * ── Auth ─────────────────────────────────────────────────────────────
 *
 * Gated identically to the payouts page itself: `owner` or `finance` only,
 * resolved through getUserRole/getPartnerId. The old action resolved the
 * partner with getActingPartnerId, which answers "owner, or platform-support
 * seat" and returns null for an ordinary team member — so a finance seat that
 * could read the whole Transactions tab was told "No partner account" when it
 * pressed Export. Role gate and data gate now come from the same place.
 */

export const dynamic = 'force-dynamic'
/** jsPDF and SheetJS are Node libraries; neither runs on the edge runtime. */
export const runtime = 'nodejs'
/** A 20,000-row workbook or a 1,200-row PDF is real work. The default 15s is
 *  not enough and a cut-off response reads to the browser as a corrupt file. */
export const maxDuration = 120

/** A date filter arrives as yyyy-MM-dd from the picker. Anything else is
 *  dropped rather than passed to Postgres, which would 400 the whole query. */
function ymd(v: string | null): string | undefined {
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
}

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams

    const format = params.get('format') ?? 'csv'
    if (!isExportFormat(format)) {
        return NextResponse.json({ error: `Unsupported format "${format}"` }, { status: 400 })
    }

    const { user } = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const role = await getUserRole(user.id)
    if (!role || !['owner', 'finance'].includes(role.role)) {
        return NextResponse.json({ error: 'Not allowed to export payouts' }, { status: 403 })
    }

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) return NextResponse.json({ error: 'No partner account' }, { status: 404 })

    const filters = {
        from: ymd(params.get('from')),
        to: ymd(params.get('to')),
        search: params.get('q')?.trim() || undefined,
    }

    try {
        const supabase = await createClient()

        const [{ rows, truncated }, { data: partner }] = await Promise.all([
            fetchExportRows(supabase, partnerId, filters),
            supabase.from('partners').select('business_name').eq('id', partnerId).maybeSingle(),
        ])

        const bundle: ExportBundle = {
            rows,
            truncated,
            partnerName: partner?.business_name || 'Organizer',
            filters,
            generatedAt: new Date().toISOString(),
        }

        // An empty file is a worse answer than being told the period is empty,
        // because nothing in a 1-line CSV says whether the filter was wrong.
        if (rows.length === 0) {
            return NextResponse.json(
                { error: 'No transactions in this period.' },
                { status: 404 },
            )
        }

        const body: string | Uint8Array =
            format === 'csv' ? buildCsv(bundle)
                : format === 'xlsx' ? await buildXlsx(bundle)
                    : await buildPdf(bundle)

        return new NextResponse(body as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': CONTENT_TYPE[format],
                'Content-Disposition': `attachment; filename="${exportFilename(filters, format)}"`,
                // The row count travels in a header so the UI can report
                // "453 transactions exported" without parsing the file, and
                // say so when the cap bit.
                'X-Export-Rows': String(rows.length),
                'X-Export-Truncated': truncated ? '1' : '0',
                // A financial export is per-partner and per-moment. Caching it
                // anywhere, including a shared CDN, is how one organizer ends
                // up holding another's ledger.
                'Cache-Control': 'no-store, max-age=0',
            },
        })
    } catch (e) {
        console.error('[Transactions export] failed:', e)
        return NextResponse.json({ error: 'Could not build the export.' }, { status: 500 })
    }
}
