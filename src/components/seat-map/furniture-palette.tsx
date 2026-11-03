'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { FURNITURE, type FurniturePiece } from './furniture'
import { cn } from '@/lib/utils'

/**
 * The list of things you can put on the map.
 *
 * It used to float over the canvas and only appear once you had found and
 * clicked an unlabelled sofa icon — which meant 14 of the roughly 25 addable
 * things were invisible until you guessed. It now lives in the sidebar, always
 * on screen. Picking an item is what arms the placement tool, so there is no
 * mode to discover first.
 *
 * Each swatch draws the piece's REAL outline, from the same generator that
 * builds the section polygon, so the picture is literally the shape that lands
 * on the canvas. A hand-drawn icon set would drift the moment either changed.
 */

const SWATCH = 22

/** Where the open/closed state of the Insert groups is remembered. Per browser,
 *  never read back by anything else — losing it costs one click. */
const STORE_KEY = 'hh.seatmap.insert.groups'

function swatchPoints(piece: FurniturePiece): string | null {
  if (!piece.outline) return null
  // Fit the piece's own proportions into the box so a banquette reads long and
  // a stool reads small, rather than every piece filling the square.
  const scale = SWATCH / Math.max(piece.w, piece.h)
  const w = piece.w * scale
  const h = piece.h * scale
  const dx = (SWATCH - w) / 2
  const dy = (SWATCH - h) / 2
  const pts = piece.outline(w, h)
  const out: string[] = []
  for (let i = 0; i < pts.length; i += 2) {
    out.push(`${(dx + pts[i]).toFixed(1)},${(dy + pts[i + 1]).toFixed(1)}`)
  }
  return out.join(' ')
}

export function FurnitureSwatch({ piece }: { piece: FurniturePiece }) {
  const pts = swatchPoints(piece)
  return (
    <svg width={SWATCH} height={SWATCH} viewBox={`0 0 ${SWATCH} ${SWATCH}`} aria-hidden="true" className="shrink-0">
      {pts ? (
        <polygon points={pts} fill={piece.color} fillOpacity={0.45} stroke={piece.color} strokeWidth={1.4} />
      ) : piece.decorShape === 'circle' ? (
        <circle cx={SWATCH / 2} cy={SWATCH / 2} r={SWATCH / 2 - 3} fill={piece.color} fillOpacity={0.5} stroke={piece.color} strokeWidth={1.4} />
      ) : (() => {
        const scale = SWATCH / Math.max(piece.w, piece.h)
        const w = piece.w * scale
        const h = Math.max(3, piece.h * scale)
        return (
          <rect x={(SWATCH - w) / 2} y={(SWATCH - h) / 2} width={w} height={h} rx={2}
            fill={piece.color} fillOpacity={0.5} stroke={piece.color} strokeWidth={1.4} />
        )
      })()}
    </svg>
  )
}

export function FurnitureList({
  activeId,
  armed,
  onPick,
}: {
  activeId: string
  /** True when the placement tool is live, so the chosen piece reads as chosen. */
  armed: boolean
  onPick: (id: string) => void
}) {
  // Both groups open to begin with: collapsing Landmarks by default would put
  // half the catalogue back behind a thing you have to find, which is the
  // problem this list exists to solve. Collapsing is there for when you are
  // working through one group and want the other out of the way — and on a
  // 13-inch screen all fifteen pieces do not fit at once, so that choice gets
  // remembered rather than asked for on every visit.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY)
      if (saved) return { sellable: true, decor: true, ...JSON.parse(saved) }
    } catch { /* private window, blocked storage: the defaults are fine */ }
    return { sellable: true, decor: true }
  })

  const toggle = (key: string) =>
    setOpen((o) => {
      const next = { ...o, [key]: !o[key] }
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* not worth failing a click over */ }
      return next
    })

  const groups: { key: string; title: string; note: string; pieces: FurniturePiece[] }[] = [
    { key: 'sellable', title: 'Sellable', note: 'Sells whole. Give it a price.', pieces: FURNITURE.filter((p) => p.kind === 'sellable') },
    { key: 'decor', title: 'Landmarks', note: 'Decoration only. Never sold.', pieces: FURNITURE.filter((p) => p.kind === 'decor') },
  ]

  return (
    <div className="pb-1">
      {groups.map(({ key, title, note, pieces }) => (
        <div key={key}>
          <button
            type="button"
            onClick={() => toggle(key)}
            className="w-full flex items-center gap-1 px-2 py-1.5 text-left hover:bg-slate-800/60 transition-colors"
            title={note}
          >
            <ChevronRight
              className={cn('w-3 h-3 text-slate-500 transition-transform shrink-0', open[key] && 'rotate-90')}
            />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 flex-1">
              {title}
            </span>
            {/* The count keeps a collapsed group from reading as an empty one. */}
            <span className="text-[9px] text-slate-600 tabular-nums">{pieces.length}</span>
          </button>
          {open[key] && (
            <div className="px-1 pb-1">
              {pieces.map((piece) => {
                const on = armed && activeId === piece.id
                return (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => onPick(piece.id)}
                    title={piece.kind === 'sellable' ? `${piece.name} · admits ${piece.pax}` : `${piece.name} · not sold`}
                    className={cn(
                      'w-full flex items-center gap-2 rounded px-1.5 py-0.5 text-left transition-colors border',
                      on
                        ? 'bg-indigo-600/25 border-indigo-400/60 text-white'
                        : 'bg-transparent border-transparent text-slate-300 hover:bg-slate-800'
                    )}
                  >
                    <FurnitureSwatch piece={piece} />
                    <span className="text-[11px] leading-tight truncate flex-1 min-w-0">{piece.name}</span>
                    {piece.kind === 'sellable' && (
                      <span className="text-[9px] text-slate-500 tabular-nums shrink-0" title="people it admits">
                        {piece.pax}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
