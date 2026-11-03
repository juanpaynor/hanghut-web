import { createClient } from '@/lib/supabase/server'

/**
 * What an event actually earned, after HangHut's cut and the payment gateway's.
 *
 * ── Why this is not just "gross minus a percentage" ────────────────────────
 *
 * Three places on prod record fees and they do not agree with each other:
 *
 *   purchase_intents.platform_fee            sums to ~62,600 across all orders
 *   transactions.platform_fee                sums to ~5,900 for the same period
 *   purchase_intents.payment_processing_fee  is 0 on every single order, always
 *
 * The one that decides what an organizer is actually paid is
 * `transactions.organizer_payout`: it is a stored column equal to
 * gross − platform_fee − payment_processing_fee, and `get_partner_balance` —
 * the function behind the wallet — sums exactly that and nothing else. So this
 * reads the same column. A net figure on the event page that disagreed with
 * the wallet would be worse than showing no net figure at all.
 *
 * ── The two cases organizer_payout alone gets wrong ────────────────────────
 *
 * 1. CASH / box-office orders never get a transactions row at all. That is by
 *    design: the organizer already holds the money, it is not coming via a
 *    payout. Reading only organizer_payout would silently drop ₱34k of real
 *    door sales across prod today, so they are counted at face value — they
 *    carry no platform fee and no gateway fee, because nothing was processed.
 *
 * 2. A handful of ONLINE paid orders have no transactions row either, which is
 *    a data gap rather than a design (one cancelled event accounts for most of
 *    it). Those are estimated from the intent instead of counted as zero,
 *    because reporting ₱0 net against ₱52,320 of gross is the worse failure.
 *    `estimated` says how much of the total came from that path.
 *
 * ── Refunds ───────────────────────────────────────────────────────────────
 *
 * A refund writes a NEGATIVE organizer_payout reversal row (11 such rows on
 * prod), so summing payouts already nets refunds off. Subtracting
 * refunded_amount on top of that would double-count them. It is only
 * subtracted on the fallback path, where no reversal row exists.
 */
export interface EventEarnings {
  /** What buyers paid, including any fee passed on to them. */
  gross: number
  /** What the organizer keeps: gross less platform and gateway fees. */
  net: number
  /** gross − net, i.e. everything taken out. */
  fees: number
  /** Door sales, already in the organizer's hands rather than coming by payout. */
  cash: number
  /** Returned to buyers. */
  refunded: number
  /** Portion of `net` estimated because an order had no transactions row. */
  estimated: number
}

const ZERO: EventEarnings = { gross: 0, net: 0, fees: 0, cash: 0, refunded: 0, estimated: 0 }

/** Methods that are collected in person, so no gateway ever sees them. */
const OFFLINE_METHODS = new Set(['CASH', 'FREE', 'COMP'])

export async function getEventEarnings(eventId: string): Promise<EventEarnings> {
  const supabase = await createClient()

  const [intentsRes, txnRes] = await Promise.all([
    supabase
      .from('purchase_intents')
      .select('id, total_amount, refunded_amount, platform_fee, xendit_fee, xendit_fee_vat, payment_method')
      .eq('event_id', eventId)
      .in('status', ['completed', 'refunded']),
    supabase
      .from('transactions')
      .select('purchase_intent_id, organizer_payout')
      .eq('event_id', eventId)
      .in('status', ['completed', 'refunded']),
  ])

  const intents = intentsRes.data ?? []
  if (intents.length === 0) return ZERO

  // An intent can own SEVERAL transaction rows — the sale and, after a refund,
  // its reversal — so payouts are accumulated per intent rather than replaced.
  const payoutByIntent = new Map<string, number>()
  for (const t of txnRes.data ?? []) {
    const key = t.purchase_intent_id as string | null
    if (!key) continue
    payoutByIntent.set(key, (payoutByIntent.get(key) ?? 0) + Number(t.organizer_payout ?? 0))
  }

  let gross = 0, net = 0, cash = 0, refunded = 0, estimated = 0

  for (const pi of intents) {
    const total = Number(pi.total_amount ?? 0)
    const refund = Number(pi.refunded_amount ?? 0)
    gross += total
    refunded += refund

    const method = String(pi.payment_method ?? '').toUpperCase()
    const offline = OFFLINE_METHODS.has(method)
    if (method === 'CASH') cash += total

    if (payoutByIntent.has(pi.id)) {
      net += payoutByIntent.get(pi.id)!
      continue
    }

    // No transactions row. For door sales that is correct and the whole amount
    // is kept; for an online order it is a gap, so fall back to the intent's
    // own fee columns and record how much of the answer rests on that.
    const fallback =
      total
      - Number(pi.platform_fee ?? 0)
      - Number(pi.xendit_fee ?? 0)
      - Number(pi.xendit_fee_vat ?? 0)
      - refund
    net += fallback
    if (!offline && total > 0) estimated += fallback
  }

  return {
    gross: Math.round(gross),
    net: Math.round(net),
    fees: Math.round(gross - net),
    cash: Math.round(cash),
    refunded: Math.round(refunded),
    estimated: Math.round(estimated),
  }
}
