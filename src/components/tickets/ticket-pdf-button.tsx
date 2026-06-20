'use client'

import { useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download, Loader2 } from 'lucide-react'

export interface PdfTicket {
    ticket_number: string | null
    qr_code: string
    tier: string | null
    seat: string | null
}

interface TicketPdfButtonProps {
    eventTitle: string
    eventDate: string | null
    venue: string | null
    organizer: string | null
    tickets: PdfTicket[]
}

/**
 * On-demand ticket PDF — generated client-side only when the buyer clicks, so
 * the hosted ticket page stays static/cacheable and we never render PDFs at
 * purchase time. The QR is rasterized from a hidden QRCodeCanvas (the same
 * payload the scanner reads), so the printed code scans identically.
 */
export function TicketPdfButton({ eventTitle, eventDate, venue, organizer, tickets }: TicketPdfButtonProps) {
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
    const [busy, setBusy] = useState(false)

    async function handleDownload() {
        setBusy(true)
        try {
            const { jsPDF } = await import('jspdf')
            const doc = new jsPDF({ unit: 'mm', format: 'a4' })
            const pageW = doc.internal.pageSize.getWidth()
            const pageH = doc.internal.pageSize.getHeight()
            const cx = pageW / 2

            tickets.forEach((t, i) => {
                if (i > 0) doc.addPage()
                let y = 28

                doc.setTextColor(15, 23, 42)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(20)
                doc.text(eventTitle, cx, y, { align: 'center', maxWidth: pageW - 30 })
                y += 12

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(11)
                doc.setTextColor(100, 116, 139)
                if (eventDate) { doc.text(eventDate, cx, y, { align: 'center' }); y += 6 }
                if (venue) { doc.text(venue, cx, y, { align: 'center', maxWidth: pageW - 30 }); y += 6 }
                if (organizer) { doc.text(`Presented by ${organizer}`, cx, y, { align: 'center' }); y += 6 }
                y += 8

                const canvas = canvasRefs.current[i]
                if (canvas) {
                    const size = 70
                    doc.addImage(canvas.toDataURL('image/png'), 'PNG', cx - size / 2, y, size, size)
                    y += size + 10
                }

                if (t.seat) {
                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(15)
                    doc.setTextColor(15, 23, 42)
                    doc.text(t.seat, cx, y, { align: 'center' })
                    y += 8
                }

                const meta = [t.tier, t.ticket_number ? `#${t.ticket_number}` : null].filter(Boolean).join('   ·   ')
                if (meta) {
                    doc.setFont('helvetica', 'normal')
                    doc.setFontSize(11)
                    doc.setTextColor(100, 116, 139)
                    doc.text(meta, cx, y, { align: 'center' })
                }

                doc.setFontSize(9)
                doc.setTextColor(148, 163, 184)
                doc.text('Single use · Present this at the entrance', cx, pageH - 18, { align: 'center' })
            })

            const safe = eventTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tickets'
            doc.save(`${safe}-tickets.pdf`)
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            {/* Hidden high-res QR canvases used only to rasterize into the PDF. */}
            <div aria-hidden style={{ position: 'absolute', left: -9999, top: 0, width: 0, height: 0, overflow: 'hidden' }}>
                {tickets.map((t, i) => (
                    <QRCodeCanvas
                        key={i}
                        value={t.qr_code}
                        size={320}
                        level="M"
                        marginSize={2}
                        ref={(el) => { canvasRefs.current[i] = el }}
                    />
                ))}
            </div>

            <button
                type="button"
                onClick={handleDownload}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
            </button>
        </>
    )
}
