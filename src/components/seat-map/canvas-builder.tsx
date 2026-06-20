'use client'

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  memo,
} from 'react'
import { Stage, Layer, Line, Circle, Ellipse, Rect, Text, Group, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import { useCanvasState } from './canvas-state'
import { CanvasToolbar } from './canvas-toolbar'
import { CanvasProperties } from './canvas-properties'
import type { CanvasData, SectionData, SeatData, BackgroundShape, SeatShape, TierInfo } from './types'
import { SEAT_COLORS, resolveSeatTier } from './types'
import { pointInPolygon, flatToVertices } from './algorithms/point-in-polygon'

// ─── Memoized seat dot ─────────────────────────────────────────────────────
const SeatDot = memo(function SeatDot({
  nodeId,
  x,
  y,
  status,
  isSelected,
  isMultiSelected,
  onClick,
  onDblClick,
  radius,
  shape,
  tierColor,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  nodeId: string
  x: number
  y: number
  status: string
  isSelected: boolean
  isMultiSelected?: boolean
  onClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onDblClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  radius: number
  shape: SeatShape
  tierColor?: string
  draggable?: boolean
  onDragStart?: (node: Konva.Node) => void
  onDragMove?: (node: Konva.Node) => void
  onDragEnd?: (cx: number, cy: number) => void
}) {
  const r = isSelected ? radius + 2 : radius
  // Stop the click from bubbling to the parent section Group — otherwise the
  // section's onClick fires SELECT, which wipes the seat selection we just made.
  const handleClick = onClick
    ? (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true
        onClick(e)
      }
    : undefined
  const handleDblClick = onDblClick
    ? (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true
        onDblClick(e)
      }
    : undefined
  // Report the new CENTER after a drag (square renders from its top-left corner).
  // cancelBubble is critical: without it the seat's dragEnd bubbles to the
  // section Group, whose handler reads e.target's coords as a drag delta and
  // shifts the ENTIRE section off-screen.
  const handleDragStart = onDragStart
    ? (e: Konva.KonvaEventObject<DragEvent>) => { e.cancelBubble = true; onDragStart(e.target) }
    : undefined
  const handleDragMove = onDragMove
    ? (e: Konva.KonvaEventObject<DragEvent>) => { e.cancelBubble = true; onDragMove(e.target) }
    : undefined
  const handleDragEnd = onDragEnd
    ? (e: Konva.KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true
        const node = e.target
        const cx = shape === 'square' ? node.x() + r : node.x()
        const cy = shape === 'square' ? node.y() + r : node.y()
        onDragEnd(cx, cy)
      }
    : undefined
  // Available seats show their price-category color; sold/held/disabled keep status colors
  const baseFill = status === 'available' && tierColor
    ? tierColor
    : (SEAT_COLORS[status as keyof typeof SEAT_COLORS] ?? '#6366f1')
  const fill = isSelected ? '#818cf8' : isMultiSelected ? '#f59e0b' : baseFill
  const stroke = isSelected ? '#ffffff' : isMultiSelected ? '#fbbf24' : status === 'available' ? (tierColor ?? '#16a34a') : undefined
  const strokeW = isSelected || isMultiSelected ? 2.5 : 1

  const listenProp = !!(onClick || onDblClick || draggable)

  if (shape === 'square') {
    return (
      <Rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        cornerRadius={2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
        perfectDrawEnabled={false}
        listening={listenProp}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        hitStrokeWidth={8}
        name="seat"
        id={nodeId}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    )
  }

  if (shape === 'diamond') {
    return (
      <Rect
        x={x}
        y={y}
        width={r * 2}
        height={r * 2}
        rotation={45}
        offsetX={r}
        offsetY={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
        perfectDrawEnabled={false}
        listening={listenProp}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        hitStrokeWidth={8}
        name="seat"
        id={nodeId}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    )
  }

  // Default: circle
  return (
    <Circle
      x={x}
      y={y}
      radius={r}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeW}
      perfectDrawEnabled={false}
      listening={listenProp}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      hitStrokeWidth={8}
      name="seat"
      id={nodeId}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  )
})

// ─── Memoized section group ────────────────────────────────────────────────
const SectionGroup = memo(function SectionGroup({
  section,
  isSelected,
  draggable,
  onDragEnd,
  onClick,
  selectedSeatId,
  selectedSeatIds,
  onSeatClick,
  onSeatDblClick,
  onSeatDragStart,
  onSeatDragMove,
  onSeatDragEnd,
  seatRadius,
  seatShape,
  tierColorMap,
  seatsDraggable,
}: {
  section: SectionData
  isSelected: boolean
  draggable: boolean
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  selectedSeatId: string | null
  selectedSeatIds: string[]
  onSeatClick?: (seatId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onSeatDblClick?: (seatId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onSeatDragStart?: (seatId: string, node: Konva.Node) => void
  onSeatDragMove?: (seatId: string, node: Konva.Node) => void
  onSeatDragEnd?: (seatId: string, cx: number, cy: number) => void
  seatRadius: number
  seatShape: SeatShape
  tierColorMap?: Map<string, string>
  seatsDraggable?: boolean
}) {
  const center = useMemo(
    () => getSectionCenter(section.polygonPoints),
    [section.polygonPoints]
  )

  return (
    <Group
      draggable={draggable}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTap={onClick}
      name="section-group"
    >
      {/* Polygon fill + configurable border */}
      <Line
        points={section.polygonPoints}
        closed
        // Keep the body visible even when the border is 0 — otherwise a faint
        // fill + no outline makes the section look like it vanished in the editor.
        fill={isSelected ? section.color + '66' : section.color + '40'}
        stroke={isSelected ? '#ffffff' : (section.borderColor || section.color)}
        strokeWidth={isSelected ? 3 : (section.borderWidth ?? 1.5)}
        dash={!isSelected && section.borderStyle === 'dashed' ? [8, 4] : undefined}
        hitStrokeWidth={12}
        perfectDrawEnabled={false}
      />
      {/* Label */}
      <Text
        x={center.x - 40}
        y={center.y - 8}
        text={section.locked ? `🔒 ${section.label}` : section.label}
        fill="#ffffff"
        fontSize={14}
        fontStyle="bold"
        width={80}
        align="center"
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Seats */}
      {section.seats.map((seat) => {
        const resolvedTier = resolveSeatTier(seat, section)
        return (
          <SeatDot
            key={seat.id}
            nodeId={seat.id}
            x={seat.x}
            y={seat.y}
            status={seat.status}
            isSelected={seat.id === selectedSeatId}
            isMultiSelected={selectedSeatIds.includes(seat.id)}
            onClick={onSeatClick ? (e) => onSeatClick(seat.id, e) : undefined}
            onDblClick={onSeatDblClick ? (e) => onSeatDblClick(seat.id, e) : undefined}
            radius={seatRadius}
            shape={seatShape}
            tierColor={resolvedTier ? tierColorMap?.get(resolvedTier) : undefined}
            draggable={seatsDraggable}
            onDragStart={onSeatDragStart ? (node) => onSeatDragStart(seat.id, node) : undefined}
            onDragMove={onSeatDragMove ? (node) => onSeatDragMove(seat.id, node) : undefined}
            onDragEnd={onSeatDragEnd ? (cx, cy) => onSeatDragEnd(seat.id, cx, cy) : undefined}
          />
        )
      })}
    </Group>
  )
})

// ─── Grid layer (fully static, never rerenders) ────────────────────────────
const GridLayer = memo(function GridLayer({
  canvasWidth,
  canvasHeight,
}: {
  canvasWidth: number
  canvasHeight: number
}) {
  const gridStep = 50
  const vLines = useMemo(() => {
    const lines = []
    for (let x = 0; x <= canvasWidth; x += gridStep) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, canvasHeight]}
          stroke="#1e293b"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
      )
    }
    return lines
  }, [canvasWidth, canvasHeight])

  const hLines = useMemo(() => {
    const lines = []
    for (let y = 0; y <= canvasHeight; y += gridStep) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, canvasWidth, y]}
          stroke="#1e293b"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
      )
    }
    return lines
  }, [canvasWidth, canvasHeight])

  return (
    <Layer listening={false}>
      <Rect
        x={-5000}
        y={-5000}
        width={10000}
        height={10000}
        fill="#0f172a"
        perfectDrawEnabled={false}
      />
      {vLines}
      {hLines}
      <Rect
        x={0}
        y={0}
        width={canvasWidth}
        height={canvasHeight}
        stroke="#334155"
        strokeWidth={2}
        fill="transparent"
        perfectDrawEnabled={false}
      />
    </Layer>
  )
})

