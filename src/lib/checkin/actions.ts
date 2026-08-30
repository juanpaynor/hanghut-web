'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Server actions for the walk-up check-in kiosk.
 *
 * Everything here runs against the STAFF session that opened the kiosk — the
 * guest typing into the screen is anonymous and never authenticates. The RPCs
 * own authorization (can_sell_at_door), so there is no role list duplicated up
 * here to drift out of sync.
 */

export type KioskResult =
    | { ok: true; code: 'ADMITTED' | 'REGISTERED'; first_name: string; ticket_url?: string }
    | {
          ok: false
          code: 'ALREADY_IN' | 'SEE_BOX_OFFICE' | 'NAME_REQUIRED' | 'EMAIL_REQUIRED' | 'SERVER_ERROR'
          message: string
          first_name?: string
          checked_in_at?: string
      }

export async function kioskCheckIn(
    eventId: string,
    name: string,
    email: string
): Promise<KioskResult> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('kiosk_check_in', {
        p_event_id: eventId,
        p_name: name,
        p_email: email,
    })

    if (error) {
        // Never surface a raw Postgres message on a screen a guest is reading.
        console.error('[kiosk] check-in failed:', error.message)
        return {
            ok: false,
            code: 'SERVER_ERROR',
            message: 'Something went wrong. Please ask a staff member for help.',
        }
    }
    return data as KioskResult
}

export async function getKioskCounts(
    eventId: string
): Promise<{ checked_in: number; expected: number }> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_kiosk_counts', { p_event_id: eventId })
    if (error || !data) return { checked_in: 0, expected: 0 }
    return data as { checked_in: number; expected: number }
}
