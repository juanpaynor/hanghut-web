'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Search, X, Trash2 } from 'lucide-react'
import { FURNITURE, FURNITURE_GROUPS, savedToPiece, type FurniturePiece } from './furniture'
import type { SavedPiece } from '@/lib/seat-map/saved-piece'
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
 *
 * At twenty-eight pieces the list is filed into four drawers and carries a
 * filter, because one flat list that long is a scroll rather than a menu — and
 * scrolling past things is how they went missing in the first place.
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
  savedPieces = [],
  onDeleteSavedPiece,
}: {
  activeId: string
  /** True when the placement tool is live, so the chosen piece reads as chosen. */
  armed: boolean
  onPick: (id: string) => void
  /** Shapes this venue drew and saved. Listed FIRST — they are the ones the
   *  organizer actually reaches for; the catalogue is the fallback. */
  savedPieces?: SavedPiece[]
  onDeleteSavedPiece?: (id: string) => void
}) {
  // Every drawer open to begin with: collapsing one by default would put part
  // of the catalogue back behind a thing you have to find, which is the problem
  // this list exists to solve. Collapsing is there for when you are working in
  // one drawer and want the others out of the way — and since twenty-eight
  // pieces never fit on a 13-inch screen at once, that choice is remembered
  // rather than asked for again on every visit.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const allOpen = Object.fromEntries(FURNITURE_GROUPS.map((g) => [g.key, true]))
    try {
      const saved = window.localStorage.getItem(STORE_KEY)
      if (saved) return { ...allOpen, ...JSON.parse(saved) }
    } catch { /* private window, blocked storage: the defaults are fine */ }
    return allOpen
  })

  // Twenty-eight pieces is past the point where scanning four drawers beats
  // typing three letters. The filter also means a drawer can stay collapsed
  // without anything becoming unreachable.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const toggle = (key: string) =>
    setOpen((o) => {
      const next = { ...o, [key]: !o[key] }
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* not worth failing a click over */ }
      return next
    })

  // The venue's own pieces come first. They are dressed as ordinary palette
  // pieces by savedToPiece, so from here down there is no difference between a
  // saved shape and a built-in one except the delete button on its row.
  const groups = useMemo(() => {
    const saved = savedPieces
      .map(savedToPiece)
      .filter((piece) => !q || piece.name.toLowerCase().includes(q))
    return [
      {
        key: 'saved' as const,
        title: 'My pieces',
        note: 'Shapes this venue saved. Place them on any event.',
        pieces: saved,
        deletable: true,
      },
      ...FURNITURE_GROUPS.map((g) => ({
        ...g,
        pieces: FURNITURE.filter((piece) => piece.group === g.key && (!q || piece.name.toLowerCase().includes(q))),
        deletable: false,
      })),
    ]
  }, [q, savedPieces])

  const hits = groups.reduce((n, g) => n + g.pieces.length, 0)
  const totalPieces = FURNITURE.length + savedPieces.length

  return (
    <div className="pb-1">
      <div className="px-2 pb-1.5">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a piece"
            aria-label="Filter the pieces you can add"
            className="w-full h-6 pl-6 pr-6 rounded bg-slate-950/60 border border-slate-800 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {q && hits === 0 && (
        <p className="px-3 py-2 text-[10px] text-slate-500">
          Nothing called “{query}”. Clear the filter to see all {totalPieces}.
        </p>
      )}

      {groups.map(({ key, title, note, pieces, deletable }) => {
        // An empty catalogue drawer is just noise, but an empty "My pieces"
        // drawer is the only place that explains how to fill it — so it stays,
        // unless a filter is running and would make it read as a dead end.
        if (pieces.length === 0 && !(key === 'saved' && !q)) return null
        // While filtering, a collapsed drawer would hide its own matches.
        const expanded = q ? true : open[key]
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-1 px-2 py-1.5 text-left hover:bg-slate-800/60 transition-colors"
              title={note}
            >
              <ChevronRight
                className={cn('w-3 h-3 text-slate-500 transition-transform shrink-0', expanded && 'rotate-90')}
              />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 flex-1">
                {title}
              </span>
              {/* The count keeps a collapsed group from reading as an empty one. */}
              <span className="text-[9px] text-slate-600 tabular-nums">{pieces.length}</span>
            </button>
            {expanded && (
              <div className="px-1 pb-1">
                {pieces.length === 0 && key === 'saved' && (
                  <p className="px-2 py-1 text-[10px] text-slate-500 leading-snug">
                    Draw a shape with the shape tool, press <span className="text-slate-300">Sell this whole</span>,
                    then <span className="text-slate-300">Save as piece</span>. It will wait here for your next event.
                  </p>
                )}
                {pieces.map((piece) => {
                  const on = armed && activeId === piece.id
                  return (
                    <div key={piece.id} className="group/row relative flex items-center">
                      <button
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
                        <span className={cn(
                          'text-[11px] leading-tight truncate flex-1 min-w-0',
                          // Room for the delete button, so a long name is not
                          // sitting underneath it.
                          deletable && onDeleteSavedPiece && 'group-hover/row:pr-5'
                        )}>
                          {piece.name}
                        </span>
                        {piece.kind === 'sellable' && (
                          <span className="text-[9px] text-slate-500 tabular-nums shrink-0" title="people it admits">
                            {piece.pax}
                          </span>
                        )}
                      </button>
                      {deletable && onDeleteSavedPiece && (
                        <button
                          type="button"
                          // Hidden until hover, and never focusable-invisible:
                          // a delete sitting permanently beside every row is
                          // the thing that gets hit by accident.
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSavedPiece(piece.id.replace(/^saved:/, ''))
                          }}
                          title={`Forget “${piece.name}” — pieces already on a map are not affected`}
                          className="absolute right-0.5 p-0.5 rounded text-slate-500 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-red-400 hover:bg-slate-900 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
