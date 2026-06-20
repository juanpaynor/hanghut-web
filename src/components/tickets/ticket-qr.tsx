'use client'

import { QRCodeSVG } from 'qrcode.react'

/**
 * Renders a scannable QR from the ticket's `qr_code` payload string
 * (e.g. "ticketId:eventId:userId"). Client-rendered so the hosted ticket page
 * stays static/cacheable — zero server CPU per view, and the payload is
 * immutable (screenshot-friendly; single-use is enforced at scan time).
 */
export function TicketQR({ value, size = 200 }: { value: string; size?: number }) {
    return (
        <div className="rounded-xl bg-white p-3">
            <QRCodeSVG
                value={value}
                size={size}
                level="M"
                marginSize={0}
                className="h-auto w-full"
                style={{ maxWidth: size }}
            />
        </div>
    )
}
