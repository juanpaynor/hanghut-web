'use client'

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  useMemo,
  memo,
} from 'react'
import { Stage, Layer, Line, Circle, Rect, Text, Group, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import { useCanvasState } from './canvas-state'
import { CanvasToolbar } from './canvas-toolbar'
import { CanvasProperties } from './canvas-properties'
import type { CanvasData, SectionData, SeatData, BackgroundShape, SeatShape, TierInfo } from './types'
import { SEAT_COLORS, resolveSeatTier } from './types'
import { pointInPolygon, flatToVertices } from './algorithms/point-in-polygon'

// ─── Memoized seat dot ─────────────────────────────────────────────────────
const SeatDot = memo(function SeatDot({
  x,
  y,
  status,
  isSelected,
  isMultiSelected,
  onClick,
  radius,
  shape,
  tierColor,
}: {
  x: number
  y: number
  status: string
  isSelected: boolean
  isMultiSelected?: boolean
  onClick?: () => void
  radius: number
  shape: SeatShape
  tierColor?: string
}) {
  const r = isSelected ? radius + 2 : radius
  // Available seats show their price-category color; sold/held/disabled keep status colors
  const baseFill = status === 'available' && tierColor
    ? tierColor
    : (SEAT_COLORS[status as keyof typeof SEAT_COLORS] ?? '#6366f1')
  const fill = isSelected ? '#818cf8' : isMultiSelected ? '#f59e0b' : baseFill
  const stroke = isSelected ? '#ffffff' : isMultiSelected ? '#fbbf24' : status === 'available' ? (tierColor ?? '#16a34a') : undefined
  const strokeW = isSelected || isMultiSelected ? 2.5 : 1

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
        listening={!!onClick}
        onClick={onClick}
        onTap={onClick}
        hitStrokeWidth={8}
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
        listening={!!onClick}
        onClick={onClick}
        onTap={onClick}
        hitStrokeWidth={8}
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
      listening={!!onClick}
      onClick={onClick}
      onTap={onClick}
      hitStrokeWidth={8}
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
  seatRadius,
  seatShape,
  tierColorMap,
}: {
  section: SectionData
  isSelected: boolean
  draggable: boolean
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onClick: () => void
  selectedSeatId: string | null
  selectedSeatIds: string[]
  onSeatClick?: (seatId: string) => void
  seatRadius: number
  seatShape: SeatShape
  tierColorMap?: Map<string, string>
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
    >
      {/* Polygon fill */}
      <Line
        points={section.polygonPoints}
        closed
        fill={isSelected ? section.color + '60' : section.color + '30'}
        stroke={isSelected ? '#ffffff' : section.color}
        strokeWidth={isSelected ? 3 : 1.5}
        hitStrokeWidth={12}
        perfectDrawEnabled={false}
      />
      {/* Label */}
      <Text
        x={center.x - 40}
        y={center.y - 8}
        text={section.label}
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
            x={seat.x}
            y={seat.y}
            status={seat.status}
            isSelected={seat.id === selectedSeatId}
            isMultiSelected={selectedSeatIds.includes(seat.id)}
            onClick={onSeatClick ? () => onSeatClick(seat.id) : undefined}
            radius={seatRadius}
            shape={seatShape}
            tierColor={resolvedTier ? tierColorMap?.get(resolvedTier) : undefined}
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
          dispatchWithHistory({ type: 'DELETE_SECTION', id: state.selectedIds[0] })
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
  }, [readOnly, state.selectedIds, state.selectedSeatId, state.selectedSeatIds, undo, redo, dispatch, dispatchWithHistory])

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
      const canvasPos = screenToCanvas(pointer)
      setMousePos(canvasPos)
    },
    [screenToCanvas]
  )

  // ─── Mouse Down (start rectangle drag) ──────────────────────────────
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
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
    [readOnly, state.tool, dispatch, screenToCanvas]
  )

  // ─── Mouse Up (finish rectangle drag) ───────────────────────────────
  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (readOnly) return
      const stage = stageRef.current
      if (!stage) return

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
    (sectionId: string) => {
      if (readOnly) return
      if (
        state.tool === 'select' ||
        state.tool === 'draw-seat'
      ) {
        dispatch({ type: 'SELECT', ids: [sectionId] })
      }
    },
    [readOnly, state.tool, dispatch]
  )

  // ─── Seat click to select (click toggles, for multi-select) ─────────
  const handleSeatClick = useCallback(
    (seatId: string) => {
      if (readOnly) return
      if (state.tool === 'select') {
        dispatch({ type: 'TOGGLE_SELECT_SEAT', seatId })
      }
    },
    [readOnly, state.tool, dispatch]
  )

  const handleSectionDragEnd = useCallback(
    (sectionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (readOnly || state.tool !== 'select') return

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

  // ─── Selected section ───────────────────────────────────────────────
  const selectedSection = state.sections.find((s) =>
    state.selectedIds.includes(s.id)
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
      return `${state.selectedSeatIds.length} seats selected • Renumber in properties panel • Delete to remove`
    }
    if (state.tool === 'select' && state.selectedSeatId) {
      return 'Press Delete/Backspace to remove seat • Esc to deselect'
    }
    if (state.tool === 'select' && state.selectedIds.length > 0) {
      return 'Drag to move • Delete to remove section • Click a seat to select it'
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
                draggable={!readOnly && state.tool === 'select'}
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
                draggable={!readOnly && state.tool === 'select'}
                onDragEnd={(e) => handleSectionDragEnd(section.id, e)}
                onClick={() => handleSectionClick(section.id)}
                selectedSeatId={state.selectedSeatId}
                selectedSeatIds={state.selectedSeatIds}
                onSeatClick={state.tool === 'select' ? handleSeatClick : undefined}
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
          selectedSection={selectedSection || null}
          sections={state.sections}
          tool={state.tool}
          tiers={tiers}
          onAssignSeatsTier={(seatIds, tierId) => {
            dispatchWithHistory({ type: 'ASSIGN_SEATS_TIER', seatIds, tierId })
          }}
          onUpdateSection={(id, updates) =>
            dispatchWithHistory({ type: 'UPDATE_SECTION', id, updates })
          }
          onDeleteSection={(id) => {
            dispatchWithHistory({ type: 'DELETE_SECTION', id })
            dispatch({ type: 'DESELECT_ALL' })
          }}
          onSelectSection={(id) => {
            dispatch({ type: 'SELECT', ids: [id] })
          }}
          backgroundShapes={state.backgroundShapes.filter(s => s.type === 'image')}
          onUpdateShape={(id, updates) => {
            dispatchWithHistory({ type: 'UPDATE_SHAPE', id, updates })
          }}
          onDeleteShape={(id) => {
            dispatchWithHistory({ type: 'DELETE_SHAPE', id })
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
          onRenumberSeats={(seatIds, rowLabel, startNumber) => {
            // Find which section contains the majority of the selected seats
            const sectionId = state.sections.find(s =>
              s.seats.some(seat => seatIds.includes(seat.id))
            )?.id ?? ''
            dispatchWithHistory({ type: 'RENUMBER_SEATS', sectionId, seatIds, startRow: rowLabel, startNum: startNumber })
          }}
          onDeleteSelectedSeats={() => {
            dispatchWithHistory({ type: 'DELETE_SEATS', seatIds: state.selectedSeatIds })
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
  onDragEnd,
}: {
  shape: BackgroundShape
  draggable?: boolean
  onDragEnd?: (newX: number, newY: number) => void
}) {
  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd?.(e.target.x(), e.target.y())
    },
    [onDragEnd]
  )

  if (shape.type === 'rect') {
    return (
      <Rect
        x={shape.x}
        y={shape.y}
        width={shape.width || 100}
        height={shape.height || 60}
        fill={shape.fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth || 1}
        rotation={shape.rotation || 0}
        draggable={draggable}
        onDragEnd={handleDragEnd}
        perfectDrawEnabled={false}
      />
    )
  }
  if (shape.type === 'circle') {
    return (
      <Circle
        x={shape.x}
        y={shape.y}
        radius={shape.radius || 40}
        fill={shape.fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth || 1}
        draggable={draggable}
        onDragEnd={handleDragEnd}
        perfectDrawEnabled={false}
      />
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
        rotation={shape.rotation || 0}
        draggable={draggable}
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
    />
  )
})

