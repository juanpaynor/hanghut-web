'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { syncSettlements } from '@/lib/organizer/wallet-actions'

/**
 * Fire-and-forget: on mount, pull the real Xendit settlement status for this
 * partner's recent pending transactions. If anything was updated, refresh the
 * route so the Settlement column flips from "Est." to Xendit's confirmed status.
 * Renders nothing; failures are silent (the UI keeps its honest estimate).
 */
export function SettlementSync({ partnerId }: { partnerId: string }) {
    const router = useRouter()
    const ran = useRef(false)

    useEffect(() => {
        if (ran.current || !partnerId) return
        ran.current = true
        syncSettlements(partnerId)
            .then((r) => { if (r.updated > 0) router.refresh() })
            .catch(() => { /* silent — estimate stays */ })
    }, [partnerId, router])

    return null
}
