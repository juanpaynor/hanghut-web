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
import { cn } from '@/lib/utils'

interface CanvasToolbarProps {
  activeTool: CanvasTool
  onToolChange: (tool: CanvasTool) => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  zoom: number
  onZoomChange: (zoom: number) => void
  onUploadImage: () => void
}

const tools: { tool: CanvasTool; icon: typeof MousePointer2; label: string; shortcut?: string }[] = [
  { tool: 'select', icon: MousePointer2, label: 'Select & Move', shortcut: 'V' },
  { tool: 'draw-polygon', icon: Pentagon, label: 'Draw Section (Polygon)', shortcut: 'P' },
  { tool: 'draw-rect', icon: Square, label: 'Draw Section (Rectangle)', shortcut: 'R' },
  { tool: 'draw-seat', icon: MapPin, label: 'Drop Seats', shortcut: 'D' },
  { tool: 'pan', icon: Hand, label: 'Pan Canvas', shortcut: 'H' },
]

export function CanvasToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  onSave,
  zoom,
  onZoomChange,
  onUploadImage,
}: CanvasToolbarProps) {
  return (
    <div className="w-14 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-1 shrink-0">
      {/* Drawing Tools */}
      {tools.map(({ tool, icon: Icon, label, shortcut }) => (
        <button
          key={tool}
          onClick={() => onToolChange(tool)}
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center transition-all relative group',
            activeTool === tool
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          )}
          title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
        >
          <Icon className="w-5 h-5" />
          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-slate-700">
            {label}
            {shortcut && (
              <span className="ml-2 text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                {shortcut}
              </span>
            )}
          </div>
        </button>
      ))}

      {/* Divider */}
      <div className="w-8 h-px bg-slate-700 my-2" />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        title="Undo (⌘Z)"
      >
        <Undo2 className="w-4.5 h-4.5" />
      </button>
      <button
        onClick={onRedo}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="w-4.5 h-4.5" />
      </button>

      {/* Divider */}
      <div className="w-8 h-px bg-slate-700 my-2" />

      {/* Zoom */}
      <button
        onClick={() => onZoomChange(zoom * 1.2)}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        title="Zoom In"
      >
        <ZoomIn className="w-4.5 h-4.5" />
      </button>
      <button
        onClick={() => onZoomChange(zoom / 1.2)}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        title="Zoom Out"
      >
        <ZoomOut className="w-4.5 h-4.5" />
      </button>
      <button
        onClick={() => onZoomChange(1)}
        className="w-10 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-800 hover:text-white transition-all text-[10px] font-mono"
        title="Reset Zoom"
      >
        100%
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Upload Image */}
      <button
        onClick={onUploadImage}
        className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all mb-2"
        title="Upload Background Image"
      >
        <ImagePlus className="w-5 h-5" />
      </button>

      {/* Save */}
      <button
        onClick={onSave}
        className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
        title="Save Layout"
      >
        <Save className="w-5 h-5" />
      </button>
    </div>
  )
}
