'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SectionData, CanvasTool, SectionType, SeatData, BackgroundShape, SeatShape, TierInfo } from './types'
import { SECTION_TYPE_COLORS, resolveSeatTier } from './types'
import { fillStraightSeats, fillArcSeats } from './algorithms/fill-seats'
import { Trash2, Grid3X3, Palette, Tag, Layers, Image as ImageIcon, XCircle, Circle, Square, Diamond, Lock, Unlock, Banknote, BoxSelect, Triangle, Minus, Type, Spline, Ruler, Plus } from 'lucide-react'
import { CapacitySummary } from './capacity-summary'

interface CanvasPropertiesProps {
  selectedSection: SectionData | null
  selectedSections?: SectionData[]
  selectedShape?: BackgroundShape | null
  sections: SectionData[]
  tool: CanvasTool
  tiers?: TierInfo[]
  onCreateTier?: (name: string, price: number) => Promise<TierInfo | null>
  onAssignSeatsTier?: (seatIds: string[], tierId: string | null) => void
  onSelectRow?: () => void
  onUpdateSection: (id: string, updates: Partial<SectionData>) => void
  onUpdateSections?: (ids: string[], updates: Partial<SectionData>) => void
  onDeleteSection: (id: string) => void
  onDeleteSections?: (ids: string[]) => void
  onSelectSection: (id: string) => void
  onAlignSeats?: (seatIds: string[], mode: 'straighten' | 'flat') => void
  onAddShape?: (shape: Partial<BackgroundShape> & { type: BackgroundShape['type'] }) => void
  backgroundShapes: BackgroundShape[]
  onUpdateShape: (id: string, updates: Partial<BackgroundShape>) => void
  onDeleteShape: (id: string) => void
  dropRow: string
  dropSeatNumber: number
  onSetDropRow: (row: string) => void
  onSetDropSeatNumber: (num: number) => void
  selectedSeatId: string | null
  selectedSeatIds: string[]
  onDeleteSeat: (sectionId: string, seatId: string) => void
  onSelectSeat: (seatId: string | null) => void
  onRenumberSeats: (seatIds: string[], rowLabel: string, startNumber: number, mode?: 'row' | 'grid') => void
  onDeleteSelectedSeats: () => void
  onSetSeatStatus?: (seatIds: string[], status: 'available' | 'disabled') => void
  onScaleSeats?: (seatIds: string[], factor: number) => void
  onDuplicateSection?: (id: string, mirror?: boolean) => void
  onScaleSection?: (id: string, factor: number) => void
  seatRadius: number
  seatShape: SeatShape
  onSetSeatRadius: (r: number) => void
  onSetSeatShape: (s: SeatShape) => void
}

const sectionTypes: { value: SectionType; label: string }[] = [
  { value: 'vip', label: 'VIP' },
  { value: 'general', label: 'General' },
  { value: 'floor', label: 'Floor' },
  { value: 'box', label: 'Box' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'standing', label: 'Standing' },
]

const colorPresets = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6',
  '#d946ef', '#14b8a6', '#f97316', '#64748b',
]

/** Dropdown of price categories with a configurable "inherit" option */
function TierSelect({
  tiers,
  value,
  inheritLabel,
  onChange,
}: {
  tiers: TierInfo[]
  value: string | null | undefined
  inheritLabel: string
  onChange: (tierId: string | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{inheritLabel}</option>
      {tiers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} — ₱{Number(t.price).toLocaleString()}
        </option>
      ))}
    </select>
  )
}

/** Inline "new price category" form — create tiers without leaving the editor.
 *  Inventory starts at 0 and is filled by the seats assigned to the tier. */
function NewTierForm({
  onCreateTier,
  onCreated,
}: {
  onCreateTier: (name: string, price: number) => Promise<TierInfo | null>
  onCreated?: (tier: TierInfo) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const tier = await onCreateTier(name, parseFloat(price) || 0)
    setBusy(false)
    if (tier) {
      setName('')
      setPrice('')
      setOpen(false)
      onCreated?.(tier)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-medium py-2 rounded-lg transition-all border border-dashed border-indigo-600/40"
      >
        <Plus className="w-3.5 h-3.5" />
        New price category
      </button>
    )
  }

  return (
    <div className="space-y-2 bg-slate-800/60 border border-slate-700 rounded-lg p-2.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Name — e.g. VIP, Lower Box"
        className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">₱</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
            placeholder="0"
            className="w-full bg-slate-900 border border-slate-700 rounded-md pl-6 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={submit}
          disabled={!name.trim() || busy}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-md transition-all"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 text-slate-400 hover:text-slate-200 text-xs px-1"
        >
          ✕
        </button>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        How many sell = the seats you assign to it. Free seats? Use ₱0.
      </p>
    </div>
  )
}

const borderColorPresets = ['#ffffff', '#0f172a', '#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#94a3b8', '#0ea5e9']

