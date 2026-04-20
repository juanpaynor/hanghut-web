'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SectionData, CanvasTool, SectionType, SeatData, BackgroundShape, SeatShape } from './types'
import { SECTION_TYPE_COLORS } from './types'
import { fillStraightSeats, fillArcSeats } from './algorithms/fill-seats'
import { Trash2, Grid3X3, Palette, Tag, Layers, Image as ImageIcon, MapPin, XCircle, Circle, Square, Diamond } from 'lucide-react'

interface CanvasPropertiesProps {
  selectedSection: SectionData | null
  sections: SectionData[]
  tool: CanvasTool
  onUpdateSection: (id: string, updates: Partial<SectionData>) => void
  onDeleteSection: (id: string) => void
  onSelectSection: (id: string) => void
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
  onRenumberSeats: (seatIds: string[], rowLabel: string, startNumber: number) => void
  onDeleteSelectedSeats: () => void
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

export function CanvasProperties({
  selectedSection,
  sections,
  tool,
  onUpdateSection,
  onDeleteSection,
  onSelectSection,
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

  // Sync state when selecting a different section
  useEffect(() => {
    if (selectedSection) {
      setFillRows(selectedSection.rowCount || 10)
      setFillCols(selectedSection.seatsPerRow || 20)
      setGridRotation(selectedSection.gridRotation || 0)
    }
  }, [selectedSection?.id])

  // ─── Fill seats in selected section ───────────────────────────────
  const handleFillSeats = useCallback(() => {
    if (!selectedSection) return

    let seatPositions
    if (selectedSection.seatOrientation === 'arc' && selectedSection.arcConfig) {
      seatPositions = fillArcSeats(selectedSection.arcConfig, {
        rowCount: fillRows,
        seatsPerRow: fillCols,
        labelScheme,
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
      })
    }

    const seats: SeatData[] = seatPositions.map((pos) => ({
      id: crypto.randomUUID(),
      rowLabel: pos.rowLabel,
      seatNumber: pos.seatNumber,
      label: pos.label,
      x: pos.x,
      y: pos.y,
      status: 'available',
      customPrice: null,
    }))

    onUpdateSection(selectedSection.id, {
      seats,
      rowCount: fillRows,
      seatsPerRow: fillCols,
      gridRotation,
    })
  }, [selectedSection, fillRows, fillCols, labelScheme, gridRotation, onUpdateSection])

  // Find the selected seat object
  const selectedSeat = selectedSection?.seats.find((s) => s.id === selectedSeatId) ?? null
  const [renumberRow, setRenumberRow] = useState('A')
  const [renumberStart, setRenumberStart] = useState(1)

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
      {selectedSection && selectedSeat ? (
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
          </div>

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
              Renumber or delete the selected seats
            </p>
          </div>

          {/* Renumber controls */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Renumber Row
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 mb-1 block">Row</label>
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
              onClick={() => onRenumberSeats(selectedSeatIds, renumberRow, renumberStart)}
              className="w-full flex items-center justify-center gap-2 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-amber-600/30"
            >
              Apply Renumber (L→R)
            </button>
          </div>

          <button
            onClick={onDeleteSelectedSeats}
            className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium py-2.5 rounded-lg transition-all border border-red-600/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete {selectedSeatIds.length} Seats
          </button>
        </div>
      ) : selectedSection ? (
        /* ─── Selected Section View ──────────────────────────────────── */
        <div className="p-4 space-y-5">
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
                  </div>
                ))}
              </div>
            )}
          </div>

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
                      <button
                        onClick={() => onDeleteShape(shape.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