// ─── Main Component ────────────────────────────────────────────────────────
interface CanvasBuilderProps {
  initialData?: CanvasData | null
  onSave?: (data: CanvasData) => void
  mode?: 'admin' | 'organizer'
  readOnly?: boolean
  /** Price categories (ticket tiers) available for section/row/seat assignment */
  tiers?: TierInfo[]
  /** Uploads a floor-plan image and returns its public URL. Falls back to inline data URL if not provided. */
  onUploadImageFile?: (file: File) => Promise<string | null>
}

export function CanvasBuilder({
  initialData,
  onSave,
  mode = 'admin',
  readOnly = false,
  tiers = [],
  onUploadImageFile,
}: CanvasBuilderProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const { state, dispatch, dispatchWithHistory, undo, redo } = useCanvasState()
  const [stageSize, setStageSize] = useState({ width: 1400, height: 900 })
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Clipboard for copy/paste of seats (Cmd/Ctrl + C / V)
  const seatClipboardRef = useRef<{ sectionId: string; seat: SeatData }[]>([])
  // Live group-drag: the dragged seat's start + the other selected seats' nodes
  const dragGroupRef = useRef<{ startX: number; startY: number; others: { node: Konva.Node; x: number; y: number }[] } | null>(null)
  // Middle-mouse panning (works regardless of the active tool)
  const middlePanRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null)

  // Track mouse position for live drawing preview
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // ─── Load initial data ──────────────────────────────────────────────
  useEffect(() => {
    if (initialData) {
      dispatch({
        type: 'LOAD_CANVAS',
        sections: initialData.sections,
        backgroundShapes: initialData.backgroundShapes,
        width: initialData.canvasWidth,
        height: initialData.canvasHeight,
        seatRadius: initialData.seatRadius,
        seatShape: initialData.seatShape,
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Responsive canvas size ─────────────────────────────────────────
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ─── Convert screen coords → canvas coords ─────────────────────────
  const screenToCanvas = useCallback(
    (pointer: { x: number; y: number }) => ({
      x: (pointer.x - state.panOffset.x) / state.zoom,
      y: (pointer.y - state.panOffset.y) / state.zoom,
    }),
    [state.zoom, state.panOffset]
  )

  // ─── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        }
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault()
          redo()
        }
        if (e.key === 's') {
          e.preventDefault()
          handleExport()
        }
        // Copy selected seats
        if (e.key === 'c' && state.selectedSeatIds.length > 0) {
          e.preventDefault()
          const items: { sectionId: string; seat: SeatData }[] = []
          for (const s of state.sections) {
            for (const seat of s.seats) {
              if (state.selectedSeatIds.includes(seat.id)) items.push({ sectionId: s.id, seat })
            }
          }
          seatClipboardRef.current = items
        }
        // Paste copied seats (new ids, offset so they don't overlap)
        if (e.key === 'v' && seatClipboardRef.current.length > 0) {
          e.preventDefault()
          const pasted = seatClipboardRef.current.map(({ sectionId, seat }) => ({
            sectionId,
            seat: { ...seat, id: crypto.randomUUID(), x: seat.x + 18, y: seat.y + 18 },
          }))
          dispatchWithHistory({ type: 'ADD_SEATS', seats: pasted })
        }
        return
      }

      // Tool switching
      switch (e.key.toLowerCase()) {
        case 'v':
          dispatch({ type: 'SET_TOOL', tool: 'select' })
          break
        case 'p':
          dispatch({ type: 'SET_TOOL', tool: 'draw-polygon' })
          break
        case 'r':
          dispatch({ type: 'SET_TOOL', tool: 'draw-rect' })
          break
        case 'd':
          dispatch({ type: 'SET_TOOL', tool: 'draw-seat' })
          break
        case 'h':
          dispatch({ type: 'SET_TOOL', tool: 'pan' })
          break
      }

      // Delete key — seats take priority over sections so multi-selecting
      // seats and pressing Delete can never nuke the whole section
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedSeatIds.length > 0) {
          dispatchWithHistory({ type: 'DELETE_SEATS', seatIds: state.selectedSeatIds })
        } else if (state.selectedSeatId && state.selectedIds.length > 0) {
          dispatchWithHistory({
            type: 'DELETE_SEAT',
            sectionId: state.selectedIds[0],
            seatId: state.selectedSeatId,
          })
        } else if (state.selectedIds.length > 0) {
          // Selection can hold section IDs and/or decorative shape IDs
          const shapeIds = new Set(state.backgroundShapes.map((s) => s.id))
          const selectedShapeIds = state.selectedIds.filter((id) => shapeIds.has(id))
          const selectedSectionIds = state.selectedIds.filter((id) => !shapeIds.has(id))
          selectedShapeIds.forEach((id) => dispatchWithHistory({ type: 'DELETE_SHAPE', id }))
          if (selectedSectionIds.length > 0) {
            dispatchWithHistory({ type: 'DELETE_SECTIONS', ids: selectedSectionIds })
          }
          dispatch({ type: 'DESELECT_ALL' })
        }
      }
      if (e.key === 'Escape') {
        if (state.selectedSeatId) {
          dispatch({ type: 'SELECT_SEAT', seatId: null })
        } else {
          dispatch({ type: 'DESELECT_ALL' })
          dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
          dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readOnly, state.sections, state.selectedIds, state.selectedSeatId, state.selectedSeatIds, state.backgroundShapes, undo, redo, dispatch, dispatchWithHistory])

  // ─── Zoom via Mouse Wheel ────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const pointer = stage.getPointerPosition()
      if (!pointer) return

      if (e.evt.ctrlKey || e.evt.metaKey) {
        const scaleBy = 1.08
        const oldScale = state.zoom
        const newScale =
          e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
        const clampedScale = Math.max(0.15, Math.min(5, newScale))

        const mousePointTo = {
          x: (pointer.x - state.panOffset.x) / oldScale,
          y: (pointer.y - state.panOffset.y) / oldScale,
        }
        dispatch({ type: 'SET_ZOOM', zoom: clampedScale })
        dispatch({
          type: 'SET_PAN',
          offset: {
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
          },
        })
      } else {
        dispatch({
          type: 'SET_PAN',
          offset: {
            x: state.panOffset.x - e.evt.deltaX,
            y: state.panOffset.y - e.evt.deltaY,
          },
        })
      }
    },
    [state.zoom, state.panOffset, dispatch]
  )

  // ─── Toolbar zoom (keeps viewport center fixed) ─────────────────────
  const handleToolbarZoom = useCallback(
    (newZoom: number) => {
      const clamped = Math.max(0.1, Math.min(5, newZoom))
      const center = { x: stageSize.width / 2, y: stageSize.height / 2 }
      const worldCenter = {
        x: (center.x - state.panOffset.x) / state.zoom,
        y: (center.y - state.panOffset.y) / state.zoom,
      }
      dispatch({ type: 'SET_ZOOM', zoom: clamped })
      dispatch({
        type: 'SET_PAN',
        offset: {
          x: center.x - worldCenter.x * clamped,
          y: center.y - worldCenter.y * clamped,
        },
      })
    },
    [stageSize, state.zoom, state.panOffset, dispatch]
  )

  // ─── Mouse move for live preview ─────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      // Middle-mouse panning — move the canvas by the screen-space delta.
      if (middlePanRef.current) {
        const m = middlePanRef.current
        dispatch({ type: 'SET_PAN', offset: { x: m.offX + (pointer.x - m.startX), y: m.offY + (pointer.y - m.startY) } })
        return
      }
      const canvasPos = screenToCanvas(pointer)
      setMousePos(canvasPos)
    },
    [screenToCanvas, dispatch]
  )

  // ─── Mouse Down (start rectangle drag) ──────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      // Middle mouse button → pan from anywhere, regardless of the active tool.
      if (e.evt.button === 1) {
        e.evt.preventDefault()
        middlePanRef.current = { startX: pointer.x, startY: pointer.y, offX: state.panOffset.x, offY: state.panOffset.y }
        const c = stage.container(); if (c) c.style.cursor = 'grabbing'
        return
      }

      const { x, y } = screenToCanvas(pointer)

      // Only start rect drag on stage background
      if (state.tool === 'draw-rect' && e.target === stage) {
        dispatch({ type: 'SET_DRAWING_POINTS', points: [x, y] })
        dispatch({ type: 'SET_IS_DRAWING', isDrawing: true })
      }

      // Seat tool: record start position for potential drag
      if (state.tool === 'draw-seat' && state.selectedIds.length > 0) {
        dispatch({ type: 'SET_DRAG_SEAT_START', point: { x, y } })
      }

      // Select mode: start drag-select rectangle on stage background
      if (state.tool === 'select' && e.target === stage) {
        dispatch({ type: 'SET_DRAWING_POINTS', points: [x, y] })
        dispatch({ type: 'SET_IS_DRAWING', isDrawing: true })
      }

      // Pan: start drag
      if (state.tool === 'pan') {
        stage.draggable(true)
      }
    },
    [readOnly, state.tool, state.panOffset, dispatch, screenToCanvas]
  )

  // ─── Mouse Up (finish rectangle drag) ───────────────────────────────
  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      const stage = stageRef.current
      if (!stage) return

      // Finish middle-mouse pan
      if (middlePanRef.current) {
        middlePanRef.current = null
        const c = stage.container(); if (c) c.style.cursor = ''
        return
      }

      // Pan mode: end drag
      if (state.tool === 'pan') {
        const pos = stage.position()
        dispatch({
          type: 'SET_PAN',
          offset: { x: pos.x, y: pos.y },
        })
        stage.draggable(false)
        return
      }

      // Seat tool: place single seat or row
      if (state.tool === 'draw-seat' && state.selectedIds.length > 0) {
        const pointer = stage.getPointerPosition()
        if (pointer && state.dragSeatStart) {
          const { x, y } = screenToCanvas(pointer)
          const sectionId = state.selectedIds[0]
          const section = state.sections.find((s) => s.id === sectionId)
          if (section) {
            const dx = x - state.dragSeatStart.x
            const dy = y - state.dragSeatStart.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const spacing = state.seatRadius * 2.5
            const isDrag = dist > spacing
            const count = isDrag ? Math.max(2, Math.round(dist / spacing)) : 1
            // Seats must land inside their section's polygon
            const polygon = flatToVertices(section.polygonPoints)
            const newSeats: SeatData[] = []
            let num = state.dropSeatNumber
            for (let i = 0; i < count; i++) {
              const t = count === 1 ? 0 : i / (count - 1)
              const sx = isDrag ? state.dragSeatStart.x + dx * t : state.dragSeatStart.x
              const sy = isDrag ? state.dragSeatStart.y + dy * t : state.dragSeatStart.y
              if (!pointInPolygon(sx, sy, polygon)) continue
              newSeats.push({
                id: crypto.randomUUID(),
                rowLabel: state.dropRow,
                seatNumber: num,
                label: `${state.dropRow}${num}`,
                x: sx,
                y: sy,
                status: 'available',
              })
              num++
            }
            if (newSeats.length > 0) {
              dispatchWithHistory({
                type: 'UPDATE_SECTION',
                id: sectionId,
                updates: { seats: [...section.seats, ...newSeats] },
              })
              dispatch({ type: 'SET_DROP_SEAT_NUMBER', num })
            }
          }
        }
        dispatch({ type: 'SET_DRAG_SEAT_START', point: null })
        return
      }

      // Select mode: finish drag-select rectangle
      if (
        state.tool === 'select' &&
        state.isDrawing &&
        state.drawingPoints.length >= 2
      ) {
        const pointer = stage.getPointerPosition()
        if (pointer) {
          const { x, y } = screenToCanvas(pointer)
          const [x1, y1] = state.drawingPoints
          const minX = Math.min(x1, x)
          const minY = Math.min(y1, y)
          const maxX = Math.max(x1, x)
          const maxY = Math.max(y1, y)
          // Only select if dragged enough
          if (maxX - minX > 5 || maxY - minY > 5) {
            const selectedIds: string[] = []
            state.sections.forEach((section) => {
              section.seats.forEach((seat) => {
                if (seat.x >= minX && seat.x <= maxX && seat.y >= minY && seat.y <= maxY) {
                  selectedIds.push(seat.id)
                }
              })
            })
            if (selectedIds.length > 0) {
              dispatch({ type: 'SELECT_SEATS', seatIds: selectedIds })
            }
          }
        }
        dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
        dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
        return
      }

      // Finish rectangle draw
      if (
        state.tool === 'draw-rect' &&
        state.isDrawing &&
        state.drawingPoints.length >= 2
      ) {
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const { x, y } = screenToCanvas(pointer)

        const [x1, y1] = state.drawingPoints
        const minX = Math.min(x1, x)
        const minY = Math.min(y1, y)
        const maxX = Math.max(x1, x)
        const maxY = Math.max(y1, y)

        // Minimum size check
        if (maxX - minX > 10 && maxY - minY > 10) {
          const points = [minX, minY, maxX, minY, maxX, maxY, minX, maxY]
          const newSection = createEmptySection(points, state.sections.length)
          dispatchWithHistory({ type: 'ADD_SECTION', section: newSection })
          dispatch({ type: 'SELECT', ids: [newSection.id] })
        }

        dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
        dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
      }
    },
    [readOnly, state, dispatch, dispatchWithHistory, screenToCanvas]
  )

  // ─── Stage Click (polygon + select + seat drop) ──────────────────────
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly) return
      // Ignore middle-button clicks — those are panning, not selection.
      if ('button' in e.evt && (e.evt as MouseEvent).button === 1) return
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const { x, y } = screenToCanvas(pointer)
      const clickCount = 'detail' in e.evt ? e.evt.detail : 1

      // ── Polygon drawing ───────────────────────────────────
      if (state.tool === 'draw-polygon') {
        // Double-click closes the polygon. The first click of the double-click
        // already added a vertex at this position — drop it so the polygon
        // doesn't end with a stray duplicate point.
        if (clickCount >= 2 && state.drawingPoints.length >= 6) {
          const closingPoints = state.drawingPoints.length >= 8
            ? state.drawingPoints.slice(0, -2)
            : [...state.drawingPoints]
          const newSection = createEmptySection(closingPoints, state.sections.length)
          dispatchWithHistory({ type: 'ADD_SECTION', section: newSection })
          dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
          dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
          dispatch({ type: 'SELECT', ids: [newSection.id] })
          return
        }

        // Click on starting vertex closes polygon
        if (
          state.drawingPoints.length >= 6 &&
          Math.abs(x - state.drawingPoints[0]) < 15 &&
          Math.abs(y - state.drawingPoints[1]) < 15
        ) {
          const newSection = createEmptySection([...state.drawingPoints], state.sections.length)
          dispatchWithHistory({ type: 'ADD_SECTION', section: newSection })
          dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
          dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
          dispatch({ type: 'SELECT', ids: [newSection.id] })
          return
        }

        dispatch({ type: 'ADD_DRAWING_POINT', x, y })
        return
      }

      // ── Select mode — click background deselects (only if not dragging) ──
      if (state.tool === 'select' && e.target === stage && !state.isDrawing) {
        dispatch({ type: 'DESELECT_ALL' })
      }
    },
    [readOnly, state, dispatch, dispatchWithHistory, screenToCanvas]
  )

  // ─── Section interactions ────────────────────────────────────────────
  const handleSectionClick = useCallback(
    (sectionId: string, e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly) return
      // Ignore clicks/double-clicks that originated on a seat — those select the
      // seat, not the section/zone. (Seats handle their own clicks; this guards
      // against event bubbling and the draw-seat tool where seats don't.)
      if (e && (e.target as Konva.Node)?.hasName?.('seat')) return
      if (
        state.tool === 'select' ||
        state.tool === 'draw-seat'
      ) {
        // Shift/Cmd-click toggles the section into a multi-selection (select tool only)
        const additive = state.tool === 'select' && !!e && (
          ('shiftKey' in e.evt && e.evt.shiftKey) ||
          ('metaKey' in e.evt && e.evt.metaKey) ||
          ('ctrlKey' in e.evt && e.evt.ctrlKey)
        )
        if (additive) {
          dispatch({ type: 'TOGGLE_SELECT', id: sectionId })
        } else {
          dispatch({ type: 'SELECT', ids: [sectionId] })
        }
      }
    },
    [readOnly, state.tool, dispatch]
  )

  // ─── Seat click to select ───────────────────────────────────────────
  // Single click toggles the seat in/out of the selection — so clicking several
  // seats builds a multi-selection for batch ops (Straighten, pricing, etc.).
  // Double click isolates a single seat (see handleSeatDblClick) for per-seat
  // editing.
  const handleSeatClick = useCallback(
    (seatId: string, _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly || state.tool !== 'select') return
      dispatch({ type: 'TOGGLE_SELECT_SEAT', seatId })
    },
    [readOnly, state.tool, dispatch]
  )

  // Double click selects only that seat, opening the single-seat panel
  // (per-seat price override, block/enable, delete).
  const handleSeatDblClick = useCallback(
    (seatId: string, _e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly || state.tool !== 'select') return
      dispatch({ type: 'SELECT_SEAT', seatId })
    },
    [readOnly, state.tool, dispatch]
  )

  // Expand the current seat selection to the FULL row(s) it belongs to
  // (all seats sharing the same section + rowLabel) — for batch renumber/edit.
  const handleSelectRow = useCallback(() => {
    const sel = state.selectedSeatIds.length
      ? state.selectedSeatIds
      : state.selectedSeatId ? [state.selectedSeatId] : []
    if (sel.length === 0) return
    const selSet = new Set(sel)
    const rowKeys = new Set<string>()
    for (const s of state.sections) {
      for (const seat of s.seats) {
        if (selSet.has(seat.id)) rowKeys.add(`${s.id}::${seat.rowLabel}`)
      }
    }
    const ids: string[] = []
    for (const s of state.sections) {
      for (const seat of s.seats) {
        if (rowKeys.has(`${s.id}::${seat.rowLabel}`)) ids.push(seat.id)
      }
    }
    dispatch({ type: 'SELECT_SEATS', seatIds: ids })
  }, [state.sections, state.selectedSeatIds, state.selectedSeatId, dispatch])

  // When a multi-selected seat starts dragging, snapshot the other selected
  // seats' Konva nodes so we can move them live (see handleSeatDragMove).
  const handleSeatDragStart = useCallback(
    (seatId: string, node: Konva.Node) => {
      if (!(state.selectedSeatIds.length > 1 && state.selectedSeatIds.includes(seatId))) {
        dragGroupRef.current = null
        return
      }
      const stage = stageRef.current
      if (!stage) return
      const others: { node: Konva.Node; x: number; y: number }[] = []
      for (const id of state.selectedSeatIds) {
        if (id === seatId) continue
        const n = stage.findOne<Konva.Node>('#' + id)
        if (n) others.push({ node: n, x: n.x(), y: n.y() })
      }
      dragGroupRef.current = { startX: node.x(), startY: node.y(), others }
    },
    [state.selectedSeatIds]
  )

  // Move the other selected seats imperatively as the dragged seat moves.
  const handleSeatDragMove = useCallback((_seatId: string, node: Konva.Node) => {
    const g = dragGroupRef.current
    if (!g) return
    const dx = node.x() - g.startX
    const dy = node.y() - g.startY
    for (const o of g.others) o.node.position({ x: o.x + dx, y: o.y + dy })
    node.getLayer()?.batchDraw()
  }, [])

  const handleSeatDragEnd = useCallback(
    (sectionId: string, seatId: string, cx: number, cy: number) => {
      if (readOnly || state.tool !== 'select') return
      dragGroupRef.current = null
      // Group drag: if the dragged seat is part of a multi-selection, move the
      // whole selection by the same delta.
      if (state.selectedSeatIds.length > 1 && state.selectedSeatIds.includes(seatId)) {
        let dragged: SeatData | undefined
        for (const s of state.sections) {
          const found = s.seats.find((seat) => seat.id === seatId)
          if (found) { dragged = found; break }
        }
        if (dragged) {
          dispatchWithHistory({ type: 'MOVE_SEATS', seatIds: state.selectedSeatIds, dx: cx - dragged.x, dy: cy - dragged.y })
          return
        }
      }
      dispatchWithHistory({ type: 'MOVE_SEAT', sectionId, seatId, x: cx, y: cy })
    },
    [readOnly, state.tool, state.selectedSeatIds, state.sections, dispatchWithHistory]
  )

  const handleSectionDragEnd = useCallback(
    (sectionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (readOnly || state.tool !== 'select') return
      // Only handle drags of the section frame itself. A seat drag that bubbled
      // up here would otherwise be misread as a section move (e.target is the
      // seat, not the group) and translate the whole section into oblivion.
      if (!e.target.hasName('section-group')) return

      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return

      const dx = e.target.x()
      const dy = e.target.y()
      e.target.position({ x: 0, y: 0 })

      const newPoints = section.polygonPoints.map((v, i) =>
        i % 2 === 0 ? v + dx : v + dy
      )
      const newSeats = section.seats.map((seat) => ({
        ...seat,
        x: seat.x + dx,
        y: seat.y + dy,
      }))
      // Arc center must move with the section or arc re-fill generates
      // seats at the old location
      const newArcConfig = section.arcConfig
        ? { ...section.arcConfig, cx: section.arcConfig.cx + dx, cy: section.arcConfig.cy + dy }
        : section.arcConfig

      dispatchWithHistory({
        type: 'UPDATE_SECTION',
        id: sectionId,
        updates: { polygonPoints: newPoints, seats: newSeats, arcConfig: newArcConfig },
      })
    },
    [readOnly, state.tool, state.sections, dispatchWithHistory]
  )

  // ─── Export ──────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const data: CanvasData = {
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      backgroundShapes: state.backgroundShapes,
      sections: state.sections,
      seatRadius: state.seatRadius,
      seatShape: state.seatShape,
    }
    onSave?.(data)
  }, [state, onSave])

  // ─── External save trigger (from parent header buttons) ─────────────
  useEffect(() => {
    const handler = () => handleExport()
    document.addEventListener('canvas:requestSave', handler)
    return () => document.removeEventListener('canvas:requestSave', handler)
  }, [handleExport])

  // ─── Image Upload ──────────────────────────────────────────────────────
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const [uploadingImage, setUploadingImage] = useState(false)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (fileInputRef.current) fileInputRef.current.value = ''

      setUploadingImage(true)
      try {
        // Prefer Storage upload (keeps canvas_data small); fall back to data URL
        let imageUrl: string | null = null
        if (onUploadImageFile) {
          imageUrl = await onUploadImageFile(file)
        }
        if (!imageUrl) {
          imageUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (ev) => resolve(ev.target?.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        }

        // Measure natural size so we can fit the image to the canvas
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image()
          image.crossOrigin = 'anonymous'
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = imageUrl!
        })

        const fitScale = Math.min(
          1,
          state.canvasWidth / img.naturalWidth,
          state.canvasHeight / img.naturalHeight
        )

        const newShape: BackgroundShape = {
          id: crypto.randomUUID(),
          type: 'image',
          x: (state.canvasWidth - img.naturalWidth * fitScale) / 2,
          y: (state.canvasHeight - img.naturalHeight * fitScale) / 2,
          width: img.naturalWidth,
          height: img.naturalHeight,
          fill: 'transparent',
          imageUrl,
          opacity: 0.5,
          scale: fitScale,
          locked: false,
        }
        dispatchWithHistory({ type: 'ADD_SHAPE', shape: newShape })
      } catch (err) {
        console.error('Failed to add background image:', err)
      } finally {
        setUploadingImage(false)
      }
    },
    [dispatchWithHistory, state.canvasWidth, state.canvasHeight, onUploadImageFile]
  )

  // ─── Selected section(s) / shape ────────────────────────────────────
  const selectedSections = useMemo(
    () => state.sections.filter((s) => state.selectedIds.includes(s.id)),
    [state.sections, state.selectedIds]
  )
  const selectedSection = selectedSections.length === 1 ? selectedSections[0] : undefined
  // When a single seat is selected, surface its parent section so the seat-edit
  // panel (and per-seat price override) render — the section itself need not be
  // in selectedIds.
  const seatParentSection = useMemo(() => {
    if (state.selectedSeatIds.length !== 1 || !state.selectedSeatId) return null
    return state.sections.find((s) => s.seats.some((seat) => seat.id === state.selectedSeatId)) ?? null
  }, [state.sections, state.selectedSeatId, state.selectedSeatIds])
  const selectedShape = useMemo(
    () => state.backgroundShapes.find((s) => state.selectedIds.includes(s.id) && s.type !== 'image') ?? null,
    [state.backgroundShapes, state.selectedIds]
  )

  // ─── Add a decorative shape / zone preset at the viewport center ─────
  const handleAddShape = useCallback(
    (shape: Partial<BackgroundShape> & { type: BackgroundShape['type'] }) => {
      const cx = (stageSize.width / 2 - state.panOffset.x) / state.zoom
      const cy = (stageSize.height / 2 - state.panOffset.y) / state.zoom
      const w = shape.width ?? 120
      const h = shape.height ?? 70
      // Drop centered on the viewport (rect/triangle/ellipse use top-left x/y)
      const isCentered = shape.type === 'circle'
      const newShape: BackgroundShape = {
        id: crypto.randomUUID(),
        type: shape.type,
        x: isCentered ? cx : cx - w / 2,
        y: isCentered ? cy : cy - h / 2,
        width: w,
        height: h,
        radius: shape.radius ?? 45,
        points: shape.points,
        fill: shape.fill ?? '#334155',
        stroke: shape.stroke,
        strokeWidth: shape.strokeWidth ?? 0,
        label: shape.label,
        fontSize: shape.fontSize ?? 14,
        fontColor: shape.fontColor ?? '#ffffff',
        rotation: 0,
      }
      dispatchWithHistory({ type: 'ADD_SHAPE', shape: newShape })
      dispatch({ type: 'SELECT', ids: [newShape.id] })
      dispatch({ type: 'SET_TOOL', tool: 'select' })
    },
    [stageSize, state.panOffset, state.zoom, dispatchWithHistory, dispatch]
  )

  // ─── Tier colors ────────────────────────────────────────────────────
  const tierColorMap = useMemo(
    () => new Map(tiers.map((t) => [t.id, t.color])),
    [tiers]
  )

  // ─── Live drawing preview ───────────────────────────────────────────
  const rectPreview = useMemo(() => {
    if ((state.tool !== 'draw-rect' && state.tool !== 'select') || !state.isDrawing || !mousePos) return null
    if (state.drawingPoints.length < 2) return null

    const [x1, y1] = state.drawingPoints
    return {
      x: Math.min(x1, mousePos.x),
      y: Math.min(y1, mousePos.y),
      width: Math.abs(mousePos.x - x1),
      height: Math.abs(mousePos.y - y1),
      isSelect: state.tool === 'select',
    }
  }, [state.tool, state.isDrawing, state.drawingPoints, mousePos])

  const polyPreviewLine = useMemo(() => {
    if (state.tool !== 'draw-polygon' || !mousePos) return null
    if (state.drawingPoints.length < 2) return null
    return [...state.drawingPoints, mousePos.x, mousePos.y]
  }, [state.tool, state.drawingPoints, mousePos])

  // Cursor
  const cursor = useMemo(() => {
    switch (state.tool) {
      case 'draw-polygon':
      case 'draw-rect':
        return 'crosshair'
      case 'draw-seat':
        return 'copy'
      case 'pan':
        return 'grab'
      default:
        return 'default'
    }
  }, [state.tool])

  // ─── Tool hints ─────────────────────────────────────────────────────
  const toolHint = useMemo(() => {
    if (state.tool === 'draw-polygon') {
      if (state.drawingPoints.length === 0) {
        return 'Click to place first point'
      }
      if (state.drawingPoints.length < 6) {
        return `Click to add points (${state.drawingPoints.length / 2}/3 minimum)`
      }
      return 'Click to add • Click first point or double-click to close • Esc to cancel'
    }
    if (state.tool === 'draw-rect') {
      if (!state.isDrawing) return 'Click and drag to draw a rectangle section'
      return 'Release to finish'
    }
    if (state.tool === 'draw-seat') {
      if (!state.selectedIds.length) return '⚠ Select a section first, then click to drop seats'
      return `Row ${state.dropRow} Seat ${state.dropSeatNumber} • Click to place or drag to place a row`
    }
    if (state.selectedSeatIds.length > 1) {
      return `${state.selectedSeatIds.length} seats selected • Align/renumber/price in panel • ⌘C/⌘V copy/paste • Delete to remove`
    }
    if (state.tool === 'select' && state.selectedSeatId) {
      return 'Seat selected • Click more seats to add • Double-click a seat to edit just it • Delete to remove'
    }
    if (state.tool === 'select' && state.selectedIds.length > 0) {
      return 'Drag to move • Delete to remove section • Click seats to select, double-click to edit one'
    }
    return null
  }, [state.tool, state.drawingPoints, state.isDrawing, state.selectedIds, state.selectedSeatId, state.dropRow, state.dropSeatNumber])

  return (
    <div className="flex h-full w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      {/* Left Toolbar */}
      {!readOnly && (
        <CanvasToolbar
          activeTool={state.tool}
          onToolChange={(tool) => dispatch({ type: 'SET_TOOL', tool })}
          onUndo={undo}
          onRedo={redo}
          onSave={handleExport}
          zoom={state.zoom}
          onZoomChange={handleToolbarZoom}
          onUploadImage={handleUploadClick}
        />
      )}

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={state.zoom}
          scaleY={state.zoom}
          x={state.panOffset.x}
          y={state.panOffset.y}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          style={{ cursor }}
        >
          {/* Grid (memoized, never re-renders) */}
          <GridLayer
            canvasWidth={state.canvasWidth}
            canvasHeight={state.canvasHeight}
          />

          {/* All interactive objects in one layer so mouse events aren't blocked */}
          <Layer>
            {/* Background Shapes (rendered first = behind sections) */}
            {state.backgroundShapes.map((shape) => (
              <RenderBackgroundShape
                key={shape.id}
                shape={shape}
                draggable={!readOnly && state.tool === 'select' && !shape.locked}
                isSelected={state.selectedIds.includes(shape.id)}
                onSelect={shape.type === 'image' ? undefined : (e) => {
                  if (readOnly || state.tool !== 'select') return
                  e.cancelBubble = true
                  dispatch({ type: 'SELECT', ids: [shape.id] })
                }}
                onDragEnd={(newX, newY) => {
                  dispatchWithHistory({ type: 'UPDATE_SHAPE', id: shape.id, updates: { x: newX, y: newY } })
                }}
              />
            ))}
            {/* Sections + Seats */}
            {state.sections.map((section) => (
              <SectionGroup
                key={section.id}
                section={section}
                isSelected={state.selectedIds.includes(section.id)}
                draggable={!readOnly && state.tool === 'select' && !section.locked}
                onDragEnd={(e) => handleSectionDragEnd(section.id, e)}
                onClick={(e) => handleSectionClick(section.id, e)}
                selectedSeatId={state.selectedSeatId}
                selectedSeatIds={state.selectedSeatIds}
                onSeatClick={state.tool === 'select' ? handleSeatClick : undefined}
                onSeatDblClick={state.tool === 'select' ? handleSeatDblClick : undefined}
                onSeatDragStart={state.tool === 'select' ? handleSeatDragStart : undefined}
                onSeatDragMove={state.tool === 'select' ? handleSeatDragMove : undefined}
                onSeatDragEnd={state.tool === 'select' ? (seatId, cx, cy) => handleSeatDragEnd(section.id, seatId, cx, cy) : undefined}
                seatsDraggable={!readOnly && state.tool === 'select'}
                seatRadius={state.seatRadius}
                seatShape={state.seatShape}
                tierColorMap={tierColorMap}
              />
            ))}
          </Layer>

          {/* Drawing Preview Layer */}
          <Layer listening={false}>
            {/* Polygon preview with live rubber-band line */}
            {state.tool === 'draw-polygon' &&
              state.drawingPoints.length >= 2 && (
                <>
                  <Line
                    points={polyPreviewLine || state.drawingPoints}
                    stroke="#f97316"
                    strokeWidth={2}
                    dash={[8, 4]}
                    perfectDrawEnabled={false}
                  />
                  {/* Vertex handles */}
                  {Array.from({
                    length: state.drawingPoints.length / 2,
                  }).map((_, i) => (
                    <Circle
                      key={`v-${i}`}
                      x={state.drawingPoints[i * 2]}
                      y={state.drawingPoints[i * 2 + 1]}
                      radius={i === 0 && state.drawingPoints.length >= 6 ? 8 : 5}
                      fill={
                        i === 0 && state.drawingPoints.length >= 6
                          ? '#22c55e'
                          : '#f97316'
                      }
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      perfectDrawEnabled={false}
                    />
                  ))}
                </>
              )}

            {/* Rectangle preview */}
            {rectPreview && (
              <Rect
                x={rectPreview.x}
                y={rectPreview.y}
                width={rectPreview.width}
                height={rectPreview.height}
                stroke={rectPreview.isSelect ? '#3b82f6' : '#f97316'}
                strokeWidth={2}
                dash={[8, 4]}
                fill={rectPreview.isSelect ? '#3b82f615' : '#f9731615'}
                perfectDrawEnabled={false}
              />
            )}

            {/* Seat drag row preview */}
            {state.tool === 'draw-seat' && state.dragSeatStart && mousePos && (() => {
              const dx = mousePos.x - state.dragSeatStart.x
              const dy = mousePos.y - state.dragSeatStart.y
              const dist = Math.sqrt(dx * dx + dy * dy)
              const spacing = state.seatRadius * 2.5
              const count = Math.max(1, Math.round(dist / spacing))
              const dots = []
              for (let i = 0; i <= count; i++) {
                const t = count === 0 ? 0 : i / count
                dots.push(
                  <Circle
                    key={`drag-${i}`}
                    x={state.dragSeatStart.x + dx * t}
                    y={state.dragSeatStart.y + dy * t}
                    radius={state.seatRadius}
                    fill="#6366f140"
                    stroke="#818cf8"
                    strokeWidth={1}
                    dash={[2, 2]}
                    perfectDrawEnabled={false}
                  />
                )
              }
              return <>{dots}</>
            })()}

            {/* Seat drop cursor preview */}
            {state.tool === 'draw-seat' && !state.dragSeatStart && mousePos && state.selectedIds.length > 0 && (
              <>
                <Circle
                  x={mousePos.x}
                  y={mousePos.y}
                  radius={state.seatRadius}
                  fill="#6366f180"
                  stroke="#818cf8"
                  strokeWidth={1.5}
                  dash={[3, 3]}
                  perfectDrawEnabled={false}
                />
                <Text
                  x={mousePos.x + 10}
                  y={mousePos.y - 6}
                  text={`${state.dropRow}${state.dropSeatNumber}`}
                  fill="#818cf8"
                  fontSize={10}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}
          </Layer>
        </Stage>

        {/* Zoom indicator */}
        <div className="absolute bottom-4 left-4 bg-slate-800/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none">
          {Math.round(state.zoom * 100)}%
        </div>

        {/* Image upload progress */}
        {uploadingImage && (
          <div className="absolute top-4 right-4 bg-slate-800/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none">
            Uploading image…
          </div>
        )}

        {/* Tool hint bar */}
        {toolHint && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg border border-slate-700 select-none whitespace-nowrap pointer-events-none">
            {toolHint}
          </div>
        )}

        {/* Section count badge */}
        <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur-sm text-slate-400 text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none">
          {state.sections.length} sections •{' '}
          {state.sections.reduce((sum, s) => sum + s.seats.length, 0)} seats
        </div>
      </div>

      {/* Right Properties Panel */}
      {!readOnly && (
        <CanvasProperties
          selectedSection={seatParentSection || selectedSection || null}
          selectedSections={seatParentSection ? [] : selectedSections}
          selectedShape={selectedShape}
          sections={state.sections}
          tool={state.tool}
          tiers={tiers}
          onAssignSeatsTier={(seatIds, tierId) => {
            dispatchWithHistory({ type: 'ASSIGN_SEATS_TIER', seatIds, tierId })
          }}
          onSelectRow={handleSelectRow}
          onUpdateSection={(id, updates) =>
            dispatchWithHistory({ type: 'UPDATE_SECTION', id, updates })
          }
          onUpdateSections={(ids, updates) =>
            dispatchWithHistory({ type: 'UPDATE_SECTIONS', ids, updates })
          }
          onDeleteSection={(id) => {
            dispatchWithHistory({ type: 'DELETE_SECTION', id })
            dispatch({ type: 'DESELECT_ALL' })
          }}
          onDeleteSections={(ids) => {
            dispatchWithHistory({ type: 'DELETE_SECTIONS', ids })
            dispatch({ type: 'DESELECT_ALL' })
          }}
          onSelectSection={(id) => {
            dispatch({ type: 'SELECT', ids: [id] })
          }}
          onAlignSeats={(seatIds, alignMode) => {
            dispatchWithHistory({ type: 'ALIGN_SEATS', seatIds, mode: alignMode })
          }}
          onAddShape={handleAddShape}
          backgroundShapes={state.backgroundShapes.filter(s => s.type === 'image')}
          onUpdateShape={(id, updates) => {
            dispatchWithHistory({ type: 'UPDATE_SHAPE', id, updates })
          }}
          onDeleteShape={(id) => {
            dispatchWithHistory({ type: 'DELETE_SHAPE', id })
            dispatch({ type: 'DESELECT_ALL' })
          }}
          dropRow={state.dropRow}
          dropSeatNumber={state.dropSeatNumber}
          onSetDropRow={(row) => dispatch({ type: 'SET_DROP_ROW', row })}
          onSetDropSeatNumber={(num) => dispatch({ type: 'SET_DROP_SEAT_NUMBER', num })}
          selectedSeatId={state.selectedSeatId}
          selectedSeatIds={state.selectedSeatIds}
          onDeleteSeat={(sectionId, seatId) => {
            dispatchWithHistory({ type: 'DELETE_SEAT', sectionId, seatId })
          }}
          onSelectSeat={(seatId) => {
            dispatch({ type: 'SELECT_SEAT', seatId })
          }}
          onRenumberSeats={(seatIds, rowLabel, startNumber, mode) => {
            // Find which section contains the majority of the selected seats
            const sectionId = state.sections.find(s =>
              s.seats.some(seat => seatIds.includes(seat.id))
            )?.id ?? ''
            dispatchWithHistory({ type: 'RENUMBER_SEATS', sectionId, seatIds, startRow: rowLabel, startNum: startNumber, mode })
          }}
          onDeleteSelectedSeats={() => {
            dispatchWithHistory({ type: 'DELETE_SEATS', seatIds: state.selectedSeatIds })
          }}
          onSetSeatStatus={(seatIds, status) => {
            dispatchWithHistory({ type: 'SET_SEAT_STATUS', seatIds, status })
          }}
          onScaleSeats={(seatIds, factor) => {
            dispatchWithHistory({ type: 'SCALE_SEATS', seatIds, factor })
          }}
          onDuplicateSection={(id, mirror) => {
            dispatchWithHistory({ type: 'DUPLICATE_SECTION', id, mirror })
          }}
          seatRadius={state.seatRadius}
          seatShape={state.seatShape}
          onSetSeatRadius={(r) => dispatch({ type: 'SET_SEAT_RADIUS', radius: r })}
          onSetSeatShape={(s) => dispatch({ type: 'SET_SEAT_SHAPE', shape: s })}
        />
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates an empty section (NO auto-generated seats) */
function createEmptySection(points: number[], sectionsCount: number): SectionData {
  return {
    id: crypto.randomUUID(),
    label: `Section ${String.fromCharCode(65 + (sectionsCount % 26))}`,
    color: '#6366f1',
    sectionType: 'general',
    polygonPoints: points,
    arcConfig: null,
    seatOrientation: 'straight',
    rowCount: 10,
    seatsPerRow: 20,
    gridRotation: 0,
    seats: [], // ← empty! User fills manually or via auto-fill
    isActive: true,
    sortOrder: sectionsCount,
  }
}

function getSectionCenter(points: number[]): { x: number; y: number } {
  let sumX = 0
  let sumY = 0
  const count = points.length / 2
  for (let i = 0; i < points.length; i += 2) {
    sumX += points[i]
    sumY += points[i + 1]
  }
  return { x: sumX / count, y: sumY / count }
}

const RenderBackgroundShape = memo(function RenderBackgroundShape({
  shape,
  draggable,
  isSelected,
  onDragEnd,
  onSelect,
}: {
  shape: BackgroundShape
  draggable?: boolean
  isSelected?: boolean
  onDragEnd?: (newX: number, newY: number) => void
  onSelect?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
}) {
  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd?.(e.target.x(), e.target.y())
    },
    [onDragEnd]
  )

  // Shared styling for decorative zone shapes (rect/circle/ellipse/triangle)
  const stroke = isSelected ? '#ffffff' : (shape.stroke || undefined)
  const strokeWidth = isSelected ? 2.5 : (shape.strokeWidth || 0)
  const dash = isSelected ? [6, 4] : undefined
  const common = {
    draggable,
    onDragEnd: handleDragEnd,
    onClick: onSelect,
    onTap: onSelect,
    rotation: shape.rotation || 0,
    perfectDrawEnabled: false,
  }

  // Centered label for a zone of the given box size (local coords inside a Group)
  const zoneLabel = (boxW: number, boxH: number) =>
    shape.label ? (
      <Text
        text={shape.label}
        fill={shape.fontColor || '#ffffff'}
        fontSize={shape.fontSize || 14}
        fontStyle="bold"
        width={boxW}
        y={boxH / 2 - (shape.fontSize || 14) / 2}
        align="center"
        listening={false}
        perfectDrawEnabled={false}
      />
    ) : null

  if (shape.type === 'rect') {
    const w = shape.width || 100, h = shape.height || 60
    return (
      <Group x={shape.x} y={shape.y} {...common}>
        <Rect width={w} height={h} fill={shape.fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} cornerRadius={4} perfectDrawEnabled={false} />
        {zoneLabel(w, h)}
      </Group>
    )
  }
  if (shape.type === 'circle') {
    const r = shape.radius || 40
    return (
      <Group x={shape.x} y={shape.y} {...common}>
        <Circle radius={r} fill={shape.fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} perfectDrawEnabled={false} />
        {shape.label ? (
          <Text text={shape.label} fill={shape.fontColor || '#ffffff'} fontSize={shape.fontSize || 14} fontStyle="bold" width={r * 2} x={-r} y={-(shape.fontSize || 14) / 2} align="center" listening={false} perfectDrawEnabled={false} />
        ) : null}
      </Group>
    )
  }
  if (shape.type === 'ellipse') {
    const w = shape.width || 120, h = shape.height || 70
    return (
      <Group x={shape.x} y={shape.y} {...common}>
        <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill={shape.fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} perfectDrawEnabled={false} />
        {zoneLabel(w, h)}
      </Group>
    )
  }
  if (shape.type === 'triangle') {
    const w = shape.width || 100, h = shape.height || 90
    return (
      <Group x={shape.x} y={shape.y} {...common}>
        <Line points={[w / 2, 0, w, h, 0, h]} closed fill={shape.fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} perfectDrawEnabled={false} />
        {shape.label ? (
          <Text text={shape.label} fill={shape.fontColor || '#ffffff'} fontSize={shape.fontSize || 14} fontStyle="bold" width={w} y={h * 0.55} align="center" listening={false} perfectDrawEnabled={false} />
        ) : null}
      </Group>
    )
  }
  if (shape.type === 'line') {
    // Points are stored relative to (x,y); the Group carries the position so a
    // drag is just an x/y update (same model as the other zone shapes).
    const pts = shape.points && shape.points.length >= 4 ? shape.points : [0, 0, 120, 0]
    return (
      <Group x={shape.x} y={shape.y} {...common}>
        <Line
          points={pts}
          stroke={isSelected ? '#ffffff' : (shape.stroke || shape.fill || '#94a3b8')}
          strokeWidth={isSelected ? 4 : (shape.strokeWidth || 3)}
          dash={isSelected ? [6, 4] : undefined}
          hitStrokeWidth={12}
          lineCap="round"
          perfectDrawEnabled={false}
        />
      </Group>
    )
  }
  if (shape.type === 'text') {
    return (
      <Text
        x={shape.x}
        y={shape.y}
        text={shape.label || 'Text'}
        fill={shape.fill}
        fontSize={shape.fontSize || 16}
        fontStyle="bold"
        rotation={shape.rotation || 0}
        stroke={isSelected ? '#ffffff' : undefined}
        strokeWidth={isSelected ? 0.5 : 0}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        perfectDrawEnabled={false}
      />
    )
  }
  if (shape.type === 'image' && shape.imageUrl) {
    return (
      <BackgroundImage
        x={shape.x}
        y={shape.y}
        imageUrl={shape.imageUrl}
        opacity={shape.opacity ?? 0.5}
        scale={shape.scale ?? 1}
        draggable={draggable && !shape.locked}
        onDragEnd={onDragEnd}
      />
    )
  }
  return null
})

/** Load and render a background image on the canvas */
const BackgroundImage = memo(function BackgroundImage({
  x,
  y,
  imageUrl,
  opacity,
  scale,
  draggable,
  onDragEnd,
}: {
  x: number
  y: number
  imageUrl: string
  opacity: number
  scale: number
  draggable?: boolean
  onDragEnd?: (newX: number, newY: number) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const image = new window.Image()
    image.src = imageUrl
    image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
  }, [imageUrl])

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd?.(e.target.x(), e.target.y())
    },
    [onDragEnd]
  )

  if (!img) return null

  return (
    <KonvaImage
      x={x}
      y={y}
      image={img}
      width={img.naturalWidth * scale}
      height={img.naturalHeight * scale}
      opacity={opacity}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      perfectDrawEnabled={false}
      listening={draggable}
    />
  )
})