/** Reusable border/outline editor for sections (and decorative shapes). */
function BorderControls({
  color,
  width,
  style,
  fillColor,
  onChange,
}: {
  color?: string | null
  width?: number
  style?: 'solid' | 'dashed'
  fillColor?: string
  onChange: (updates: { borderColor?: string | null; borderWidth?: number; borderStyle?: 'solid' | 'dashed' }) => void
}) {
  const w = width ?? 1.5
  return (
    <div className="border-t border-slate-800 pt-4">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
        <BoxSelect className="w-3.5 h-3.5" />
        Border
      </label>

      <label className="text-[11px] text-slate-500 flex justify-between mb-1">
        <span>Thickness</span>
        <span className="text-slate-400">{w}px</span>
      </label>
      <input
        type="range"
        min="0"
        max="8"
        step="0.5"
        value={w}
        onChange={(e) => onChange({ borderWidth: parseFloat(e.target.value) })}
        className="w-full accent-indigo-500 cursor-pointer"
      />

      <label className="text-[11px] text-slate-500 mb-1 mt-3 block">Color</label>
      <div className="grid grid-cols-8 gap-1.5">
        {/* "Match fill" = null border color (falls back to section/shape color) */}
        <button
          onClick={() => onChange({ borderColor: null })}
          title="Match fill color"
          className="w-7 h-7 rounded-md border-2 flex items-center justify-center text-[8px] text-slate-300"
          style={{ backgroundColor: fillColor || '#475569', borderColor: color == null ? '#ffffff' : 'transparent' }}
        >
          auto
        </button>
        {borderColorPresets.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ borderColor: c })}
            className="w-7 h-7 rounded-md border-2 transition-all hover:scale-110"
            style={{ backgroundColor: c, borderColor: color === c ? '#818cf8' : 'transparent' }}
          />
        ))}
      </div>

      <label className="text-[11px] text-slate-500 mb-1 mt-3 block">Style</label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange({ borderStyle: 'solid' })}
          className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
            (style ?? 'solid') === 'solid' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          ── Solid
        </button>
        <button
          onClick={() => onChange({ borderStyle: 'dashed' })}
          className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
            style === 'dashed' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          ┄┄ Dashed
        </button>
      </div>
    </div>
  )
}

type PresetShape = Partial<BackgroundShape> & { type: BackgroundShape['type'] }

const ZONE_PRESETS: { label: string; shape: PresetShape }[] = [
  { label: 'Stage', shape: { type: 'rect', width: 240, height: 70, fill: '#1e293b', label: 'STAGE' } },
  { label: 'Bar', shape: { type: 'rect', width: 140, height: 50, fill: '#422006', label: 'BAR' } },
  { label: 'Entrance', shape: { type: 'rect', width: 120, height: 40, fill: '#14532d', label: 'ENTRANCE' } },
  { label: 'Dance Floor', shape: { type: 'rect', width: 200, height: 140, fill: '#312e81', label: 'DANCE FLOOR' } },
  { label: 'Round Table', shape: { type: 'circle', radius: 36, fill: '#334155', label: '' } },
]

const BASIC_SHAPES: { label: string; icon: typeof Square; shape: PresetShape }[] = [
  { label: 'Box', icon: Square, shape: { type: 'rect', width: 120, height: 70, fill: '#334155' } },
  { label: 'Ellipse', icon: Circle, shape: { type: 'ellipse', width: 130, height: 80, fill: '#334155' } },
  { label: 'Triangle', icon: Triangle, shape: { type: 'triangle', width: 110, height: 95, fill: '#334155' } },
  { label: 'Line', icon: Minus, shape: { type: 'line', points: [0, 0, 140, 0], stroke: '#94a3b8', strokeWidth: 3, fill: '#94a3b8' } },
  { label: 'Text', icon: Type, shape: { type: 'text', label: 'Label', fill: '#ffffff', fontSize: 18 } },
]

