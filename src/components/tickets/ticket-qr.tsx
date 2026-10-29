'use client'

import { QRCodeSVG } from 'qrcode.react'

/**
 * Renders a scannable QR from the ticket's `qr_code` payload string
 * (e.g. "ticketId:eventId:userId"). Client-rendered so the hosted ticket page
 * stays static/cacheable — zero server CPU per view, and the payload is
 * immutable (screenshot-friendly; single-use is enforced at scan time).
 *
 * EVERY COLOUR HERE IS PINNED, and that is the whole point of this component.
 *
 * A phone in dark mode does not just restyle a page it is told to restyle. Chrome
 * and Samsung Internet on Android apply "force dark" to any page that has not
 * declared a colour scheme, and iOS Smart Invert does the same system-wide: light
 * surfaces are inverted and blacks are lifted to grey. Applied to a QR that means
 * grey modules on white — which is how a ticket stops scanning at the door, with
 * nothing wrong on our side and a queue building behind the person holding it.
 *
 * So:
 *  - `colorScheme: 'light'` tells the browser this subtree is already light and
 *    opts it out of the automatic darkening. It is the signal force-dark honours.
 *  - `forcedColorAdjust: 'none'` holds the colours through Windows High Contrast
 *    and the forced-colours modes that ignore the above.
 *  - fg/bg are stated explicitly rather than left to the library's defaults, so
 *    the contract is visible here instead of in a dependency's source.
 */
export function TicketQR({ value, size = 200 }: { value: string; size?: number }) {
    return (
        <div
            className="rounded-xl bg-white p-3"
            style={{ colorScheme: 'light', forcedColorAdjust: 'none', backgroundColor: '#ffffff' }}
        >
            <QRCodeSVG
                value={value}
                size={size}
                level="M"
                marginSize={0}
                fgColor="#000000"
                bgColor="#ffffff"
                className="h-auto w-full"
                style={{ maxWidth: size, forcedColorAdjust: 'none' }}
            />
        </div>
    )
}
