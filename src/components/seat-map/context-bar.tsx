'use client'

import { Lock, Unlock, Trash2, Copy, FlipHorizontal2, SlidersHorizontal } from 'lucide-react'
import type { SectionData, BackgroundShape, TierInfo, SectionType } from './types'
import { SECTION_TYPE_COLORS } from './types'
import type { AlignMode } from './canvas-state'
import { cn } from '@/lib/utils'

/**
 * The editor's contextual bar.
 *
 * ── Why a bar, and why these controls ──────────────────────────────────────
 *
 * The right panel held 37 controls for a single selected section, stacked in a
 * 320px column, which is why it scrolled and why it felt scattered. But those
 * 37 split very unevenly: 14 are one-click actions used constantly, and 23 are
 * the Auto-Fill Grid, a setup form used once when a seated section is created
 * and never touched again on a club floor plan, where every booth holds one
 * seat. So the common 14 come up here where they fit across the width, and the
 * form stays a panel, opened on demand.
 *
 * ── Why the zones never move ───────────────────────────────────────────────
 *
 * The original complaint was that the panel changed completely on every click.
 * A bar that reshuffles would be the same fault turned on its side. So every
 * zone below is ALWAYS rendered in the same order at the same place; what
 * changes is whether its controls are live or disabled. Select a booth, a
 * landmark, or five things at once, and Rotate stays exactly where your hand
 * expects it.
 *
 * Zones, left to right, and they do not reorder:
 *   WHAT  → name, type, colour, pax
 *   PRICE → tier
 *   TURN  → rotate, resize
 *   COPY  → duplicate / mirror, or align when several are selected
 *   GUARD → lock, delete
 */

const SECTION_TYPES: SectionType[] = ['vip', 'general', 'floor', 'box', 'balcony', 'standing']

