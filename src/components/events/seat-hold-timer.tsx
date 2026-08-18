'use client'

/**
 * Buyer-facing seat-hold countdown, shared by the seat picker and checkout so
 * one continuous timer follows the buyer across both pages.
 *
 * Why it reads the server rather than counting down from a constant:
 *  - The hold TTL lives in the DB (seat_holds.expires_at). Hardcoding it here
 *    means the UI silently drifts the day that value changes.
 *  - A client-side `now() + 12min` restarts on every reload, promising time the
 *    buyer does not have.
 *  - Device clocks are routinely wrong. get_seat_hold_expiry returns server_now
 *    alongside expires_at so we count against the SERVER's clock, offset once.
 *
 * The tick is local (no polling per second). We re-sync from the server only on
 * mount, when the selection changes, and on tab focus — the last one matters
 * because a backgrounded tab's timers are throttled, so a phone returning from
 * sleep would otherwise show a stale countdown.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Clock, AlertTriangle } from 'lucide-react'

/** Below this many seconds the timer turns urgent. */
const WARN_AT_SECONDS = 120

interface HoldState {
    /** Server expiry, ms since epoch. null = nothing held. */
    expiresAt: number | null
    /** serverNow - clientNow at sync time, in ms. Added to Date.now() to get server time. */
    skewMs: number
    seatsHeld: number
    loaded: boolean
}

export function useSeatHoldTimer(
    sessionId: string | null,
    /** Number of seats currently selected — changing this triggers a re-sync. */
    selectionCount: number,
    onExpire?: () => void,
) {
    const [hold, setHold] = useState<HoldState>({ expiresAt: null, skewMs: 0, seatsHeld: 0, loaded: false })
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
    // Ref so the ticking effect never re-subscribes when the parent passes a new closure.
    const onExpireRef = useRef(onExpire)
    onExpireRef.current = onExpire
    const firedRef = useRef(false)

    const sync = useCallback(async () => {
        if (!sessionId) {
            setHold({ expiresAt: null, skewMs: 0, seatsHeld: 0, loaded: true })
            return
        }
        const supabase = createClient()
        const { data, error } = await supabase.rpc('get_seat_hold_expiry', { p_session_id: sessionId })
        if (error || !data) {
            // Leave any existing countdown running rather than blanking it — a
            // transient network blip must not tell the buyer their seats are gone.
            setHold(prev => ({ ...prev, loaded: true }))
            return
        }
        const expiresAtRaw = (data as any).expires_at as string | null
        const serverNowRaw = (data as any).server_now as string
        const serverNow = new Date(serverNowRaw).getTime()
        setHold({
            expiresAt: expiresAtRaw ? new Date(expiresAtRaw).getTime() : null,
            skewMs: serverNow - Date.now(),
            seatsHeld: Number((data as any).seats_held ?? 0),
            loaded: true,
        })
        if (expiresAtRaw) firedRef.current = false
    }, [sessionId])

    // Re-sync on mount, whenever the selection changes, and when the tab regains
    // focus (background tabs throttle setInterval, so the local tick goes stale).
    useEffect(() => { void sync() }, [sync, selectionCount])
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') void sync() }
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onVisible)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onVisible)
        }
    }, [sync])

    // Local tick against the server-corrected clock.
    useEffect(() => {
        if (!hold.expiresAt) { setSecondsLeft(null); return }
        const tick = () => {
            const serverNow = Date.now() + hold.skewMs
            const left = Math.max(0, Math.round((hold.expiresAt! - serverNow) / 1000))
            setSecondsLeft(left)
            if (left === 0 && !firedRef.current) {
                firedRef.current = true
                onExpireRef.current?.()
            }
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [hold.expiresAt, hold.skewMs])

    return {
        secondsLeft,
        seatsHeld: hold.seatsHeld,
        expired: hold.loaded && hold.expiresAt !== null && secondsLeft === 0,
        hasHold: hold.expiresAt !== null,
        resync: sync,
    }
}

export function formatCountdown(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Presentational bar. Renders nothing when there is no live hold, so callers can
 * mount it unconditionally without guarding on selection state.
 */
export function SeatHoldTimer({
    secondsLeft,
    className,
    label = 'Seats held for',
}: {
    secondsLeft: number | null
    className?: string
    label?: string
}) {
    if (secondsLeft === null) return null

    const urgent = secondsLeft <= WARN_AT_SECONDS
    const expired = secondsLeft === 0

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                expired
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : urgent
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'border-border bg-muted/40 text-muted-foreground',
                className,
            )}
            // Announce politely so a screen reader is not interrupted every second.
            role="status"
            aria-live="polite"
        >
            {expired || urgent
                ? <AlertTriangle className="h-4 w-4 shrink-0" />
                : <Clock className="h-4 w-4 shrink-0" />}
            {expired ? (
                <span className="font-medium">Your seat hold expired — please pick your seats again.</span>
            ) : (
                <span>
                    {label}{' '}
                    <span className="font-bold tabular-nums text-foreground">
                        {formatCountdown(secondsLeft)}
                    </span>
                </span>
            )}
        </div>
    )
}
