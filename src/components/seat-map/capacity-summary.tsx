'use client'

import { useMemo } from 'react'
import type { SectionData, TierInfo } from './types'
import { resolveSeatTier } from './types'
import { Banknote, AlertTriangle } from 'lucide-react'

interface CapacitySummaryProps {
  sections: SectionData[]
  tiers: TierInfo[]
}

export function CapacitySummary({ sections, tiers }: CapacitySummaryProps) {
  const summary = useMemo(() => {
    const tierMap = new Map(tiers.map((t) => [t.id, t]))
    const tierCounts = new Map<string, number>()
    let totalSeats = 0
    let disabledSeats = 0
    let unassigned = 0

    for (const section of sections) {
      for (const seat of section.seats) {
        totalSeats++
        if (seat.status === 'disabled') {
          disabledSeats++
          continue
        }
        const tierId = resolveSeatTier(seat, section)
        if (tierId) {
          tierCounts.set(tierId, (tierCounts.get(tierId) ?? 0) + 1)
        } else {
          unassigned++
        }
      }
    }

    const tierRows = tiers
      .filter((t) => tierCounts.has(t.id))
      .map((t) => {
        const count = tierCounts.get(t.id)!
        return { tier: t, count, subtotal: t.price * count }
      })

    const projectedGross = tierRows.reduce((sum, r) => sum + r.subtotal, 0)
    const activeSeats = totalSeats - disabledSeats

    return { totalSeats, activeSeats, disabledSeats, unassigned, tierRows, projectedGross }
  }, [sections, tiers])

  if (summary.totalSeats === 0) return null

  return (
    <div className="space-y-3">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-white">{summary.activeSeats.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400">Active</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-slate-400">{summary.disabledSeats.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Blocked</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-white">{summary.totalSeats.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400">Total</div>
        </div>
      </div>

      {/* Per-tier breakdown */}
      {summary.tierRows.length > 0 && (
        <div className="space-y-1.5">
          {summary.tierRows.map(({ tier, count, subtotal }) => (
            <div key={tier.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tier.color }} />
              <span className="text-xs text-white truncate flex-1">{tier.name}</span>
              <span className="text-[10px] text-slate-400">₱{Number(tier.price).toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 w-10 text-right">{count}×</span>
              <span className="text-[10px] text-emerald-400 w-20 text-right font-medium">
                ₱{subtotal.toLocaleString()}
              </span>
            </div>
          ))}

          {/* Projected gross */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-500/20 mt-1">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <Banknote className="w-3.5 h-3.5" />
              Projected Gross
            </div>
            <span className="text-sm font-bold text-emerald-300">
              ₱{summary.projectedGross.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Unpriced seats warning */}
      {summary.unassigned > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300">
            {summary.unassigned} seat{summary.unassigned !== 1 ? 's' : ''} have no price category — they won&apos;t be purchasable.
          </p>
        </div>
      )}
    </div>
  )
}