/** A fixed slot. Renders even when empty so nothing after it shifts along. */
function Zone({
  label,
  children,
  grow,
}: {
  label: string
  children: React.ReactNode
  grow?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-1.5 px-3 shrink-0', grow && 'min-w-0 flex-1')}>
      <span className="hidden 2xl:block text-[9px] font-semibold uppercase tracking-wider text-slate-600 select-none w-9 shrink-0 leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-7 bg-slate-800 shrink-0" />
}

const btn =
  'h-8 px-2 rounded-md text-xs font-medium border transition-colors shrink-0 ' +
  'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white ' +
  'disabled:opacity-30 disabled:hover:bg-slate-800 disabled:hover:text-slate-200 disabled:cursor-not-allowed'

export interface ContextBarProps {
  selectedSection: SectionData | null
  selectedSections: SectionData[]
  selectedShape: BackgroundShape | null
  tiers: TierInfo[]
  onUpdateSection: (id: string, updates: Partial<SectionData>) => void
  onUpdateShape: (id: string, updates: Partial<BackgroundShape>) => void
  onRotateSections: (ids: string[], degrees: number) => void
  /** Seats selected on the map. Selecting seats clears the section selection,
   *  so without these the bar read "Nothing selected" while the organizer was
   *  plainly looking at a highlighted block of seats — and the group labelled
   *  TURN did nothing. */
  selectedSeatIds?: string[]
  onRotateSeats?: (seatIds: string[], degrees: number) => void
  onAlignSections: (ids: string[], mode: AlignMode) => void
  onDuplicateSection: (id: string, mirror?: boolean) => void
  onScaleSection: (id: string, factor: number) => void
  onDeleteSection: (id: string) => void
  onDeleteSections: (ids: string[]) => void
  onDeleteShape: (id: string) => void
  /** The details panel is closed by default so the map gets the width back. */
  panelOpen: boolean
  onTogglePanel: () => void
}

export function ContextBar({
  selectedSection,
  selectedSections,
  selectedShape,
  tiers,
  onUpdateSection,
  onUpdateShape,
  onRotateSections,
  selectedSeatIds = [],
  onRotateSeats,
  onAlignSections,
  onDuplicateSection,
  onScaleSection,
  onDeleteSection,
  onDeleteSections,
  onDeleteShape,
  panelOpen,
  onTogglePanel,
}: ContextBarProps) {
  const multi = selectedSections.length > 1
  const ids = selectedSections.map((s) => s.id)
  const sec = selectedSection
  const shape = selectedShape
  // A piece from the furniture palette: sells whole, has no rows to build.
  const isUnit = !!sec && (sec.unitCapacity ?? 0) > 0
  // A seat selection is its own thing: picking seats clears selectedIds, so
  // sec, shape and multi are all empty while a block of seats is highlighted.
  // Turning needs two seats, because one seat is a point.
  const seatSel = selectedSeatIds.length
  // One seat is fine here: turning a chair on the spot is meaningful for a
  // single chair, unlike swinging a block around a pivot.
  const canTurnSeats = !!onRotateSeats && seatSel > 0
  const nothing = !sec && !shape && !multi && seatSel === 0

  const title = multi
    ? `${selectedSections.length} selected`
    : seatSel > 0
      ? `${seatSel} seat${seatSel === 1 ? '' : 's'} selected`
      : sec?.label || (shape ? shape.label || 'Landmark' : 'Nothing selected')

  const subtitle = multi
    ? 'Rotate and arrange apply to all'
    : seatSel > 0
      ? 'Turn faces the chairs a new way — they do not move'
      : sec
        ? isUnit
          ? `Sells whole · admits ${sec.unitCapacity}`
          : `${sec.seats.length} seat${sec.seats.length === 1 ? '' : 's'}`
        : shape
          ? 'Decoration · never sold'
          : 'Click something on the map'

  return (
    <div className="h-14 shrink-0 bg-slate-900 border-b border-slate-800 flex items-stretch">
      {/* Everything that MAY be scrolled away sits in here. Details and Delete
          are OUTSIDE it, pinned. A bar that simply scrolled put Details, Lock
          and Delete off the right edge of a normal (non-fullscreen) window with
          no way to reach them at all. */}
      <div className="flex items-stretch overflow-x-auto min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* WHAT — identity. Always first, so the name is always in the same place. */}
      <Zone label="What">
        {(!sec || multi) && (
          <div className="flex flex-col justify-center min-w-0 mr-1">
            <span className="text-[13px] font-semibold text-white truncate max-w-[150px] leading-tight">
              {title}
            </span>
            <span className="text-[10px] text-slate-500 truncate max-w-[150px] leading-tight">
              {subtitle}
            </span>
          </div>
        )}
        {sec && !multi && (
          <>
            <input
              value={sec.label}
              onChange={(e) => onUpdateSection(sec.id, { label: e.target.value })}
              className="h-8 w-32 bg-slate-800 border border-slate-700 rounded-md px-2 text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              placeholder="Name"
              title={subtitle}
            />
            <select
              value={sec.sectionType}
              onChange={(e) => {
                const v = e.target.value as SectionType
                onUpdateSection(sec.id, { sectionType: v, color: SECTION_TYPE_COLORS[v] })
              }}
              className="h-8 bg-slate-800 border border-slate-700 rounded-md px-1.5 text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="color"
              value={sec.color}
              onChange={(e) => onUpdateSection(sec.id, { color: e.target.value })}
              className="h-8 w-8 bg-slate-800 border border-slate-700 rounded-md cursor-pointer p-0.5"
              title="Colour"
            />
            {isUnit && (
              <input
                type="number"
                min={1}
                value={sec.unitCapacity ?? 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  // Rejected rather than coerced: a table admitting 0 people is a
                  // data error the door would have to guess its way around.
                  if (Number.isFinite(n) && n > 0) onUpdateSection(sec.id, { unitCapacity: n })
                }}
                className="h-8 w-14 bg-slate-800 border border-slate-700 rounded-md px-2 text-xs text-white tabular-nums focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                title="How many people this piece admits"
              />
            )}
          </>
        )}
        {shape && !sec && !multi && (
          <input
            value={shape.label ?? ''}
            onChange={(e) => onUpdateShape(shape.id, { label: e.target.value })}
            className="h-8 w-36 bg-slate-800 border border-slate-700 rounded-md px-2 text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            placeholder="Label"
          />
        )}
      </Zone>

      <Divider />

      {/* PRICE — a tier, never a per-piece amount. Twenty-five tables on one
          tier cannot drift out of step with the legend. */}
      <Zone label="Price">
        <select
          value={sec?.tierId ?? ''}
          disabled={!sec || multi}
          onChange={(e) => sec && onUpdateSection(sec.id, { tierId: e.target.value || null })}
          className="h-8 w-32 bg-slate-800 border border-slate-700 rounded-md px-2 text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-30"
        >
          <option value="">No price category</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — ₱{Number(t.price).toLocaleString()}
            </option>
          ))}
        </select>
      </Zone>

      <Divider />

      {/* TURN — rotate and resize. Present for one piece or many. */}
      <Zone label="Turn">
        {([-90, -15, 15, 90] as const).map((deg) => (
          <button
            key={deg}
            // Seats first: selecting seats clears the section selection, so the
            // two can never both be live, and the organizer's last click is the
            // one they mean.
            disabled={seatSel > 0 ? !canTurnSeats : (!sec && !multi)}
            onClick={() =>
              seatSel > 0
                ? onRotateSeats?.(selectedSeatIds, deg)
                : onRotateSections(multi ? ids : sec ? [sec.id] : [], deg)
            }
            className={cn(btn, 'tabular-nums')}
            title={
              seatSel > 1
                ? `Turn ${seatSel} chairs to face ${Math.abs(deg)}° ${deg > 0 ? 'clockwise' : 'anticlockwise'} — the seats do not move`
                : seatSel === 1
                  ? 'Turns which way the chairs face'
                  : `Rotate ${deg > 0 ? 'clockwise' : 'anticlockwise'} ${Math.abs(deg)}°`
            }
          >
            {deg > 0 ? '↻' : '↺'}{Math.abs(deg)}
          </button>
        ))}
        <button
          disabled={!sec || multi}
          onClick={() => sec && onScaleSection(sec.id, 0.9)}
          className={btn}
          title="Smaller"
        >
          −
        </button>
        <button
          disabled={!sec || multi}
          onClick={() => sec && onScaleSection(sec.id, 1.1)}
          className={btn}
          title="Larger"
        >
          +
        </button>
      </Zone>

      <Divider />

      {/* COPY — the same slot holds duplicate for one piece and align for many,
          so the zone never changes width or position in a way that moves the
          controls after it. */}
      <Zone label={multi ? 'Line up' : 'Copy'}>
        {multi ? (
          <>
            {([
              ['left', '⇤'], ['hcenter', '↔'], ['right', '⇥'],
              ['top', '⇡'], ['vmiddle', '↕'], ['bottom', '⇣'],
            ] as [AlignMode, string][]).map(([mode, glyph]) => (
              <button key={mode} onClick={() => onAlignSections(ids, mode)} className={btn} title={mode}>
                {glyph}
              </button>
            ))}
            <button onClick={() => onAlignSections(ids, 'hdistribute')} className={btn} title="Equal gaps across">⇹</button>
            <button onClick={() => onAlignSections(ids, 'vdistribute')} className={btn} title="Equal gaps down">⇳</button>
          </>
        ) : (
          <>
            <button
              disabled={!sec}
              onClick={() => sec && onDuplicateSection(sec.id, false)}
              className={btn}
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={!sec}
              onClick={() => sec && onDuplicateSection(sec.id, true)}
              className={btn}
              title="Mirror"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </Zone>

      <div className="flex-1 min-w-2" />
      </div>

      <div className="w-px h-7 bg-slate-800 shrink-0 self-center" />

      {/* MORE — everything this bar does not carry: building rows of seats,
          borders, the seat list, backgrounds, map-wide settings. Closed by
          default, because leaving a 320px column open permanently is what made
          the map narrow and the column scroll. */}
      <Zone label="More">
        <button
          onClick={onTogglePanel}
          className={cn(btn, panelOpen && 'bg-indigo-600/25 border-indigo-400/60 text-white')}
          title={panelOpen ? 'Hide details' : 'Show details — seats, borders, backgrounds, map settings'}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="ml-1">Details</span>
        </button>
      </Zone>

      <div className="w-px h-7 bg-slate-800 shrink-0 self-center" />

      {/* GUARD — destructive things, always far right, always last, so nothing
          lands under the cursor where Delete used to be. */}
      <Zone label="Guard">
        <button
          disabled={!sec && !shape}
          onClick={() => {
            if (sec) onUpdateSection(sec.id, { locked: !sec.locked })
            else if (shape) onUpdateShape(shape.id, { locked: !shape.locked })
          }}
          className={cn(btn, (sec?.locked || shape?.locked) && 'bg-amber-600/20 border-amber-600/40 text-amber-300')}
          title={sec?.locked || shape?.locked ? 'Unlock' : 'Lock in place'}
        >
          {sec?.locked || shape?.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <button
          disabled={nothing}
          onClick={() => {
            if (multi) onDeleteSections(ids)
            else if (sec) onDeleteSection(sec.id)
            else if (shape) onDeleteShape(shape.id)
          }}
          className={cn(btn, 'hover:bg-red-600/30 hover:border-red-600/50 hover:text-red-300')}
          title={multi ? `Delete ${selectedSections.length} pieces` : 'Delete'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </Zone>
    </div>
  )
}
