'use client'

import {
  MousePointer2,
  Pentagon,
  Square,
  MapPin,
  Hand,
  Undo2,
  Redo2,
  Save,
  ZoomIn,
  ZoomOut,
  ImagePlus,
} from 'lucide-react'
import type { CanvasTool } from './types'
import { FurnitureList } from './furniture-palette'
import { cn } from '@/lib/utils'

/**
 * The editor's left sidebar: what you can do, then what you can add.
 *
 * It used to be a 56px rail of unlabelled glyphs. Six abstract icons, learnable
 * only by hovering them one at a time, and the furniture list was hidden behind
 * one of them — so most of what could be put on a map was invisible until you
 * guessed which icon meant "furniture". Hence "where do I add the tables?".
 *
 * Now: tools carry their names, and everything addable is listed underneath,
 * always on screen. Picking a piece is itself what arms the placement tool, so
 * there is no mode to find first.
 */

interface CanvasToolbarProps {
  activeTool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  zoom: number
  onZoomChange: (zoom: number) => void
  onUploadImage: () => void
  /** Which furniture piece the next click will place. */
  furnitureId: string
  onPickFurniture: (id: string) => void
  canUndo?: boolean
  canRedo?: boolean
  /** Unsaved edits exist — shows an amber dot on the Save button. */
  dirty?: boolean
}

/** draw-table is deliberately absent: it is armed by picking a piece below,
 *  not by selecting a tool whose icon you have to decode first. */
const tools: { tool: CanvasTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select & move', shortcut: 'V' },
  { tool: 'draw-rect', icon: Square, label: 'Section (box)', shortcut: 'R' },
  { tool: 'draw-polygon', icon: Pentagon, label: 'Section (shape)', shortcut: 'P' },
  { tool: 'draw-seat', icon: MapPin, label: 'Seats & rows', shortcut: 'D' },
  { tool: 'pan', icon: Hand, label: 'Pan', shortcut: 'H' },
]

const iconBtn =
  'h-8 w-8 rounded-md flex items-center justify-center transition-colors shrink-0 ' +
  'text-slate-400 hover:bg-slate-800 hover:text-white ' +
  'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400'

export function CanvasToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  onSave,
  zoom,
  onZoomChange,
  onUploadImage,
  furnitureId,
  onPickFurniture,
  canUndo = true,
  canRedo = true,
  dirty = false,
}: CanvasToolbarProps) {
  return (
    <div className="w-48 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      {/* Tools — named, not guessed */}
      <div className="p-1.5 space-y-0.5">
        <p className="px-1.5 pt-1 pb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Tools</p>
        {tools.map(({ tool, icon: Icon, label, shortcut }) => (
          <button
            key={tool}
            onClick={() => onToolChange(tool)}
            className={cn(
              'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              activeTool === tool
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-[11px] flex-1 truncate">{label}</span>
            <span className={cn(
              'text-[9px] px-1 py-0.5 rounded tabular-nums',
              activeTool === tool ? 'bg-indigo-500/60 text-white' : 'bg-slate-800 text-slate-500'
            )}>
              {shortcut}
            </span>
          </button>
        ))}
      </div>

      <div className="h-px bg-slate-800" />

      {/* Insert — everything you can put on the map, always visible */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <p className="px-3 pt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Insert</p>
        <FurnitureList
          activeId={furnitureId}
          armed={activeTool === 'draw-table'}
          onPick={onPickFurniture}
        />
        <div className="h-px bg-slate-800 mx-2 my-1" />
        <div className="px-1 pb-2">
          <button
            onClick={onUploadImage}
            className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            title="Upload a floor plan to trace, or to show buyers"
          >
            <ImagePlus className="w-4 h-4 shrink-0" />
            <span className="text-[11px]">Floor plan image</span>
          </button>
        </div>
      </div>

      <div className="h-px bg-slate-800" />

      {/* History, zoom, save — on TWO rows. One row of seven controls needs
          about 270px and the sidebar is 192, which clipped the Save button off
          the left edge entirely. */}
      <div className="p-1.5 space-y-1">
        <div className="flex items-center gap-0.5">
          <button onClick={onUndo} disabled={!canUndo} className={iconBtn} title="Undo (⌘Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={onRedo} disabled={!canRedo} className={iconBtn} title="Redo (⌘⇧Z)">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button onClick={() => onZoomChange(zoom / 1.2)} className={iconBtn} title="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => onZoomChange(1)}
            className="h-8 w-11 rounded-md text-[10px] font-mono text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0 tabular-nums"
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => onZoomChange(zoom * 1.2)} className={iconBtn} title="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onSave}
          className="relative w-full h-9 rounded-md flex items-center justify-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 transition-colors text-xs font-medium"
          title={dirty ? 'Save — unsaved changes' : 'Save'}
        >
          <Save className="w-3.5 h-3.5" />
          {dirty ? 'Save changes' : 'Save'}
          {dirty && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-300" />}
        </button>
      </div>
    </div>
  )
}