export function CanvasProperties({
  selectedSection,
  selectedSections = [],
  selectedShape = null,
  sections,
  tool,
  tiers = [],
  onCreateTier,
  onAssignSeatsTier,
  onSelectRow,
  onUpdateSection,
  onUpdateSections,
  onDeleteSection,
  onDeleteSections,
  onSelectSection,
  onAlignSeats,
  onAddShape,
  backgroundShapes,
  onUpdateShape,
  onDeleteShape,
  dropRow,
  dropSeatNumber,
  onSetDropRow,
  onSetDropSeatNumber,
  selectedSeatId,
  selectedSeatIds,
  onDeleteSeat,
  onSelectSeat,
  onRenumberSeats,
  onDeleteSelectedSeats,
  onSetSeatStatus,
  onScaleSeats,
  onDuplicateSection,
  onScaleSection,
  seatRadius,
  seatShape,
  onSetSeatRadius,
  onSetSeatShape,
}: CanvasPropertiesProps) {
  const [fillRows, setFillRows] = useState(10)
  const [fillCols, setFillCols] = useState(20)
  const [gridRotation, setGridRotation] = useState(0)
  const [labelScheme, setLabelScheme] = useState<'alpha' | 'numeric'>('alpha')
  const [aisleInput, setAisleInput] = useState('')  // comma-separated: e.g. "5,15" = aisle after seat 5 and 15
  const [numberingDir, setNumberingDir] = useState<'ltr' | 'rtl'>('ltr')
  const [numberingStyle, setNumberingStyle] = useState<'sequential' | 'odd_even'>('sequential')
  const [seatGap, setSeatGap] = useState(4)
  const [rowGap, setRowGap] = useState(6)

  // Sync state when selecting a different section
  useEffect(() => {
    if (selectedSection) {
      setFillRows(selectedSection.rowCount || 10)
      setFillCols(selectedSection.seatsPerRow || 20)
      setGridRotation(selectedSection.gridRotation || 0)
      setNumberingDir(selectedSection.numberingDirection ?? 'ltr')
      setNumberingStyle(selectedSection.numberingStyle ?? 'sequential')
      setSeatGap(selectedSection.seatGap ?? 4)
      setRowGap(selectedSection.rowGap ?? 6)
    }
  }, [selectedSection?.id])

  // ─── Fill seats in selected section ───────────────────────────────
  const handleFillSeats = useCallback(() => {
    if (!selectedSection) return

    const numConfig = { numberingDirection: numberingDir, numberingStyle, seatGap, rowGap, seatSize: seatRadius }
    let seatPositions
    if (selectedSection.seatOrientation === 'arc' && selectedSection.arcConfig) {
      seatPositions = fillArcSeats(selectedSection.arcConfig, {
        rowCount: fillRows,
        seatsPerRow: fillCols,
        labelScheme,
        ...numConfig,
      })
    } else {
      // Parse aisle positions
      const aisleAfterSeats = aisleInput
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n) && n > 0)

      seatPositions = fillStraightSeats(selectedSection.polygonPoints, {
        rowCount: fillRows,
        seatsPerRow: fillCols,
        labelScheme,
        gridRotation,
        aisleAfterSeats: aisleAfterSeats.length > 0 ? aisleAfterSeats : undefined,
        ...numConfig,
      })
    }

    // Preserve seat IDENTITY across re-fills. Canvas id = DB id, so regenerating
    // ids would orphan sold seats (save refuses to delete booked rows → invisible
    // duplicates + oversell) and silently wipe statuses, per-seat tiers and prices.
    // Match old→new by label (e.g. "A1"): matched seats keep id/status/tier/price
    // and only move to the new position. Booked seats whose label vanished from
    // the new layout are KEPT in place — a sold seat can never be dropped.
    const prevByLabel = new Map(selectedSection.seats.map((s) => [s.label, s]))
    const newLabels = new Set(seatPositions.map((p) => p.label))

    const seats: SeatData[] = seatPositions.map((pos) => {
      const prev = prevByLabel.get(pos.label)
      return prev
        ? { ...prev, rowLabel: pos.rowLabel, seatNumber: pos.seatNumber, x: pos.x, y: pos.y }
        : {
            id: crypto.randomUUID(),
            rowLabel: pos.rowLabel,
            seatNumber: pos.seatNumber,
            label: pos.label,
            x: pos.x,
            y: pos.y,
            status: 'available' as const,
            customPrice: null,
          }
    })

    const keptBooked = selectedSection.seats.filter(
      (s) => s.status === 'booked' && !newLabels.has(s.label)
    )
    if (keptBooked.length > 0) {
      window.alert(
        `${keptBooked.length} sold seat(s) (${keptBooked.slice(0, 5).map((s) => s.label).join(', ')}${keptBooked.length > 5 ? '…' : ''}) aren't in the new layout — they were kept in place because sold seats can't be removed.`
      )
    }

    onUpdateSection(selectedSection.id, {
      seats: [...seats, ...keptBooked],
      rowCount: fillRows,
      seatsPerRow: fillCols,
      gridRotation,
      numberingDirection: numberingDir,
      numberingStyle,
      seatGap,
      rowGap,
    })
  }, [selectedSection, fillRows, fillCols, labelScheme, gridRotation, numberingDir, numberingStyle, seatGap, rowGap, onUpdateSection])

  // Find the selected seat object
  const selectedSeat = selectedSection?.seats.find((s) => s.id === selectedSeatId) ?? null
  const [renumberRow, setRenumberRow] = useState('A')
  const [renumberStart, setRenumberStart] = useState(1)
  const [renumberMode, setRenumberMode] = useState<'row' | 'grid'>('row')
  const [multiTierId, setMultiTierId] = useState<string | null>(null)

  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers])

  // Distinct row labels in the selected section (for row-level pricing)
  const sectionRows = useMemo(() => {
    if (!selectedSection) return []
    return [...new Set(selectedSection.seats.map((s) => s.rowLabel))].sort()
  }, [selectedSection])

  return (
    <div className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white">Properties</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {selectedSeat
            ? `Seat: ${selectedSeat.label}`
            : selectedSection
            ? `Editing: ${selectedSection.label}`
            : 'Select a section to edit'}
        </p>
      </div>

      {/* ─── Selected Seat View ─────────────────────────────────────── */}
      {selectedSeatIds.length <= 1 && selectedSection && selectedSeat ? (
        <div className="p-4 space-y-4">
          <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg">
            <p className="text-sm text-white font-medium mb-1">
              Seat {selectedSeat.label}
            </p>
            <p className="text-[11px] text-slate-400">
              Row: {selectedSeat.rowLabel} • Number: {selectedSeat.seatNumber}
            </p>
            <p className="text-[11px] text-slate-400">
              Section: {selectedSection.label}
            </p>
            {(() => {
              const resolved = resolveSeatTier(selectedSeat, selectedSection)
              const tier = resolved ? tierById.get(resolved) : null
              return (
                <p className="text-[11px] mt-1.5 flex items-center gap-1.5">
                  {tier ? (
                    <>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tier.color }} />
                      <span className="text-white font-medium">{tier.name}</span>
                      <span className="text-slate-400">₱{Number(tier.price).toLocaleString()}</span>
                      {selectedSeat.tierId && <span className="text-amber-400">(seat override)</span>}
                    </>
                  ) : (
                    <span className="text-amber-400">No price category assigned</span>
                  )}
                </p>
              )
            })()}
          </div>

          {/* Per-seat price override */}
          {tiers.length > 0 && onAssignSeatsTier ? (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Banknote className="w-3.5 h-3.5" />
                Seat Price Override
              </label>
              <TierSelect
                tiers={tiers}
                value={selectedSeat.tierId}
                inheritLabel="Inherit from row / section"
                onChange={(tierId) => onAssignSeatsTier([selectedSeat.id], tierId)}
              />
              <p className="text-[10px] text-slate-600 mt-1.5">
                Pick a category to price just this seat. &quot;Inherit&quot; uses the row, then section price.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Banknote className="w-3.5 h-3.5" />
                Seat Price
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                No price categories yet. Create ticket tiers in the Tickets tab, then you can assign one to this seat.
              </p>
            </div>
          )}

          {/* Block / enable seat */}
          {onSetSeatStatus && (
            <button
              onClick={() =>
                onSetSeatStatus(
                  [selectedSeat.id],
                  selectedSeat.status === 'disabled' ? 'available' : 'disabled'
                )
              }
              className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all border ${
                selectedSeat.status === 'disabled'
                  ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-600/30'
                  : 'bg-slate-700/40 hover:bg-slate-700 text-slate-300 border-slate-600/40'
              }`}
            >
              {selectedSeat.status === 'disabled' ? '✓ Enable Seat' : '⊘ Block Seat'}
            </button>
          )}

          {onSelectRow && (
            <button
              onClick={onSelectRow}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2 rounded-lg transition-all border border-slate-700"
            >
              ⤢ Select whole row ({selectedSeat.rowLabel})
            </button>
          )}

          <button
            onClick={() => {
              onDeleteSeat(selectedSection.id, selectedSeat.id)
            }}
            className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete This Seat
          </button>

          <button
            onClick={() => onSelectSeat(null)}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2 rounded-lg transition-all border border-slate-700"
          >
            ← Back to Section
          </button>
        </div>
      ) : selectedSeatIds.length > 1 ? (
        /* ─── Multi-Seat Selection View ──────────────────────────────── */
        <div className="p-4 space-y-4">
          <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg">
            <p className="text-sm text-white font-medium mb-1">
              {selectedSeatIds.length} Seats Selected
            </p>
            <p className="text-[11px] text-slate-400">
              Assign pricing, renumber, or delete the selected seats
            </p>
          </div>

          {/* Assign price category to selection */}
          {tiers.length > 0 && onAssignSeatsTier && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                Price Category
              </label>
              <TierSelect
                tiers={tiers}
                value={multiTierId}
                inheritLabel="Inherit from row / section"
                onChange={setMultiTierId}
              />
              <button
                onClick={() => onAssignSeatsTier(selectedSeatIds, multiTierId)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-emerald-600/30"
              >
                Apply to {selectedSeatIds.length} Seats
              </button>
            </div>
          )}

          {/* Expand selection to the whole row(s) before renumbering */}
          {onSelectRow && (
            <button
              onClick={onSelectRow}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2 rounded-lg transition-all border border-slate-700"
            >
              ⤢ Select whole row
            </button>
          )}

          {/* Renumber controls */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Renumber
            </label>

            {/* Mode: single row vs grid (auto-detect rows) */}
            <div className="flex gap-2">
              <button
                onClick={() => setRenumberMode('row')}
                className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                  renumberMode === 'row' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Single row
              </button>
              <button
                onClick={() => setRenumberMode('grid')}
                className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                  renumberMode === 'grid' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Grid (rows)
              </button>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 mb-1 block">{renumberMode === 'grid' ? 'Start row' : 'Row'}</label>
                <input
                  type="text"
                  value={renumberRow}
                  onChange={(e) => setRenumberRow(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                  maxLength={3}
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 mb-1 block">Start #</label>
                <input
                  type="number"
                  value={renumberStart}
                  onChange={(e) => setRenumberStart(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-white focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                  min={1}
                />
              </div>
            </div>
            <button
              onClick={() => onRenumberSeats(selectedSeatIds, renumberRow, renumberStart, renumberMode)}
              className="w-full flex items-center justify-center gap-2 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-amber-600/30"
            >
              Apply Renumber (L→R)
            </button>
            <p className="text-[10px] text-slate-600">
              {renumberMode === 'grid'
                ? 'Detects rows top→bottom (A, B, C…), numbers each left→right.'
                : 'All selected seats become one row, numbered left→right.'}
            </p>
          </div>

          {/* Block / Enable selection */}
          {onSetSeatStatus && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onSetSeatStatus(selectedSeatIds, 'available')}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-sm font-medium py-2 rounded-lg transition-all border border-emerald-600/30"
                >
                  ✓ Enable
                </button>
                <button
                  onClick={() => onSetSeatStatus(selectedSeatIds, 'disabled')}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700/40 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2 rounded-lg transition-all border border-slate-600/40"
                >
                  ⊘ Block
                </button>
              </div>
            </div>
          )}

          {/* Spread / Compress selection */}
          {onScaleSeats && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Spacing
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onScaleSeats(selectedSeatIds, 0.9)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700/40 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2 rounded-lg transition-all border border-slate-600/40"
                >
                  − Compress
                </button>
                <button
                  onClick={() => onScaleSeats(selectedSeatIds, 1.1)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700/40 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2 rounded-lg transition-all border border-slate-600/40"
                >
                  + Spread
                </button>
              </div>
            </div>
          )}

          {/* Straighten hand-placed seats */}
          {onAlignSeats && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5" />
                Align
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onAlignSeats(selectedSeatIds, 'straighten')}
                  title="Fit to best-fit line + even spacing (keeps a diagonal if intended)"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 text-sm font-medium py-2 rounded-lg transition-all border border-sky-600/30"
                >
                  <Spline className="w-3.5 h-3.5" /> Straighten
                </button>
                <button
                  onClick={() => onAlignSeats(selectedSeatIds, 'flat')}
                  title="Snap perfectly horizontal or vertical + even spacing"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 text-sm font-medium py-2 rounded-lg transition-all border border-sky-600/30"
                >
                  <Minus className="w-3.5 h-3.5" /> Snap Flat
                </button>
              </div>
              <p className="text-[10px] text-slate-600">
                Straighten = best-fit line • Snap Flat = dead horizontal/vertical
              </p>
            </div>
          )}

          <button
            onClick={onDeleteSelectedSeats}
            className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete {selectedSeatIds.length} Seats
          </button>
        </div>
      ) : selectedShape ? (
        /* ─── Selected Shape / Zone View ─────────────────────────────── */
        <div className="p-4 space-y-5">
          <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg">
            <p className="text-sm text-white font-medium mb-1 capitalize">{selectedShape.type} element</p>
            <p className="text-[11px] text-slate-400">Decorative zone — not bookable</p>
          </div>

          {/* Label */}
          {selectedShape.type !== 'line' && (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5" />
                {selectedShape.type === 'text' ? 'Text' : 'Label'}
              </label>
              <input
                type="text"
                value={selectedShape.label ?? ''}
                placeholder={selectedShape.type === 'text' ? 'Your text' : 'e.g. STAGE (optional)'}
                onChange={(e) => onUpdateShape(selectedShape.id, { label: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Fill / color */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Palette className="w-3.5 h-3.5" />
              {selectedShape.type === 'text' || selectedShape.type === 'line' ? 'Color' : 'Fill'}
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  onClick={() => onUpdateShape(selectedShape.id, selectedShape.type === 'line' ? { stroke: color, fill: color } : { fill: color })}
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: color, borderColor: (selectedShape.type === 'line' ? selectedShape.stroke : selectedShape.fill) === color ? '#ffffff' : 'transparent' }}
                />
              ))}
            </div>
          </div>

          {/* Size */}
          {selectedShape.type === 'circle' ? (
            <div>
              <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Radius</span><span className="text-slate-400">{selectedShape.radius ?? 40}px</span></label>
              <input type="range" min="10" max="300" value={selectedShape.radius ?? 40} onChange={(e) => onUpdateShape(selectedShape.id, { radius: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
            </div>
          ) : (selectedShape.type === 'rect' || selectedShape.type === 'ellipse' || selectedShape.type === 'triangle') ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Width</span><span className="text-slate-400">{selectedShape.width ?? 120}</span></label>
                <input type="range" min="20" max="600" value={selectedShape.width ?? 120} onChange={(e) => onUpdateShape(selectedShape.id, { width: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Height</span><span className="text-slate-400">{selectedShape.height ?? 70}</span></label>
                <input type="range" min="20" max="600" value={selectedShape.height ?? 70} onChange={(e) => onUpdateShape(selectedShape.id, { height: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
              </div>
            </div>
          ) : null}

          {/* Font size (text + labeled zones) */}
          {(selectedShape.type === 'text' || (selectedShape.label && selectedShape.type !== 'line')) && (
            <div>
              <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Font size</span><span className="text-slate-400">{selectedShape.fontSize ?? 14}px</span></label>
              <input type="range" min="8" max="48" value={selectedShape.fontSize ?? 14} onChange={(e) => onUpdateShape(selectedShape.id, { fontSize: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
            </div>
          )}

          {/* Rotation (not for line) */}
          {selectedShape.type !== 'line' && (
            <div>
              <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Rotation</span><span className="text-slate-400">{selectedShape.rotation ?? 0}°</span></label>
              <input type="range" min="-180" max="180" value={selectedShape.rotation ?? 0} onChange={(e) => onUpdateShape(selectedShape.id, { rotation: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
            </div>
          )}

          {/* Border / outline for filled zones */}
          {(selectedShape.type === 'rect' || selectedShape.type === 'circle' || selectedShape.type === 'ellipse' || selectedShape.type === 'triangle') && (
            <div className="border-t border-slate-800 pt-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2"><BoxSelect className="w-3.5 h-3.5" />Outline</label>
              <label className="text-[11px] text-slate-500 flex justify-between mb-1"><span>Thickness</span><span className="text-slate-400">{selectedShape.strokeWidth ?? 0}px</span></label>
              <input type="range" min="0" max="8" value={selectedShape.strokeWidth ?? 0} onChange={(e) => onUpdateShape(selectedShape.id, { strokeWidth: parseInt(e.target.value) })} className="w-full accent-indigo-500 cursor-pointer" />
              <div className="grid grid-cols-8 gap-1.5 mt-2">
                {borderColorPresets.map((c) => (
                  <button key={c} onClick={() => onUpdateShape(selectedShape.id, { stroke: c })} className="w-7 h-7 rounded-md border-2 transition-all hover:scale-110" style={{ backgroundColor: c, borderColor: selectedShape.stroke === c ? '#818cf8' : 'transparent' }} />
                ))}
              </div>
            </div>
          )}

          {/* Delete */}
          <div className="border-t border-slate-800 pt-4">
            <button onClick={() => onDeleteShape(selectedShape.id)} className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30">
              <Trash2 className="w-4 h-4" /> Delete Element
            </button>
          </div>
        </div>
      ) : selectedSections.length > 1 ? (
        /* ─── Multi-Section Selection View ───────────────────────────── */
        (() => {
          const ids = selectedSections.map((s) => s.id)
          const first = selectedSections[0]
          return (
            <div className="p-4 space-y-5">
              <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg">
                <p className="text-sm text-white font-medium mb-1">{selectedSections.length} Sections Selected</p>
                <p className="text-[11px] text-slate-400">Batch-edit type, color, price &amp; border</p>
              </div>

              {/* Section Type */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Layers className="w-3.5 h-3.5" />Section Type</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value as SectionType
                    if (v) onUpdateSections?.(ids, { sectionType: v, color: SECTION_TYPE_COLORS[v] })
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Set type for all —</option>
                  {sectionTypes.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Palette className="w-3.5 h-3.5" />Color</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {colorPresets.map((color) => (
                    <button key={color} onClick={() => onUpdateSections?.(ids, { color })} className="w-8 h-8 rounded-lg border-2 border-transparent transition-all hover:scale-110" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>

              {/* Pricing tier for all */}
              {tiers.length > 0 && (
                <div className="border-t border-slate-800 pt-4">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Banknote className="w-3.5 h-3.5" />Price Category</label>
                  <TierSelect tiers={tiers} value={null} inheritLabel="— Set price for all —" onChange={(tierId) => onUpdateSections?.(ids, { tierId })} />
                  <p className="text-[10px] text-slate-600 mt-1">Applies to all {selectedSections.length} sections (clears row/seat overrides on save sync).</p>
                </div>
              )}

              {/* Border for all */}
              <BorderControls
                color={first.borderColor}
                width={first.borderWidth}
                style={first.borderStyle}
                fillColor={first.color}
                onChange={(updates) => onUpdateSections?.(ids, updates)}
              />

              {/* Delete all */}
              <div className="border-t border-slate-800 pt-4">
                <button onClick={() => onDeleteSections?.(ids)} className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30">
                  <Trash2 className="w-4 h-4" /> Delete {selectedSections.length} Sections
                </button>
              </div>
            </div>
          )
        })()
      ) : selectedSection ? (
        /* ─── Selected Section View ──────────────────────────────────── */
        <div className="p-4 space-y-5">
          {/* Lock position — stops the whole section frame from dragging while
              you reposition seats inside it */}
          <button
            onClick={() => onUpdateSection(selectedSection.id, { locked: !selectedSection.locked })}
            className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all border ${
              selectedSection.locked
                ? 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border-amber-600/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={selectedSection.locked ? 'Section frame is locked — click to unlock' : 'Lock the section frame so it stops moving while you edit seats'}
          >
            {selectedSection.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            {selectedSection.locked ? 'Position Locked' : 'Lock Position'}
          </button>

          {/* Section Name */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Tag className="w-3.5 h-3.5" />
              Section Name
            </label>
            <input
              type="text"
              value={selectedSection.label}
              onChange={(e) =>
                onUpdateSection(selectedSection.id, { label: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Section Type */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5" />
              Section Type
            </label>
            <select
              value={selectedSection.sectionType}
              onChange={(e) =>
                onUpdateSection(selectedSection.id, {
                  sectionType: e.target.value as SectionType,
                  color: SECTION_TYPE_COLORS[e.target.value as SectionType],
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {sectionTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Palette className="w-3.5 h-3.5" />
              Color
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  onClick={() =>
                    onUpdateSection(selectedSection.id, { color })
                  }
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor:
                      selectedSection.color === color
                        ? '#ffffff'
                        : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          {/* ─── Border ─────────────────────────────────────────────── */}
          <BorderControls
            color={selectedSection.borderColor}
            width={selectedSection.borderWidth}
            style={selectedSection.borderStyle}
            fillColor={selectedSection.color}
            onChange={(updates) => onUpdateSection(selectedSection.id, updates)}
          />

          {/* ─── Pricing ────────────────────────────────────────────── */}
          <div className="border-t border-slate-800 pt-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Banknote className="w-3.5 h-3.5" />
              Pricing
            </label>
            {tiers.length === 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {onCreateTier
                    ? 'No price categories yet — create one to price this section.'
                    : 'No ticket tiers on this event yet. Create tiers in the Tickets tab to price sections.'}
                </p>
                {onCreateTier && (
                  <NewTierForm
                    onCreateTier={onCreateTier}
                    onCreated={(tier) => onUpdateSection(selectedSection.id, { tierId: tier.id })}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Section Price Category</label>
                  <TierSelect
                    tiers={tiers}
                    value={selectedSection.tierId}
                    inheritLabel="— Not assigned —"
                    onChange={(tierId) => onUpdateSection(selectedSection.id, { tierId })}
                  />
                  {onCreateTier && (
                    <div className="mt-2">
                      <NewTierForm
                        onCreateTier={onCreateTier}
                        onCreated={(tier) => onUpdateSection(selectedSection.id, { tierId: tier.id })}
                      />
                    </div>
                  )}
                  {/* GA guard: a section with no seats sells by QUANTITY from its tier.
                      Without a tier it can't be sold at all (buyers see it dead). */}
                  {selectedSection.seats.length === 0 && !selectedSection.tierId && (
                    <p className="text-[11px] text-amber-400 mt-1.5 leading-relaxed">
                      ⚠ This section has no seats, so it sells as <span className="font-semibold">general admission</span> —
                      assign a price category or buyers can&apos;t purchase from it.
                    </p>
                  )}
                  {selectedSection.seats.length === 0 && selectedSection.tierId && (
                    <p className="text-[11px] text-emerald-400 mt-1.5 leading-relaxed">
                      ✓ General admission zone — sells by quantity at this price category&apos;s remaining inventory.
                    </p>
                  )}
                </div>

                {/* Row-level overrides */}
                {sectionRows.length > 0 && (
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1.5 block">
                      Row Overrides <span className="text-slate-600">(beats section price)</span>
                    </label>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {sectionRows.map((row) => {
                        const overrideId = selectedSection.rowTierOverrides?.[row]
                        const override = overrideId ? tierById.get(overrideId) : null
                        return (
                          <div key={row} className="flex items-center gap-2">
                            <span className={`text-xs font-mono w-7 shrink-0 text-center py-1 rounded ${override ? 'bg-indigo-600/40 text-indigo-200' : 'bg-slate-800 text-slate-400'}`}>
                              {row}
                            </span>
                            <select
                              value={overrideId ?? ''}
                              onChange={(e) => {
                                const next = { ...(selectedSection.rowTierOverrides ?? {}) }
                                if (e.target.value) next[row] = e.target.value
                                else delete next[row]
                                onUpdateSection(selectedSection.id, { rowTierOverrides: next })
                              }}
                              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">Section default</option>
                              {tiers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} — ₱{Number(t.price).toLocaleString()}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Seats Section ──────────────────────────────────────── */}
          <div className="border-t border-slate-800 pt-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Grid3X3 className="w-3.5 h-3.5" />
              Seats ({selectedSection.seats.length})
            </label>

            {/* Seat Drop Tool hint */}
            {tool === 'draw-seat' && (
              <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg mb-3">
                <p className="text-[11px] text-indigo-200 leading-relaxed mb-2">
                  Click on the canvas to place seats. Seat # auto-increments after each click.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-indigo-300 mb-1 block">
                      Current Row
                    </label>
                    <input
                      type="text"
                      value={dropRow}
                      onChange={(e) => onSetDropRow(e.target.value.toUpperCase())}
                      className="w-full bg-slate-800/80 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center"
                      placeholder="A"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-indigo-300 mb-1 block">
                      Next Seat #
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={dropSeatNumber}
                      onChange={(e) => onSetDropSeatNumber(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-800/80 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-indigo-300/60 mt-2">
                  Next: <span className="font-mono font-bold text-indigo-200">{dropRow}{dropSeatNumber}</span> • Seat # auto-advances on click
                </p>
              </div>
            )}

            {/* Auto-fill controls */}
            {tool !== 'draw-seat' && (
              <div className="bg-slate-800/50 border border-slate-700 p-3 rounded-lg mb-3">
                <p className="text-[11px] text-slate-400 mb-2 font-medium">Auto-Fill Grid</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Rows
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={fillRows}
                      onChange={(e) =>
                        setFillRows(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Seats/Row
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={fillCols}
                      onChange={(e) =>
                        setFillCols(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 flex justify-between mb-1">
                      <span>Seat Gap</span>
                      <span className="text-slate-400">{seatGap}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={seatGap}
                      onChange={(e) => setSeatGap(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 flex justify-between mb-1">
                      <span>Row Gap</span>
                      <span className="text-slate-400">{rowGap}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={rowGap}
                      onChange={(e) => setRowGap(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-500 flex justify-between mb-1">
                    <span>Grid Rotation</span>
                    <span className="text-slate-400">{gridRotation}°</span>
                  </label>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={gridRotation}
                    onChange={(e) => setGridRotation(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-500 mb-1 block">
                    Row Labels
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLabelScheme('alpha')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        labelScheme === 'alpha'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      A, B, C...
                    </button>
                    <button
                      onClick={() => setLabelScheme('numeric')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        labelScheme === 'numeric'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      1, 2, 3...
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-500 mb-1 block">
                    Seat Numbering Direction
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNumberingDir('ltr')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        numberingDir === 'ltr'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      1→ L to R
                    </button>
                    <button
                      onClick={() => setNumberingDir('rtl')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        numberingDir === 'rtl'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      ←1 R to L
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-500 mb-1 block">
                    Numbering Style
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNumberingStyle('sequential')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        numberingStyle === 'sequential'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      1, 2, 3…
                    </button>
                    <button
                      onClick={() => setNumberingStyle('odd_even')}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                        numberingStyle === 'odd_even'
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      1,3 / 2,4…
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-500 mb-1 block">
                    Aisles After Seat #
                  </label>
                  <input
                    type="text"
                    value={aisleInput}
                    onChange={(e) => setAisleInput(e.target.value)}
                    placeholder="e.g. 5, 15"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">Comma-separated seat positions for aisle gaps</p>
                </div>
                <button
                  onClick={handleFillSeats}
                  className="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
                >
                  Auto-Fill Seats ({fillRows} rows × {fillCols}/row)
                </button>
              </div>
            )}

            {/* Clear all seats */}
            {selectedSection.seats.length > 0 && (
              <button
                onClick={() =>
                  onUpdateSection(selectedSection.id, { seats: [] })
                }
                className="w-full flex items-center justify-center gap-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-xs font-medium py-2 rounded-lg transition-all border border-amber-600/20"
              >
                <XCircle className="w-3.5 h-3.5" />
                Clear All {selectedSection.seats.length} Seats
              </button>
            )}
          </div>

          {/* Duplicate / Mirror Section */}
          {onDuplicateSection && (
            <div className="border-t border-slate-800 pt-4 space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Duplicate
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onDuplicateSection(selectedSection.id, false)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-sm font-medium py-2 rounded-lg transition-all border border-indigo-600/30"
                >
                  ⧉ Duplicate
                </button>
                <button
                  onClick={() => onDuplicateSection(selectedSection.id, true)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-sm font-medium py-2 rounded-lg transition-all border border-purple-600/30"
                >
                  ↔ Mirror
                </button>
              </div>
            </div>
          )}

          {/* Resize Section — scales frame + seats around the section center.
              Drag the white corner handles on the canvas to reshape freely. */}
          {onScaleSection && (
            <div className="border-t border-slate-800 pt-4 space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Resize
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onScaleSection(selectedSection.id, 0.9)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2 rounded-lg transition-all border border-slate-700"
                >
                  − Smaller
                </button>
                <button
                  onClick={() => onScaleSection(selectedSection.id, 1.1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium py-2 rounded-lg transition-all border border-slate-700"
                >
                  + Larger
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Scales the section and its seats together. Tip: drag the white corner dots on the canvas to reshape the outline freely.
              </p>
            </div>
          )}

          {/* Delete Section */}
          <div className="border-t border-slate-800 pt-4">
            <button
              onClick={() => onDeleteSection(selectedSection.id)}
              className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30"
            >
              <Trash2 className="w-4 h-4" />
              Delete Section
            </button>
          </div>
        </div>
      ) : (
        /* ─── No Selection View ──────────────────────────────────────── */
        <div className="p-4 space-y-4">
          {/* Capacity + Pricing Summary */}
          {sections.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                Capacity &amp; Revenue
              </label>
              <CapacitySummary sections={sections} tiers={tiers} />
            </div>
          )}

          {/* Price categories — list + in-editor creation (organizer mode) */}
          {(tiers.length > 0 || onCreateTier) && (
            <div className={sections.length > 0 ? 'border-t border-slate-800 pt-4' : ''}>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Price Categories ({tiers.length})
              </label>
              {tiers.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {tiers.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-xs text-white truncate flex-1">{t.name}</span>
                      <span className="text-[10px] text-slate-400">₱{Number(t.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {onCreateTier && <NewTierForm onCreateTier={onCreateTier} />}
              {tiers.length === 0 && !onCreateTier && (
                <p className="text-[11px] text-slate-500">No price categories on this event yet.</p>
              )}
            </div>
          )}

          {/* Section List */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 block">
              All Sections ({sections.length})
            </label>
            {sections.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-slate-500 text-sm">
                  No sections drawn yet
                </div>
                <div className="text-slate-600 text-xs mt-1">
                  Use the Polygon or Rectangle tool to draw a section
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    onClick={() => onSelectSection(section.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: section.color }}
                    />
                    <span className="text-sm text-white truncate flex-1">
                      {section.label}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {section.seats.length} seats
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpdateSection(section.id, { locked: !section.locked }) }}
                      className={`shrink-0 transition-colors ${section.locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'}`}
                      title={section.locked ? 'Unlock position' : 'Lock position'}
                    >
                      {section.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Decor & Zones (stages, bars, tables, shapes) */}
          {onAddShape && (
            <div className="border-t border-slate-800 pt-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Zone
              </label>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {ZONE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onAddShape(p.shape)}
                    className="text-xs py-2 px-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-white transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="text-[11px] text-slate-500 mb-1.5 block">Basic shapes</label>
              <div className="grid grid-cols-5 gap-1.5">
                {BASIC_SHAPES.map(({ label, icon: Icon, shape }) => (
                  <button
                    key={label}
                    onClick={() => onAddShape(shape)}
                    title={label}
                    className="flex flex-col items-center gap-1 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:border-indigo-500 hover:text-white transition-all"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-2">Drops at center • click to select &amp; edit • drag to move</p>
            </div>
          )}

          {/* Background Images */}
          {backgroundShapes.length > 0 && (
            <div className="border-t border-slate-800 pt-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 block flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Backgrounds
              </label>
              <div className="space-y-3">
                {backgroundShapes.map((shape, i) => (
                  <div key={shape.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-white">Image {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdateShape(shape.id, { locked: !shape.locked })}
                          className={`transition-colors ${shape.locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'}`}
                          title={shape.locked ? 'Unlock (allow dragging)' : 'Lock in place for tracing'}
                        >
                          {shape.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onDeleteShape(shape.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <label className="text-[11px] text-slate-500 flex justify-between mb-1">
                      <span>Opacity</span>
                      <span className="text-slate-400">
                        {Math.round((shape.opacity ?? 0.5) * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((shape.opacity ?? 0.5) * 100)}
                      onChange={(e) =>
                        onUpdateShape(shape.id, {
                          opacity: parseInt(e.target.value) / 100,
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <label className="text-[11px] text-slate-500 flex justify-between mb-1 mt-2">
                      <span>Size</span>
                      <span className="text-slate-400">
                        {Math.round((shape.scale ?? 1) * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="300"
                      value={Math.round((shape.scale ?? 1) * 100)}
                      onChange={(e) =>
                        onUpdateShape(shape.id, {
                          scale: parseInt(e.target.value) / 100,
                        })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seat Appearance (global) */}
          <div className="border-t border-slate-800 pt-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 block">
              Seat Appearance
            </label>

            {/* Radius Slider */}
            <div className="mb-3">
              <label className="text-[11px] text-slate-500 flex justify-between mb-1">
                <span>Size</span>
                <span className="text-slate-400">{seatRadius}px</span>
              </label>
              <input
                type="range"
                min="2"
                max="14"
                value={seatRadius}
                onChange={(e) => onSetSeatRadius(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Shape Picker */}
            <div>
              <label className="text-[11px] text-slate-500 mb-1.5 block">Shape</label>
              <div className="flex gap-2">
                {[
                  { value: 'circle' as SeatShape, icon: Circle, label: 'Circle' },
                  { value: 'square' as SeatShape, icon: Square, label: 'Square' },
                  { value: 'diamond' as SeatShape, icon: Diamond, label: 'Diamond' },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => onSetSeatShape(value)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
                      seatShape === value
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Helpful tips based on current tool */}
          <div className="border-t border-slate-800 pt-4">
            <div className="text-xs text-slate-500 space-y-2">
              <p className="font-medium text-slate-400">Quick Tips</p>
              <p>• <kbd className="bg-slate-800 px-1 rounded text-[10px]">P</kbd> Draw polygon section</p>
              <p>• <kbd className="bg-slate-800 px-1 rounded text-[10px]">R</kbd> Draw rectangle section</p>
              <p>• <kbd className="bg-slate-800 px-1 rounded text-[10px]">D</kbd> Drop individual seats</p>
              <p>• <kbd className="bg-slate-800 px-1 rounded text-[10px]">⌘Z</kbd> Undo</p>
              <p>• Click a seat to select & delete it</p>
              <p>• Scroll to pan, ⌘+scroll to zoom</p>
              <p>• Drag background images to reposition</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
