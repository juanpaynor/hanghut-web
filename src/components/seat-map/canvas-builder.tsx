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
import { Maximize2, Minimize2 } from 'lucide-react'
import { useCanvasState } from './canvas-state'
import { CanvasToolbar } from './canvas-toolbar'
import { ContextBar } from './context-bar'
import { snapDrag } from '@/lib/seat-map/snap'
import { CHAIR, chairBox, chairTarget, seatFacing, stageCenter, stagePolygon, audienceCenter } from '@/lib/seat-map/chair'
import { sectionBounds, rotateSection, scaleSection } from '@/lib/seat-map/transform'
import {
  FURNITURE,
  findPiece,
  createFurnitureSection,
  createDecorShape,
  savedToPiece,
} from './furniture'
import type { SavedPiece } from '@/lib/seat-map/saved-piece'
import { getSavedPieces, saveSectionAsPiece, deleteSavedPiece } from '@/lib/seat-map/furniture-library-actions'
import { CanvasProperties } from './canvas-properties'
import type { CanvasData, SectionData, SeatData, BackgroundShape, SeatShape, TierInfo } from './types'
import { SEAT_COLORS, resolveSeatTier } from './types'
import { useToast } from '@/hooks/use-toast'
import { downscaleImage } from '@/lib/images/downscale'
import { pointInPolygon, flatToVertices } from './algorithms/point-in-polygon'
import { rowLabelAnchors, pointOnPath, transformRows, arcThrough, nextRowLabel, layoutRow } from '@/lib/seat-map/rows'
import type { RowData } from './types'

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
  facing = 0,
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
  /** Degrees clockwise, for 'chair' only. Ignored by the other shapes. */
  facing?: number
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

  if (shape === 'chair') {
    const back = chairBox(CHAIR.back, r)
    const pad = chairBox(CHAIR.pad, r)
    // A Group, not a single shape, because a chair is two rectangles. Everything
    // the other branches put on their Rect goes on the Group instead: it carries
    // the id (so the multi-seat drag's stage.findOne('#'+id) still resolves to
    // one node), it is what Konva drags, and its x/y IS the seat centre -- the
    // same convention as circle and diamond, which is why handleDragEnd needs no
    // special case here.
    //
    // The children listen so the Group gets a hit area at all (a Group has no
    // shape of its own). Clicks therefore arrive with e.target set to a child,
    // which is fine: every handler uses the captured seat id, never e.target.
    // Drags are different -- Konva fires those on the dragged node -- so
    // e.target there is the Group, as the handlers expect.
    return (
      <Group
        x={x}
        y={y}
        rotation={facing}
        listening={listenProp}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        name="seat"
        id={nodeId}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <Rect
          {...back}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeW}
          perfectDrawEnabled={false}
          hitStrokeWidth={6}
        />
        <Rect
          {...pad}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeW}
          perfectDrawEnabled={false}
          hitStrokeWidth={6}
        />
      </Group>
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

// ─── Row labels (both ends of every row) ───────────────────────────────────
// Drawn inside the section group so they move with it. Draggable in the
// select tool: the drag is stored as an offset from the auto anchor, so the
// label keeps following the row if the row is later moved or re-laid.
const RowLabels = memo(function RowLabels({
  rows, seatRadius, selectedRowId, editable, onClick, onDragEnd,
}: {
  rows: RowData[]
  seatRadius: number
  selectedRowId: string | null
  editable: boolean
  onClick?: (rowId: string) => void
  onDragEnd?: (rowId: string, end: 'start' | 'end', dx: number, dy: number) => void
}) {
  const fontSize = Math.max(8, Math.min(14, seatRadius * 1.6))
  return (
    <>
      {rows.map((row) => {
        if (row.hideLabels) return null
        const anchors = rowLabelAnchors(row, seatRadius)
        const auto = rowLabelAnchors({ ...row, labelOffset: undefined }, seatRadius)
        const ends: ('start' | 'end')[] = row.seatCount <= 1 ? ['start'] : ['start', 'end']
        const selected = row.id === selectedRowId
        return ends.map((end) => (
          <Group
            key={`${row.id}-${end}`}
            x={anchors[end].x}
            y={anchors[end].y}
            // Draggable only once the row is SELECTED. Every map gets rows via
            // ensureRows on load, so a large venue renders hundreds of these
            // chips; leaving them all draggable blanketed the canvas in drag
            // targets that swallowed the start of a marquee drag. Click still
            // selects the row from anywhere — then the chip can be moved.
            draggable={editable && selected}
            name="row-label"
            onClick={(e) => { e.cancelBubble = true; onClick?.(row.id) }}
            onTap={(e) => { e.cancelBubble = true; onClick?.(row.id) }}
            onDragStart={(e) => { e.cancelBubble = true }}
            onDragMove={(e) => { e.cancelBubble = true }}
            onDragEnd={(e) => {
              e.cancelBubble = true
              onDragEnd?.(row.id, end, e.target.x() - auto[end].x, e.target.y() - auto[end].y)
            }}
          >
            <Rect
              x={-fontSize * 0.9} y={-fontSize * 0.65}
              width={fontSize * 1.8} height={fontSize * 1.3}
              cornerRadius={3}
              fill={selected ? '#6366f1' : 'rgba(15,23,42,0.75)'}
              stroke={selected ? '#ffffff' : undefined}
              strokeWidth={selected ? 1 : 0}
              perfectDrawEnabled={false}
            />
            <Text
              x={-fontSize * 0.9} y={-fontSize * 0.65}
              width={fontSize * 1.8} height={fontSize * 1.3}
              text={row.label}
              fontSize={fontSize}
              fontStyle="bold"
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
        ))
      })}
    </>
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
  onDragMove,
  onSeatClick,
  onSeatDblClick,
  onSeatDragStart,
  onSeatDragMove,
  onSeatDragEnd,
  seatRadius,
  seatShape,
  stagePoint,
  onStageCtx,
  tierColorMap,
  seatsDraggable,
  selectedRowId,
  rowLabelsEditable,
  onRowLabelClick,
  onRowLabelDragEnd,
}: {
  section: SectionData
  isSelected: boolean
  draggable: boolean
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  /** Fires continuously while the frame is dragged, so a section can be
   *  snapped as it moves rather than jumping when it is dropped. */
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void
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
  /** Centre of the shape whose role is 'stage', or null when the map has none.
   *  Only the 'chair' shape uses it; every chair turns to face this point. */
  stagePoint?: { x: number; y: number } | null
  /** The stage's outline plus where the room is, so a section standing ON the
   *  stage faces out instead of at its own middle. */
  onStageCtx?: { stagePoly: number[] | null; audience: { x: number; y: number } | null }
  tierColorMap?: Map<string, string>
  seatsDraggable?: boolean
  selectedRowId?: string | null
  rowLabelsEditable?: boolean
  onRowLabelClick?: (rowId: string) => void
  onRowLabelDragEnd?: (rowId: string, end: 'start' | 'end', dx: number, dy: number) => void
}) {
  // Chairs at a TABLE face the table; seats in an audience block face the
  // stage. Worked out from where the seats sit relative to the outline, so the
  // builder and the buyer's picker reach the same answer with no stored flag.
  // Once per section: the verdict is the same for every seat in it.
  const facingTarget = useMemo(
    () => chairTarget(section.polygonPoints, section.seats, stagePoint ?? null, onStageCtx),
    [section.polygonPoints, section.seats, stagePoint, onStageCtx]
  )

  const center = useMemo(
    () => getSectionCenter(section.polygonPoints),
    [section.polygonPoints]
  )

  return (
    <Group
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
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
            // Section override wins over the map-wide default, matching the
            // resolution order in the buyer's picker. If these two disagree the
            // builder becomes a liar about what buyers will see, which is worse
            // than not having the feature.
            shape={section.seatShape ?? seatShape}
            // Per SEAT, not per section: a block curved around a stage has its
            // end seats genuinely angled differently from its middle ones, and
            // chairs around a table each face a different way by definition.
            // Only 'chair' reads this, and chairFacing is a single atan2.
            // seatFacing, not chairFacing: a seat the organizer has turned by
            // hand carries its own angle and stops following the stage.
            facing={
              (section.seatShape ?? seatShape) === 'chair'
                ? seatFacing(seat, facingTarget)
                : 0
            }
            tierColor={resolvedTier ? tierColorMap?.get(resolvedTier) : undefined}
            draggable={seatsDraggable}
            onDragStart={onSeatDragStart ? (node) => onSeatDragStart(seat.id, node) : undefined}
            onDragMove={onSeatDragMove ? (node) => onSeatDragMove(seat.id, node) : undefined}
            onDragEnd={onSeatDragEnd ? (cx, cy) => onSeatDragEnd(seat.id, cx, cy) : undefined}
          />
        )
      })}
      {section.showRowLabels !== false && (section.rows?.length ?? 0) > 0 && (
        <RowLabels
          rows={section.rows!}
          seatRadius={seatRadius}
          selectedRowId={isSelected ? (selectedRowId ?? null) : null}
          editable={!!rowLabelsEditable && isSelected}
          onClick={onRowLabelClick}
          onDragEnd={onRowLabelDragEnd}
        />
      )}
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
  /** `auto` marks a background autosave (parent can keep the toast quiet). */
  onSave?: (data: CanvasData, opts?: { auto?: boolean }) => void
  /** Reports unsaved-edit state so the parent can save before Publish. */
  onDirtyChange?: (dirty: boolean) => void
  /** Autosave this many ms after the last edit while dirty (0/undefined = off). */
  autosaveMs?: number
  mode?: 'admin' | 'organizer'
  readOnly?: boolean
  /** Price categories (ticket tiers) available for section/row/seat assignment */
  tiers?: TierInfo[]
  /** Creates a new price category (organizer mode) — returns it so it can be auto-assigned. */
  onCreateTier?: (name: string, price: number) => Promise<TierInfo | null>
  /** Uploads a floor-plan image and returns its public URL. Falls back to inline data URL if not provided. */
  onUploadImageFile?: (file: File) => Promise<string | null>
}

export function CanvasBuilder({
  initialData,
  onSave,
  mode = 'admin',
  readOnly = false,
  tiers = [],
  onCreateTier,
  onUploadImageFile,
  onDirtyChange,
  autosaveMs,
}: CanvasBuilderProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const { state, dispatch, dispatchWithHistory: rawDispatchWithHistory, undo: rawUndo, redo: rawRedo, canUndo, canRedo } = useCanvasState()
  const [stageSize, setStageSize] = useState({ width: 1400, height: 900 })
  // "Large screen" mode — the editor breaks out of its boxed layout to fill the
  // whole viewport. The ResizeObserver below picks up the new container size and
  // resizes the Konva stage automatically, so no manual re-fit is needed.
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Unsaved-changes tracking: any history-worthy edit marks the canvas dirty;
  // Save clears it. Backed by a beforeunload guard so closing the tab can't
  // silently discard work.
  const [dirty, setDirty] = useState(false)
  const { toast } = useToast()
  const dispatchWithHistory = useCallback((action: Parameters<typeof rawDispatchWithHistory>[0]) => {
    setDirty(true)
    rawDispatchWithHistory(action)
  }, [rawDispatchWithHistory])
  const undo = useCallback(() => { setDirty(true); rawUndo() }, [rawUndo])
  const redo = useCallback(() => { setDirty(true); rawRedo() }, [rawRedo])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Clipboard for copy/paste of seats (Cmd/Ctrl + C / V)
  const seatClipboardRef = useRef<{ sectionId: string; seat: SeatData }[]>([])
  // Live group-drag: the dragged seat's start + the other selected seats' nodes
  const dragGroupRef = useRef<{ startX: number; startY: number; others: { node: Konva.Node; x: number; y: number }[] } | null>(null)
  /**
   * Live state for a drag of the rotate handle.
   *
   * `original` is captured once at mousedown and every frame rotates THAT by the
   * total angle so far. Rotating the previous frame's result instead would drift:
   * a section turns about its bounding-box centre, and for an asymmetric piece
   * like a U booth that centre moves as the box changes shape, so an incremental
   * spin would slowly walk the booth across the map.
   */
  const rotateDragRef = useRef<{
    sectionId: string
    original: SectionData
    origin: { x: number; y: number }
    startAngle: number
    committed: boolean
  } | null>(null)

  /**
   * The seat-selection rotate knob. Same strategy as rotateDragRef above and
   * for the same reason: hold the positions the seats had when the gesture
   * began, and frame rotate THOSE by the total angle. Turning the current
   * state by each frame's small delta accumulates rounding and walks the block
   * out from under the cursor.
   */
  const seatRotateDragRef = useRef<{
    /** Each seat's facing when the gesture began, so the drag adds to it. */
    original: { id: string; facing: number }[]
    origin: { x: number; y: number }
    startAngle: number
    committed: boolean
  } | null>(null)

  /** True once the current vertex drag has pushed its undo entry. One entry per
   *  gesture, taken on the first move while the shape is still untouched. */
  const vertexDragCommittedRef = useRef(false)

  /**
   * Baseline for a drag of a row's start/end/curve handle.
   *
   * The three reference points are captured ONCE at mousedown. Recomputing them
   * from the live path each frame — which is what the old commit-on-release code
   * did, harmlessly, because it only ever ran once — would feed each frame's
   * result back in as the next frame's baseline, and a dragged arc would
   * progressively deform instead of simply following the cursor.
   */
  /**
   * Baseline for a drag of a furniture box handle. Captured once, for the same
   * reason the rotate handle captures its own: scaling the previous frame's
   * result compounds the factor, so a slow drag would shrink a booth to nothing
   * while a fast one barely moved it.
   */
  const scaleDragRef = useRef<{
    sectionId: string
    original: SectionData
    /** The corner being dragged, and the fixed corner opposite it. */
    anchor: { x: number; y: number }
    startW: number
    startH: number
    committed: boolean
  } | null>(null)

  const rowDragRef = useRef<{
    rowId: string
    s0: { x: number; y: number }
    e0: { x: number; y: number }
    m0: { x: number; y: number }
    committed: boolean
  } | null>(null)

  // Furniture is a fixed shape you move, turn and resize whole. Its vertex
  // handles are hidden unless this is on — a C booth is 42 points, and 42
  // handles bury the piece they are meant to edit.
  const [editPoints, setEditPoints] = useState(false)
  // Details panel: closed by default. The bar carries the controls people reach
  // for constantly; this holds the rest, and keeping it permanently open is
  // what cost the map 320px and made the column scroll.
  const [panelOpen, setPanelOpen] = useState(false)

  /**
   * How far the section being dragged has moved so far.
   *
   * The handles — vertices, box corners, the rotate knob — are drawn at the
   * Layer level, AFTER the sections, so they sit on top and win the hit test.
   * That also means Konva's native drag of the section's own group does not
   * move them: they are positioned from polygonPoints, which do not change
   * until the drag is released. So the shape slid away and its handles stayed
   * behind until you let go.
   *
   * Rather than rewrite the points on every frame — which would double the
   * movement, since the group node is already displaced by the same amount —
   * the handles simply borrow the group's offset while the drag is running.
   * Purely visual, and it ends the moment the real points are committed.
   */
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const selectedSectionId = state.selectedIds.length === 1 ? state.selectedIds[0] : null
  // Per-piece, not sticky: switching selection puts point editing away again.
  useEffect(() => { setEditPoints(false) }, [selectedSectionId])

  // Middle-mouse panning (works regardless of the active tool)
  const middlePanRef = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null)
  /** Set when a marquee drag just finished, to swallow the `click` the browser
   *  fires straight after `mouseup`. Without it that click lands on the stage
   *  background and DESELECT_ALLs the seats the marquee just selected — the
   *  reducer has already flushed `isDrawing: false`, so the click handler's
   *  own `!state.isDrawing` guard no longer recognises it as part of a drag.
   *  A ref, not state: it must be readable in the same tick it is written. */
  const suppressClickRef = useRef(false)

  // Track mouse position for live drawing preview
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // Sections with sold seats can't be deleted — the server refuses to drop booked
  // rows on save, so the section would silently "resurrect" on reload. Block it
  // here with an explanation instead. Returns the ids that are SAFE to delete.
  const filterDeletableSections = useCallback((ids: string[]): string[] => {
    const blocked: string[] = []
    const ok: string[] = []
    for (const id of ids) {
      const section = state.sections.find((s) => s.id === id)
      if (!section) continue
      const sold = section.seats.filter((s) => s.status === 'booked').length
      if (sold > 0) blocked.push(`${section.label} (${sold} sold)`)
      else ok.push(id)
    }
    if (blocked.length > 0) {
      window.alert(
        `Can't delete ${blocked.join(', ')} — sections with sold seats can't be removed. You can mark the section inactive or block its remaining seats instead.`
      )
    }
    return ok
  }, [state.sections])

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

  // ─── Zoom-to-fit once on open ───────────────────────────────────────
  // Big maps used to open at 100% zoom anchored at the origin — often showing
  // empty grid. Fit the drawn content (sections + shapes) once both the map
  // and the real container size are known.
  const didFitRef = useRef(false)
  useEffect(() => {
    if (didFitRef.current || stageSize.width < 200) return
    const hasContent = state.sections.length > 0 || state.backgroundShapes.length > 0
    if (!hasContent) return
    didFitRef.current = true
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const extend = (x: number, y: number) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    for (const s of state.sections) {
      for (let i = 0; i < s.polygonPoints.length; i += 2) extend(s.polygonPoints[i], s.polygonPoints[i + 1])
      for (const seat of s.seats) extend(seat.x, seat.y)
    }
    for (const sh of state.backgroundShapes) {
      extend(sh.x, sh.y)
      extend(sh.x + (sh.width ?? sh.radius ?? 60), sh.y + (sh.height ?? sh.radius ?? 60))
    }
    if (!isFinite(minX)) return
    const pad = 60
    const w = maxX - minX + pad * 2
    const h = maxY - minY + pad * 2
    const zoom = Math.max(0.15, Math.min(1.5, Math.min(stageSize.width / w, stageSize.height / h)))
    dispatch({ type: 'SET_ZOOM', zoom })
    dispatch({
      type: 'SET_PAN',
      offset: {
        x: stageSize.width / 2 - (minX + (maxX - minX) / 2) * zoom,
        y: stageSize.height / 2 - (minY + (maxY - minY) / 2) * zoom,
      },
    })
  }, [state.sections, state.backgroundShapes, stageSize, dispatch])

  // ─── Full-screen: lock page scroll + Esc to exit ────────────────────
  useEffect(() => {
    if (!isFullscreen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      // Only hijack Esc when nothing is selected/being drawn, so Esc still works
      // as "deselect" first and only exits full screen on a second press.
      if (e.key !== 'Escape') return
      if (state.selectedIds.length === 0 && state.selectedSeatIds.length === 0 && !state.selectedSeatId && !state.isDrawing) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [isFullscreen, state.selectedIds, state.selectedSeatIds, state.selectedSeatId, state.isDrawing])

  // ─── Sticky middle-pan fix ──────────────────────────────────────────
  // Releasing the middle button OUTSIDE the canvas never fired the stage's
  // mouseup, leaving the pan "stuck" to the cursor. Window-level cleanup.
  useEffect(() => {
    const clear = (e: MouseEvent) => {
      if (e.button === 1 && middlePanRef.current) {
        middlePanRef.current = null
        const c = stageRef.current?.container()
        if (c) c.style.cursor = ''
      }
    }
    window.addEventListener('mouseup', clear)
    return () => window.removeEventListener('mouseup', clear)
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
        // Select everything unlocked. Rotate-all already existed in the bar and
        // the panel; this was the missing half of "select all, then rotate all"
        // — there was no way to get everything selected short of dragging a
        // marquee across the whole canvas and hoping.
        if (e.key === 'a') {
          e.preventDefault()
          dispatch({ type: 'SELECT_ALL' })
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
        case 't':
          dispatch({ type: 'SET_TOOL', tool: 'draw-table' })
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
        if (state.selectedRowId && state.selectedIds.length > 0) {
          const sec = state.sections.find((x) => x.id === state.selectedIds[0])
          const sold = sec?.seats.filter((x) => x.rowId === state.selectedRowId && x.status === 'booked').length ?? 0
          if (sold > 0 && !window.confirm(`${sold} seat(s) in this row are sold and will stay on the map. Delete the row and its unsold seats?`)) return
          dispatchWithHistory({ type: 'DELETE_ROW', sectionId: state.selectedIds[0], rowId: state.selectedRowId })
        } else if (state.selectedSeatIds.length > 0) {
          // Sold seats can't be deleted (server keeps them → confusing resurrection)
          const bookedIds = new Set(
            state.sections.flatMap((s) => s.seats.filter((seat) => seat.status === 'booked').map((seat) => seat.id))
          )
          const deletable = state.selectedSeatIds.filter((id) => !bookedIds.has(id))
          if (deletable.length < state.selectedSeatIds.length) {
            window.alert(`${state.selectedSeatIds.length - deletable.length} sold seat(s) were skipped — sold seats can't be deleted.`)
          }
          if (deletable.length > 0) dispatchWithHistory({ type: 'DELETE_SEATS', seatIds: deletable })
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
          const selectedSectionIds = filterDeletableSections(state.selectedIds.filter((id) => !shapeIds.has(id)))
          selectedShapeIds.forEach((id) => dispatchWithHistory({ type: 'DELETE_SHAPE', id }))
          if (selectedSectionIds.length > 0) {
            dispatchWithHistory({ type: 'DELETE_SECTIONS', ids: selectedSectionIds })
          }
          dispatch({ type: 'DESELECT_ALL' })
        }
      }
      if (e.key === 'Escape') {
        if (state.selectedRowId) {
          dispatch({ type: 'SELECT_ROW', rowId: null })
        } else if (state.selectedSeatId) {
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
  }, [readOnly, state.sections, state.selectedIds, state.selectedSeatId, state.selectedSeatIds, state.selectedRowId, state.backgroundShapes, undo, redo, dispatch, dispatchWithHistory, filterDeletableSections])

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
      // Any new press starts a fresh interaction, so a suppress flag left over
      // from a drag whose click never arrived (released off-stage, or swallowed
      // by the browser) can't eat this one.
      suppressClickRef.current = false
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

      // Table tool: arm anywhere, INCLUDING on top of an uploaded floor plan or
      // an existing zone — tracing a venue's own plan is the main way clubs lay
      // their tables out, and a background image is a Konva node, not the stage,
      // so the `e.target === stage` guard above would silently swallow every
      // click that landed on the plan. Nothing is draggable while this tool is
      // active (every draggable above is gated on 'select'), so arming broadly
      // cannot start a drag of something else.
      if (state.tool === 'draw-table') {
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
    // state.selectedIds is read above (seat-drop needs a section selected). It
    // MUST be a dep — otherwise selecting a section without changing the tool
    // leaves this handler stale, and the seat tool silently no-ops until you
    // toggle tools (which changes state.tool and rebuilds the callback).
    [readOnly, state.tool, state.panOffset, state.selectedIds, dispatch, screenToCanvas]
  )

  // Which furniture piece the table tool drops. Deliberately component state,
  // not canvas state: it is a tool setting, so it must not enter undo history
  // or get serialised into canvas_data.
  const [furnitureId, setFurnitureId] = useState<string>('table-round')

  // ─── The venue's own saved pieces ─────────────────────────────────────
  // Loaded once, kept in component state alongside furnitureId for the same
  // reason: a library of stencils is a tool setting, not part of the map, so it
  // must never enter undo history or get serialised into canvas_data. Placing
  // one COPIES its outline into a section, so the library is a stencil and not
  // a live link — deleting a piece can never alter a published map or a ticket.
  const [savedPieces, setSavedPieces] = useState<SavedPiece[]>([])
  useEffect(() => {
    let alive = true
    // Failures are swallowed by the action and come back as []. The built-in
    // catalogue must still work if this table is unreachable.
    getSavedPieces().then((rows) => { if (alive) setSavedPieces(rows) })
    return () => { alive = false }
  }, [])

  // Resolves either a built-in id or a `saved:<uuid>` one. Every call site that
  // used `findPiece(furnitureId) ?? FURNITURE[0]` goes through here instead, so
  // a saved piece places, sizes and sells exactly like a catalogue piece.
  const resolvePiece = useCallback(
    (id: string) => {
      const builtIn = findPiece(id)
      if (builtIn) return builtIn
      const saved = savedPieces.find((sp) => `saved:${sp.id}` === id)
      return saved ? savedToPiece(saved) : FURNITURE[0]
    },
    [savedPieces]
  )

  // Save the selected piece's outline to the venue's library.
  const handleSaveAsPiece = useCallback(
    async (section: SectionData) => {
      const suggested = section.label.replace(/\s+\d+$/, '').trim() || 'My piece'
      const name = window.prompt(
        'Name this piece so you can find it next time (e.g. "Corner booth"):',
        suggested
      )
      if (name === null) return
      const res = await saveSectionAsPiece({
        name,
        polygonPoints: section.polygonPoints,
        pax: section.unitCapacity ?? 1,
        sectionType: section.sectionType,
        color: section.color,
      })
      if (!res.ok || !res.piece) {
        toast({ title: 'Could not save that piece', description: res.error, variant: 'destructive' })
        return
      }
      setSavedPieces((prev) =>
        [...prev, res.piece!].sort((a, b) => a.name.localeCompare(b.name))
      )
      toast({
        title: `Saved “${res.piece.name}”`,
        description: 'It is in My pieces now, on every event you run here.',
      })
    },
    [toast]
  )

  const handleDeleteSavedPiece = useCallback(
    async (id: string) => {
      const piece = savedPieces.find((sp) => sp.id === id)
      if (!piece) return
      if (!window.confirm(
        `Forget “${piece.name}”?\n\nIt is only removed from your library. ` +
        `Any already placed on a map stay exactly where they are.`
      )) return
      const res = await deleteSavedPiece(id)
      if (!res.ok) {
        toast({ title: 'Could not remove that piece', description: res.error, variant: 'destructive' })
        return
      }
      setSavedPieces((prev) => prev.filter((sp) => sp.id !== id))
      // The armed piece just stopped existing; fall back so the next click on
      // the canvas does not place the catalogue's first item by surprise.
      setFurnitureId((cur) => (cur === `saved:${id}` ? 'table-round' : cur))
    },
    [savedPieces, toast]
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
            const polygon = flatToVertices(section.polygonPoints)

            if (isDrag) {
              // ── Row tool: a drag lays a whole ROW (label + numbering + path),
              // not loose seats. Seats outside the section are trimmed and the
              // path shrinks to the seats that fit, so the labels hug real seats.
              const count = Math.max(2, Math.round(dist / spacing) + 1)
              const draft: RowData = {
                id: crypto.randomUUID(),
                label: state.dropRow || nextRowLabel(section),
                path: { kind: 'line', x1: state.dragSeatStart.x, y1: state.dragSeatStart.y, x2: x, y2: y },
                seatCount: count,
                startNumber: state.dropSeatNumber,
                numberingDirection: section.numberingDirection ?? 'ltr',
                numberingStyle: section.numberingStyle ?? 'sequential',
              }
              const laid = layoutRow(draft).filter((p) => pointInPolygon(p.x, p.y, polygon))
              if (laid.length > 0) {
                const row: RowData = laid.length === 1
                  ? { ...draft, seatCount: 1, path: { kind: 'line', x1: laid[0].x, y1: laid[0].y, x2: laid[0].x, y2: laid[0].y } }
                  : { ...draft, seatCount: laid.length, path: { kind: 'line', x1: laid[0].x, y1: laid[0].y, x2: laid[laid.length - 1].x, y2: laid[laid.length - 1].y } }
                dispatchWithHistory({ type: 'ADD_ROW', sectionId, row })
                // Next drag is the next row: advance the label, keep the start number.
                dispatch({ type: 'SET_DROP_ROW', row: nextRowLabel({ ...section, rows: [...(section.rows ?? []), row] }) })
              }
            } else {
              // Single click: one hand-placed seat (no row), as before.
              const sx = state.dragSeatStart.x, sy = state.dragSeatStart.y
              if (pointInPolygon(sx, sy, polygon)) {
                const num = state.dropSeatNumber
                dispatchWithHistory({
                  type: 'UPDATE_SECTION',
                  id: sectionId,
                  updates: {
                    seats: [...section.seats, {
                      id: crypto.randomUUID(), rowLabel: state.dropRow, seatNumber: num, label: `${state.dropRow}${num}`,
                      x: sx, y: sy, status: 'available', rowId: null,
                    }],
                  },
                })
                dispatch({ type: 'SET_DROP_SEAT_NUMBER', num: num + 1 })
              }
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
            // A real drag happened — whatever click follows is its tail, not a
            // fresh click, whether it lands on the background, a section or a seat.
            suppressClickRef.current = true
            const selectedIds: string[] = []
            state.sections.forEach((section) => {
              section.seats.forEach((seat) => {
                if (seat.x >= minX && seat.x <= maxX && seat.y >= minY && seat.y <= maxY) {
                  selectedIds.push(seat.id)
                }
              })
            })
            if (selectedIds.length > 0) {
              // Shift-drag ADDS to the existing selection (multi-area select)
              const additive = e.evt.shiftKey
              const merged = additive
                ? Array.from(new Set([...state.selectedSeatIds, ...selectedIds]))
                : selectedIds
              dispatch({ type: 'SELECT_SEATS', seatIds: merged })
            }
          }
        }
        dispatch({ type: 'SET_DRAWING_POINTS', points: [] })
        dispatch({ type: 'SET_IS_DRAWING', isDrawing: false })
        return
      }

      // ── Table tool: one gesture = one piece of furniture ──────────────
      // A click drops the selected piece at its natural size; a drag sizes it.
      // A sellable piece becomes a section carrying exactly ONE seat plus a pax
      // count, which is what makes the buyer's picker treat it as a single unit
      // (isUnitSection in seat-map-picker.tsx: unit_capacity > 0 && 1 seat).
      // A decor piece becomes a background shape and is never sold.
      if (state.tool === 'draw-table' && state.isDrawing && state.drawingPoints.length >= 2) {
        const pointer = stage.getPointerPosition()
        if (pointer) {
          const piece = resolvePiece(furnitureId)
          const { x, y } = screenToCanvas(pointer)
          const [x1, y1] = state.drawingPoints
          const dragW = Math.abs(x - x1)
          const dragH = Math.abs(y - y1)

          // Below the threshold this was a click, not a drag: centre the piece
          // at its natural size on the point, so one click is genuinely enough.
          const isDrag = dragW > TABLE_MIN_SIZE || dragH > TABLE_MIN_SIZE
          const w = isDrag ? Math.max(dragW, TABLE_MIN_SIZE) : piece.w
          const h = isDrag ? Math.max(dragH, TABLE_MIN_SIZE) : piece.h
          const minX = isDrag ? Math.min(x1, x) : x1 - w / 2
          const minY = isDrag ? Math.min(y1, y) : y1 - h / 2

          if (piece.kind === 'decor') {
            const shape = createDecorShape(piece, minX, minY, { w, h })
            // A stage is NOT decoration. On every save, sync-live reads the
            // stage position and re-derives which row is "front" for
            // best-available seating. Two of them means that answer depends on
            // which one findStage happens to hit first, which is nobody's
            // intent — so placing a stage demotes any previous one. Clearing
            // `role` leaves the old shape on the map, just no longer load
            // bearing.
            if (shape.role === 'stage') {
              for (const existing of state.backgroundShapes) {
                if (existing.role === 'stage') {
                  dispatch({ type: 'UPDATE_SHAPE', id: existing.id, updates: { role: null } })
                }
              }
            }
            dispatchWithHistory({ type: 'ADD_SHAPE', shape })
            dispatch({ type: 'SELECT', ids: [shape.id] })
          } else {
            const newSection = createFurnitureSection(piece, minX, minY, state.sections, { w, h })
            dispatchWithHistory({ type: 'ADD_SECTION', section: newSection })
            dispatch({ type: 'SELECT', ids: [newSection.id] })
          }
          // The tool STAYS armed. A club lays out twenty-five tables in a
          // sitting, and dropping back to Select after each one would double
          // the clicks. The piece just dropped is selected, so the properties
          // panel is live on it either way; Esc or V leaves the tool.
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
    // furnitureId is read in the table-tool branch above. It MUST be a dep:
    // without it the handler closes over the piece that was selected when it
    // was built, and the palette silently stops changing what gets dropped.
    [readOnly, state, dispatch, dispatchWithHistory, screenToCanvas, furnitureId, resolvePiece]
  )

  // ─── Stage Click (polygon + select + seat drop) ──────────────────────
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (readOnly) return
      // Ignore middle-button clicks — those are panning, not selection.
      if ('button' in e.evt && (e.evt as MouseEvent).button === 1) return
      // Tail of a marquee drag — consume it so it can't undo the selection.
      if (suppressClickRef.current) { suppressClickRef.current = false; return }
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
      // Tail of a marquee drag that happened to release over this section.
      if (suppressClickRef.current) { suppressClickRef.current = false; return }
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
      // Tail of a marquee drag that released over a seat — toggling it here
      // would punch a hole in the selection the marquee just made.
      if (suppressClickRef.current) { suppressClickRef.current = false; return }
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

  // Snapping happens DURING the drag, by moving the Konva node itself, so the
  // piece visibly sticks to its neighbour. Snapping only on drop would make the
  // map jump out from under the cursor at the moment of release.
  const handleSectionDragMove = useCallback(
    (sectionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (readOnly || state.tool !== 'select') return
      if (!e.target.hasName('section-group')) return

      const section = state.sections.find((s) => s.id === sectionId)
      if (!section) return

      // Hold Alt to place freely — the escape hatch for the one piece that is
      // deliberately off the line. Snapping is skipped, but the handles must
      // still follow, so this no longer returns early.
      const free = !!(e.evt as unknown as { altKey?: boolean })?.altKey
      const others = state.sections.filter((s) => s.id !== sectionId)

      if (!free && others.length > 0) {
        const snapped = snapDrag(
          section,
          e.target.x(),
          e.target.y(),
          others,
          SNAP_TOLERANCE_PX / Math.max(state.zoom, 0.01),
        )
        e.target.position({ x: snapped.dx, y: snapped.dy })
      }

      // Read the position back AFTER any snap, so the handles land where the
      // section actually went rather than where the cursor is.
      setDragOffset({ id: sectionId, dx: e.target.x(), dy: e.target.y() })
    },
    [readOnly, state.tool, state.sections, state.zoom]
  )

  // ─── Rotate handle ──────────────────────────────────────────────────
  /** Angle of a point about an origin, in degrees. */
  const angleFrom = useCallback((origin: { x: number; y: number }, x: number, y: number) =>
    (Math.atan2(y - origin.y, x - origin.x) * 180) / Math.PI, [])

  const handleRotateStart = useCallback(
    (section: SectionData, e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const stage = stageRef.current
      const pointer = stage?.getPointerPosition()
      if (!pointer) return
      const { x, y } = screenToCanvas(pointer)
      const b = sectionBounds(section)
      const origin = { x: b.cx, y: b.cy }
      rotateDragRef.current = {
        sectionId: section.id,
        original: JSON.parse(JSON.stringify(section)) as SectionData,
        origin,
        startAngle: angleFrom(origin, x, y),
        committed: false,
      }
    },
    [screenToCanvas, angleFrom]
  )

  const handleRotateMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const drag = rotateDragRef.current
      const stage = stageRef.current
      const pointer = stage?.getPointerPosition()
      if (!drag || !pointer) return
      const { x, y } = screenToCanvas(pointer)

      let delta = angleFrom(drag.origin, x, y) - drag.startAngle
      // Shift clicks the turn to 15° steps, for squaring a booth to a wall.
      if ((e.evt as unknown as { shiftKey?: boolean })?.shiftKey) {
        delta = Math.round(delta / 15) * 15
      }

      const rotated = rotateSection(drag.original, delta, drag.origin)
      const updates = {
        polygonPoints: rotated.polygonPoints,
        seats: rotated.seats,
        rows: rotated.rows,
        arcConfig: rotated.arcConfig,
      }
      // One undo entry for the whole gesture: the first frame goes through
      // history while the state is still the pre-drag shape, every frame after
      // it does not. Undo therefore lands back where the drag began, not one
      // mouse-move earlier.
      if (!drag.committed) {
        drag.committed = true
        dispatchWithHistory({ type: 'UPDATE_SECTION', id: drag.sectionId, updates })
      } else {
        dispatch({ type: 'UPDATE_SECTION', id: drag.sectionId, updates })
      }

      // Keep the knob under the cursor's direction rather than wherever Konva's
      // own drag put it.
      const r = Math.hypot(x - drag.origin.x, y - drag.origin.y)
      const a = (angleFrom(drag.origin, x, y) * Math.PI) / 180
      e.target.position({ x: drag.origin.x + Math.cos(a) * r, y: drag.origin.y + Math.sin(a) * r })
    },
    [screenToCanvas, angleFrom, dispatch, dispatchWithHistory]
  )

  const handleRotateEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    rotateDragRef.current = null
  }, [])

  // ─── Rotate handle for a SEAT selection ─────────────────────────────
  /**
   * Where the seat rotate knob hangs, and the point the DRAG measures its
   * angle from.
   *
   * ONE seat is enough. The knob turns which way the chairs face, on the spot,
   * and a single chair has a direction just as much as twenty do. (That is the
   * difference from swinging a block around a pivot, which genuinely needs two
   * — a point has nothing to swing around.)
   *
   * The centre is the selection's centroid, and minY is only where the stalk
   * is anchored; a knob floating inside the selection would be unreachable.
   */
  const seatSelectionPivot = useMemo(() => {
    const ids = new Set(state.selectedSeatIds)
    const pts = state.sections.flatMap((s) => s.seats.filter((seat) => ids.has(seat.id)))
    if (pts.length === 0) return null
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    return { cx, cy, minY: Math.min(...pts.map((p) => p.y)) }
  }, [state.selectedSeatIds, state.sections])

  const handleSeatRotateStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const stage = stageRef.current
      const pointer = stage?.getPointerPosition()
      if (!pointer || !seatSelectionPivot) return
      const { x, y } = screenToCanvas(pointer)
      const ids = new Set(state.selectedSeatIds)
      const origin = { x: seatSelectionPivot.cx, y: seatSelectionPivot.cy }
      // Resolve each seat's CURRENT angle now, derived one included, so the
      // drag has a number to add to. Per section, because what a chair faces
      // belongs to its section.
      const stagePt = stageCenter(state.backgroundShapes)
      const sPoly = stagePolygon(state.backgroundShapes)
      const aud = audienceCenter(state.sections.map((sec) => sec.polygonPoints), sPoly)
      const original: { id: string; facing: number }[] = []
      for (const sec of state.sections) {
        if (!sec.seats.some((seat) => ids.has(seat.id))) continue
        const look = chairTarget(sec.polygonPoints, sec.seats, stagePt, { stagePoly: sPoly, audience: aud })
        for (const seat of sec.seats) {
          if (ids.has(seat.id)) original.push({ id: seat.id, facing: seatFacing(seat, look) })
        }
      }
      seatRotateDragRef.current = {
        original,
        origin,
        startAngle: angleFrom(origin, x, y),
        committed: false,
      }
    },
    [screenToCanvas, angleFrom, seatSelectionPivot, state.selectedSeatIds, state.sections]
  )

  const handleSeatRotateMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const drag = seatRotateDragRef.current
      const stage = stageRef.current
      const pointer = stage?.getPointerPosition()
      if (!drag || !pointer) return
      const { x, y } = screenToCanvas(pointer)

      let delta = angleFrom(drag.origin, x, y) - drag.startAngle
      // Shift clicks the turn to 15° steps, exactly as the section knob does.
      if ((e.evt as unknown as { shiftKey?: boolean })?.shiftKey) {
        delta = Math.round(delta / 15) * 15
      }

      // ORIENTATION, not position. The seats stay exactly where they are and
      // the chairs swing to face a new direction. Each seat's own starting
      // angle is captured in `original`, so a chair that already pointed a
      // different way keeps that difference through the drag instead of every
      // chair snapping to one shared angle.
      const facings = drag.original.map((p) => ({ id: p.id, facing: p.facing + delta }))

      // One undo entry for the whole gesture: the first frame goes through
      // history while the seats are still as the drag began, every frame after
      // it does not.
      if (!drag.committed) {
        drag.committed = true
        dispatchWithHistory({ type: 'SET_SEAT_FACINGS', facings })
      } else {
        dispatch({ type: 'SET_SEAT_FACINGS', facings })
      }

      // Keep the knob on the cursor's bearing rather than wherever Konva's own
      // drag left it.
      const r = Math.hypot(x - drag.origin.x, y - drag.origin.y)
      const a = (angleFrom(drag.origin, x, y) * Math.PI) / 180
      e.target.position({ x: drag.origin.x + Math.cos(a) * r, y: drag.origin.y + Math.sin(a) * r })
    },
    [screenToCanvas, angleFrom, dispatch, dispatchWithHistory]
  )

  const handleSeatRotateEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    seatRotateDragRef.current = null
  }, [])

  /** ±10% nudge. Shares scaleSection with the box handles, so a nudge and a
   *  drag cannot disagree about what resizing a piece means. */
  const handleScaleSection = useCallback((id: string, factor: number) => {
    const section = state.sections.find((s) => s.id === id)
    if (!section) return
    const c = getSectionCenter(section.polygonPoints)
    const scaled = scaleSection(section, factor, factor, c)
    dispatchWithHistory({
      type: 'UPDATE_SECTION',
      id,
      updates: {
        polygonPoints: scaled.polygonPoints,
        seats: scaled.seats,
        arcConfig: scaled.arcConfig,
        rows: scaled.rows,
      },
    })
  }, [state.sections, dispatchWithHistory])

  // ─── Box handles (furniture resize) ─────────────────────────────────
  const handleScaleStart = useCallback(
    (section: SectionData, corner: 'tl' | 'tr' | 'bl' | 'br', e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const b = sectionBounds(section)
      // Scale away from the corner diagonally opposite the one you grabbed, so
      // the two edges you are not touching stay exactly where they are.
      const anchor = {
        x: corner === 'tl' || corner === 'bl' ? b.maxX : b.minX,
        y: corner === 'tl' || corner === 'tr' ? b.maxY : b.minY,
      }
      scaleDragRef.current = {
        sectionId: section.id,
        original: JSON.parse(JSON.stringify(section)) as SectionData,
        anchor,
        startW: b.w,
        startH: b.h,
        committed: false,
      }
    },
    []
  )

  const handleScaleMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const drag = scaleDragRef.current
      const stage = stageRef.current
      const pointer = stage?.getPointerPosition()
      if (!drag || !pointer) return
      const { x, y } = screenToCanvas(pointer)

      // A degenerate piece can never be grown back, so never let an axis reach
      // zero; MIN_SCALE also keeps a stray flick from collapsing a booth.
      const rawSx = drag.startW > 0 ? Math.abs(x - drag.anchor.x) / drag.startW : 1
      const rawSy = drag.startH > 0 ? Math.abs(y - drag.anchor.y) / drag.startH : 1
      let sx = Math.max(MIN_SCALE, rawSx)
      let sy = Math.max(MIN_SCALE, rawSy)
      // Shift keeps the proportions, which is what you want on a booth whose
      // curve would otherwise go oval.
      if ((e.evt as unknown as { shiftKey?: boolean })?.shiftKey) {
        const u = Math.max(sx, sy)
        sx = u; sy = u
      }

      const scaled = scaleSection(drag.original, sx, sy, drag.anchor)
      const updates = {
        polygonPoints: scaled.polygonPoints,
        seats: scaled.seats,
        rows: scaled.rows,
        arcConfig: scaled.arcConfig,
      }
      if (!drag.committed) {
        drag.committed = true
        dispatchWithHistory({ type: 'UPDATE_SECTION', id: drag.sectionId, updates })
      } else {
        dispatch({ type: 'UPDATE_SECTION', id: drag.sectionId, updates })
      }
    },
    [screenToCanvas, dispatch, dispatchWithHistory]
  )

  const handleScaleEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    scaleDragRef.current = null
  }, [])

  const handleSectionDragEnd = useCallback(
    (sectionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      // Cleared FIRST, before any guard below can return early. A drag that
      // ends through one of those — tool switched mid-drag, released over
      // something unexpected — would otherwise leave the borrowed offset set,
      // and the handles would sit one drag's distance from the piece for good.
      setDragOffset(null)
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
        updates: {
          polygonPoints: newPoints, seats: newSeats, arcConfig: newArcConfig,
          rows: transformRows(section.rows, (p) => ({ x: p.x + dx, y: p.y + dy })),
        },
      })
    },
    [readOnly, state.tool, state.sections, dispatchWithHistory]
  )

  // ─── Export ──────────────────────────────────────────────────────────
  const handleExport = useCallback((opts?: { auto?: boolean }) => {
    const data: CanvasData = {
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      backgroundShapes: state.backgroundShapes,
      sections: state.sections,
      seatRadius: state.seatRadius,
      seatShape: state.seatShape,
    }
    onSave?.(data, opts?.auto ? { auto: true } : undefined)
    setDirty(false)
  }, [state, onSave])

  // Autosave: a draft is safe to write often, so unsaved work never outlives a
  // closed tab. Timer restarts on every edit; fires once things go quiet.
  useEffect(() => {
    if (!autosaveMs || !dirty || readOnly) return
    const t = setTimeout(() => handleExport({ auto: true }), autosaveMs)
    return () => clearTimeout(t)
  }, [autosaveMs, dirty, readOnly, handleExport])

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
        /**
         * The floor plan goes to Storage and ONLY to Storage.
         *
         * There used to be a FileReader fallback here that turned the file into
         * a base64 data URL whenever the upload returned null. That looked like
         * resilience and behaved like a trap: the image went into the
         * canvas_data JSONB column instead, so a single floor plan became
         * megabytes of base64 inside a database row -- copied again into
         * seat_map_versions on every publish, and dragged over the wire on every
         * poll of the buyer's picker. Prod still carries 33 embedded copies of
         * 4 images, ~32MB, from that path. Worst of all it was silent: the
         * upload had failed, and the organizer was told it worked.
         *
         * So a failed upload is now a failed upload, said out loud.
         */
        if (!onUploadImageFile) {
          throw new Error('Image uploads are not available in this view.')
        }

        // Shrink first: a phone photo or an architect's export can be 4000px+,
        // and the editor only ever draws it fitted to a 1400x900 canvas.
        const prepared = await downscaleImage(file, { maxEdge: 2400 })
        const imageUrl = await onUploadImageFile(prepared)
        if (!imageUrl) {
          throw new Error('The upload did not complete.')
        }

        // Measure natural size so we can fit the image to the canvas
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new window.Image()
          image.crossOrigin = 'anonymous'
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = imageUrl
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
        toast({
          title: "Couldn't add the floor plan",
          description: `${err instanceof Error ? err.message : 'Unknown error'} Check your connection and try again — nothing else on the map has changed.`,
          variant: 'destructive',
        })
      } finally {
        setUploadingImage(false)
      }
    },
    [dispatchWithHistory, state.canvasWidth, state.canvasHeight, onUploadImageFile, toast]
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

  /**
   * The offset every handle adds while its section is being dragged.
   *
   * Zero in every other case, including while a DIFFERENT section is dragged,
   * so a stale offset can never shift the handles of a piece that is standing
   * still.
   */
  const [handleDX, handleDY] = useMemo<[number, number]>(() => {
    if (!dragOffset || !selectedSection || dragOffset.id !== selectedSection.id) return [0, 0]
    return [dragOffset.dx, dragOffset.dy]
  }, [dragOffset, selectedSection])

  // ─── Tier colors ────────────────────────────────────────────────────
  const tierColorMap = useMemo(
    () => new Map(tiers.map((t) => [t.id, t.color])),
    [tiers]
  )

  // Where the chairs look. Computed once per shape change rather than per seat,
  // because a map can carry thousands of seats and the answer is the same for
  // all of them. Null when the map has no stage — then every chair faces up.
  const stagePoint = useMemo(
    () => stageCenter(state.backgroundShapes),
    [state.backgroundShapes]
  )

  // Where the ROOM is, for a section standing ON the stage — a choir, an
  // orchestra, on-stage VIP. Measured from section OUTLINES rather than seats
  // so the builder matches the buyer's picker, which only ever has outlines
  // for the sections it has not opened yet.
  const onStageCtx = useMemo(() => {
    const stagePoly = stagePolygon(state.backgroundShapes)
    return {
      stagePoly,
      audience: audienceCenter(state.sections.map((x) => x.polygonPoints), stagePoly),
    }
  }, [state.backgroundShapes, state.sections])

  // ─── Live drawing preview ───────────────────────────────────────────
  const rectPreview = useMemo(() => {
    if ((state.tool !== 'draw-rect' && state.tool !== 'draw-table' && state.tool !== 'select') || !state.isDrawing || !mousePos) return null
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
      case 'draw-table':
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
    if (state.tool === 'draw-table') {
      const piece = resolvePiece(furnitureId)
      if (state.isDrawing) return `Release to place ${piece.name}`
      return piece.kind === 'decor'
        ? `${piece.name} • click to place • drag to size • not sold`
        : `${piece.name} • click to place • drag to size • admits ${piece.pax}, set its price category in the panel`
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
    // furnitureId: the hint names the armed piece, so it must recompute when the
    // palette changes. selectedSeatIds was already read above but missing here,
    // which left the multi-select hint stale.
  }, [state.tool, state.drawingPoints, state.isDrawing, state.selectedIds, state.selectedSeatId, state.selectedSeatIds, state.dropRow, state.dropSeatNumber, furnitureId, resolvePiece])

  return (
    <div className={`flex flex-col bg-slate-950 overflow-hidden border border-slate-800 ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : 'h-full w-full rounded-xl'}`}>
      {/* Contextual bar. Fixed zones, so what you can do with the selected piece
          is always in the same place, instead of somewhere in a column that
          rebuilt itself the moment you clicked. */}
      {!readOnly && (
        <ContextBar
          selectedSection={selectedSection ?? null}
          selectedSections={selectedSections}
          selectedShape={selectedShape ?? null}
          tiers={tiers}
          onUpdateSection={(id, updates) => dispatchWithHistory({ type: 'UPDATE_SECTION', id, updates })}
          onUpdateShape={(id, updates) => dispatchWithHistory({ type: 'UPDATE_SHAPE', id, updates })}
          onRotateSections={(ids, degrees) => dispatchWithHistory({ type: 'ROTATE_SECTIONS', ids, degrees })}
          selectedSeatIds={state.selectedSeatIds}
          onRotateSeats={(seatIds, degrees) => dispatchWithHistory({ type: 'ROTATE_SEATS', seatIds, degrees })}
          onAlignSections={(ids, mode) => dispatchWithHistory({ type: 'ALIGN_SECTIONS', ids, mode })}
          onDuplicateSection={(id, mirror) => dispatchWithHistory({ type: 'DUPLICATE_SECTION', id, mirror })}
          onScaleSection={handleScaleSection}
          onDeleteSection={(id) => dispatchWithHistory({ type: 'DELETE_SECTION', id })}
          onDeleteSections={(ids) => dispatchWithHistory({ type: 'DELETE_SECTIONS', ids })}
          onDeleteShape={(id) => dispatchWithHistory({ type: 'DELETE_SHAPE', id })}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
        />
      )}

      <div className="flex flex-1 min-h-0">
      {/* Left Toolbar */}
      {!readOnly && (
        <CanvasToolbar
          activeTool={state.tool}
          onToolChange={(tool) => dispatch({ type: 'SET_TOOL', tool })}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          dirty={dirty}
          onSave={() => handleExport()}
          zoom={state.zoom}
          onZoomChange={handleToolbarZoom}
          onUploadImage={handleUploadClick}
          furnitureId={furnitureId}
          savedPieces={savedPieces}
          onDeleteSavedPiece={handleDeleteSavedPiece}
          onPickFurniture={(id) => {
            // Choosing a piece IS choosing the tool. The sofa tool used to be a
            // mode you had to find before any furniture appeared at all.
            setFurnitureId(id)
            dispatch({ type: 'SET_TOOL', tool: 'draw-table' })
          }}
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
                onDragMove={(e) => handleSectionDragMove(section.id, e)}
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
                stagePoint={stagePoint}
                onStageCtx={onStageCtx}
                tierColorMap={tierColorMap}
                selectedRowId={state.selectedRowId}
                rowLabelsEditable={!readOnly && state.tool === 'select'}
                onRowLabelClick={(rowId) => {
                  if (!state.selectedIds.includes(section.id)) dispatch({ type: 'SELECT', ids: [section.id] })
                  dispatch({ type: 'SELECT_ROW', rowId })
                }}
                onRowLabelDragEnd={(rowId, end, dx, dy) => {
                  dispatchWithHistory({ type: 'MOVE_ROW_LABEL', sectionId: section.id, rowId, end, dx, dy })
                }}
              />
            ))}
            {/* Row editing handles for the selected row: the path itself, both
                ends (drag to move/stretch) and a curve handle at the middle
                (drag to bend). Follows the cursor live, like the vertex handles,
                off a baseline captured when the drag began. */}
            {!readOnly && state.tool === 'select' && selectedSection && state.selectedRowId && (() => {
              const row = selectedSection.rows?.find((r) => r.id === state.selectedRowId)
              if (!row) return null
              const samples = Array.from({ length: 25 }, (_, i) => pointOnPath(row.path, i / 24))
              const start = samples[0], end = samples[24], mid = samples[12]
              const hr = 7 / state.zoom
              const isLine = row.path.kind === 'line'
              const beginDrag = () => {
                rowDragRef.current = {
                  rowId: row.id,
                  s0: { x: start.x, y: start.y },
                  e0: { x: end.x, y: end.y },
                  m0: { x: mid.x, y: mid.y },
                  committed: false,
                }
              }
              const commit = (kind: 'start' | 'end' | 'curve', x: number, y: number) => {
                // Fall back to the live points if a drag somehow started without
                // us (a synthetic event, a lost mousedown) rather than no-op.
                const base = rowDragRef.current?.rowId === row.id
                  ? rowDragRef.current
                  : { s0: { x: start.x, y: start.y }, e0: { x: end.x, y: end.y }, m0: { x: mid.x, y: mid.y }, committed: false }
                const { s0, e0, m0 } = base
                const path = kind === 'curve'
                  ? arcThrough(s0, { x, y }, e0)
                  : kind === 'start'
                    ? (isLine ? { kind: 'line' as const, x1: x, y1: y, x2: e0.x, y2: e0.y } : arcThrough({ x, y }, m0, e0))
                    : (isLine ? { kind: 'line' as const, x1: s0.x, y1: s0.y, x2: x, y2: y } : arcThrough(s0, m0, { x, y }))
                const payload = { type: 'UPDATE_ROW' as const, sectionId: selectedSection.id, rowId: row.id, updates: { path } }
                // One undo entry per gesture, taken on the first frame while the
                // row is still the one you grabbed.
                if (rowDragRef.current && !rowDragRef.current.committed) {
                  rowDragRef.current.committed = true
                  dispatchWithHistory(payload)
                } else if (rowDragRef.current) {
                  dispatch(payload)
                } else {
                  dispatchWithHistory(payload)
                }
              }
              return (
                <Group key={`row-handles-${row.id}`}>
                  <Line
                    points={samples.flatMap((p) => [p.x, p.y])}
                    stroke="#818cf8"
                    strokeWidth={1.5 / state.zoom}
                    dash={[6 / state.zoom, 4 / state.zoom]}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                  {([['start', start], ['end', end], ['curve', mid]] as const).map(([kind, p]) => (
                    <Circle
                      key={kind}
                      x={p.x}
                      y={p.y}
                      radius={hr}
                      fill={kind === 'curve' ? '#f59e0b' : '#ffffff'}
                      stroke="#4f46e5"
                      strokeWidth={2 / state.zoom}
                      draggable
                      onDragStart={(e) => { e.cancelBubble = true; beginDrag() }}
                      // Live, so the row redraws under the handle instead of
                      // snapping into place once you let go.
                      onDragMove={(e) => { e.cancelBubble = true; commit(kind, e.target.x(), e.target.y()) }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true
                        commit(kind, e.target.x(), e.target.y())
                        rowDragRef.current = null
                      }}
                      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = kind === 'curve' ? 'ns-resize' : 'move' }}
                      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = '' }}
                      perfectDrawEnabled={false}
                    />
                  ))}
                </Group>
              )
            })()}
            {/* Live offset borrowed from the group being dragged. Zero unless
                this exact section is mid-drag, so nothing else is affected. */}
            {/* Vertex handles — reshape the selected section by dragging its
                corners. Rendered AFTER sections so they sit on top and win the
                hit test. The outline follows the handle live; the undo entry is
                taken on the first frame, while the shape is still the pre-drag
                one, so one reshape is one undo step. */}
            {!readOnly && state.tool === 'select' && selectedSection && !selectedSection.locked && state.selectedSeatIds.length === 0 &&
              // Furniture hides its vertices unless you ask for them. A booth is
              // a fixed shape; a hand-drawn section is not, and reshaping those
              // corner by corner is the whole point, so they always show.
              ((selectedSection.unitCapacity ?? 0) === 0 || editPoints) &&
              Array.from({ length: selectedSection.polygonPoints.length / 2 }).map((_, i) => (
                <Circle
                  // Key must NOT contain the point's coordinates. It used to,
                  // which was harmless while the shape only changed on release —
                  // but now that the outline follows the drag, a coordinate in
                  // the key changes on every frame, React remounts the handle
                  // mid-gesture, and the drag dies under the cursor.
                  key={`vertex-${selectedSection.id}-${i}`}
                  x={selectedSection.polygonPoints[i * 2] + handleDX}
                  y={selectedSection.polygonPoints[i * 2 + 1] + handleDY}
                  radius={6 / state.zoom}
                  fill="#ffffff"
                  stroke="#6366f1"
                  strokeWidth={2 / state.zoom}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    vertexDragCommittedRef.current = false
                  }}
                  onDragMove={(e) => {
                    // The whole point of this handler: redraw the edge WITH the
                    // handle. Without it Konva moves the dot and the outline sits
                    // still until release, so the corner visibly lags the cursor.
                    e.cancelBubble = true
                    const pts = [...selectedSection.polygonPoints]
                    pts[i * 2] = e.target.x() - handleDX
                    pts[i * 2 + 1] = e.target.y() - handleDY
                    const updates = { polygonPoints: pts }
                    // First frame carries the undo entry, while the shape is
                    // still the pre-drag one; the rest must not, or a single
                    // reshape would leave one undo step per mouse-move.
                    if (!vertexDragCommittedRef.current) {
                      vertexDragCommittedRef.current = true
                      dispatchWithHistory({ type: 'UPDATE_SECTION', id: selectedSection.id, updates })
                    } else {
                      dispatch({ type: 'UPDATE_SECTION', id: selectedSection.id, updates })
                    }
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                    const pts = [...selectedSection.polygonPoints]
                    pts[i * 2] = e.target.x() - handleDX
                    pts[i * 2 + 1] = e.target.y() - handleDY
                    const updates = { polygonPoints: pts }
                    // A click with no movement fires start+end and no move at
                    // all, so this still has to be able to take the undo entry.
                    if (!vertexDragCommittedRef.current) {
                      vertexDragCommittedRef.current = true
                      dispatchWithHistory({ type: 'UPDATE_SECTION', id: selectedSection.id, updates })
                    } else {
                      dispatch({ type: 'UPDATE_SECTION', id: selectedSection.id, updates })
                    }
                  }}
                  onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'move' }}
                  onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = '' }}
                  perfectDrawEnabled={false}
                />
              ))}

            {/* Box handles — resize a furniture piece by dragging a corner.
                Furniture hides its vertices (a curved booth has dozens), which
                left it with no way to be resized by hand at all; these are the
                replacement. Hand-drawn sections keep their vertex handles and
                do not get these, so no section ever shows both. */}
            {!readOnly && state.tool === 'select' && selectedSection && !selectedSection.locked &&
              state.selectedSeatIds.length === 0 && (selectedSection.unitCapacity ?? 0) > 0 && !editPoints && (() => {
                const raw = sectionBounds(selectedSection)
                const b = {
                  minX: raw.minX + handleDX, maxX: raw.maxX + handleDX,
                  minY: raw.minY + handleDY, maxY: raw.maxY + handleDY,
                  cx: raw.cx + handleDX, cy: raw.cy + handleDY,
                }
                const hs = 6 / state.zoom
                const corners: { key: 'tl' | 'tr' | 'bl' | 'br'; x: number; y: number; cursor: string }[] = [
                  { key: 'tl', x: b.minX, y: b.minY, cursor: 'nwse-resize' },
                  { key: 'tr', x: b.maxX, y: b.minY, cursor: 'nesw-resize' },
                  { key: 'bl', x: b.minX, y: b.maxY, cursor: 'nesw-resize' },
                  { key: 'br', x: b.maxX, y: b.maxY, cursor: 'nwse-resize' },
                ]
                return (
                  <Group key={`box-${selectedSection.id}`}>
                    <Line
                      points={[b.minX, b.minY, b.maxX, b.minY, b.maxX, b.maxY, b.minX, b.maxY]}
                      closed
                      stroke="#6366f1"
                      strokeWidth={1 / state.zoom}
                      dash={[5 / state.zoom, 4 / state.zoom]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    {corners.map((c) => (
                      <Rect
                        key={c.key}
                        x={c.x - hs}
                        y={c.y - hs}
                        width={hs * 2}
                        height={hs * 2}
                        fill="#ffffff"
                        stroke="#6366f1"
                        strokeWidth={2 / state.zoom}
                        draggable
                        onDragStart={(e) => handleScaleStart(selectedSection, c.key, e)}
                        onDragMove={handleScaleMove}
                        onDragEnd={handleScaleEnd}
                        onMouseEnter={(e) => { const el = e.target.getStage()?.container(); if (el) el.style.cursor = c.cursor }}
                        onMouseLeave={(e) => { const el = e.target.getStage()?.container(); if (el) el.style.cursor = '' }}
                        perfectDrawEnabled={false}
                      />
                    ))}
                  </Group>
                )
              })()}

            {/* Rotate handle — one knob on a stalk above the selection. Drag to
                spin the piece about its centre; hold Shift for 15° steps. */}
            {!readOnly && state.tool === 'select' && selectedSection && !selectedSection.locked &&
              state.selectedSeatIds.length === 0 && (() => {
                const raw = sectionBounds(selectedSection)
                const b = { cx: raw.cx + handleDX, minY: raw.minY + handleDY }
                const gap = 30 / state.zoom
                const hx = b.cx
                const hy = b.minY - gap
                return (
                  <Group key={`rot-${selectedSection.id}`}>
                    <Line
                      points={[b.cx, b.minY, hx, hy]}
                      stroke="#6366f1"
                      strokeWidth={1.5 / state.zoom}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Circle
                      x={hx}
                      y={hy}
                      radius={7 / state.zoom}
                      fill="#6366f1"
                      stroke="#ffffff"
                      strokeWidth={2 / state.zoom}
                      draggable
                      onDragStart={(e) => handleRotateStart(selectedSection, e)}
                      onDragMove={handleRotateMove}
                      onDragEnd={handleRotateEnd}
                      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab' }}
                      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = '' }}
                      perfectDrawEnabled={false}
                    />
                  </Group>
                )
              })()}

            {/* Rotate handle for a SEAT selection. Amber, like the seat
                highlight, so it is obvious this turns the seats and not the
                section they sit in. Shown only at two or more seats: one seat
                is a point and has nothing to turn. The section knob above is
                hidden whenever any seat is selected, so the two never collide. */}
            {!readOnly && state.tool === 'select' && seatSelectionPivot && (() => {
              const gap = 30 / state.zoom
              const hx = seatSelectionPivot.cx
              const hy = seatSelectionPivot.minY - gap
              return (
                <Group key="rot-seats">
                  <Line
                    points={[seatSelectionPivot.cx, seatSelectionPivot.minY, hx, hy]}
                    stroke="#f59e0b"
                    strokeWidth={1.5 / state.zoom}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                  {/* The pivot, drawn so the organizer can see what it turns
                      about before they commit to a drag. */}
                  <Circle
                    x={seatSelectionPivot.cx}
                    y={seatSelectionPivot.cy}
                    radius={2.5 / state.zoom}
                    fill="#f59e0b"
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                  <Circle
                    x={hx}
                    y={hy}
                    radius={7 / state.zoom}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={2 / state.zoom}
                    draggable
                    onDragStart={handleSeatRotateStart}
                    onDragMove={handleSeatRotateMove}
                    onDragEnd={handleSeatRotateEnd}
                    onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab' }}
                    onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = '' }}
                    perfectDrawEnabled={false}
                  />
                </Group>
              )
            })()}
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

        {/* No zoom readout here. The sidebar's zoom control shows the same
            number a few pixels away and clicking it resets to 100%, so this
            badge was a second copy that could not be used. */}

        {/* Full-screen / large-screen toggle */}
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 backdrop-blur-xs text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? 'Exit' : 'Full screen'}
        </button>

        {/* Image upload progress */}
        {uploadingImage && (
          <div className="absolute top-16 right-4 bg-slate-800/90 backdrop-blur-xs text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none">
            Uploading image…
          </div>
        )}

        {/* Tool hint bar */}
        {toolHint && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-xs text-white text-sm px-4 py-2 rounded-lg border border-slate-700 select-none whitespace-nowrap pointer-events-none">
            {toolHint}
          </div>
        )}

        {/* Section count badge */}
        <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur-xs text-slate-400 text-xs px-3 py-1.5 rounded-lg border border-slate-700 select-none">
          {state.sections.length} sections •{' '}
          {state.sections.reduce((sum, s) => sum + s.seats.length, 0)} seats
        </div>
      </div>

      {/* Right Properties Panel — on demand, via Details in the bar */}
      {!readOnly && panelOpen && (
        <CanvasProperties
          selectedRowId={state.selectedRowId}
          onSelectRow2={(rowId) => dispatch({ type: 'SELECT_ROW', rowId })}
          onUpdateRow={(sectionId, rowId, updates, relayout) => dispatchWithHistory({ type: 'UPDATE_ROW', sectionId, rowId, updates, relayout })}
          onDeleteRow={(sectionId, rowId) => dispatchWithHistory({ type: 'DELETE_ROW', sectionId, rowId })}
          selectedSection={seatParentSection || selectedSection || null}
          selectedSections={seatParentSection ? [] : selectedSections}
          selectedShape={selectedShape}
          sections={state.sections}
          tool={state.tool}
          tiers={tiers}
          onCreateTier={onCreateTier}
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
            if (filterDeletableSections([id]).length === 0) return
            dispatchWithHistory({ type: 'DELETE_SECTION', id })
            dispatch({ type: 'DESELECT_ALL' })
          }}
          onDeleteSections={(ids) => {
            const ok = filterDeletableSections(ids)
            if (ok.length === 0) return
            dispatchWithHistory({ type: 'DELETE_SECTIONS', ids: ok })
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
            const seat = state.sections.find((s) => s.id === sectionId)?.seats.find((s) => s.id === seatId)
            if (seat?.status === 'booked') {
              window.alert(`${seat.label} is sold — sold seats can't be deleted.`)
              return
            }
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
            const bookedIds = new Set(
              state.sections.flatMap((s) => s.seats.filter((seat) => seat.status === 'booked').map((seat) => seat.id))
            )
            const deletable = state.selectedSeatIds.filter((id) => !bookedIds.has(id))
            if (deletable.length < state.selectedSeatIds.length) {
              window.alert(`${state.selectedSeatIds.length - deletable.length} sold seat(s) were skipped — sold seats can't be deleted.`)
            }
            if (deletable.length > 0) dispatchWithHistory({ type: 'DELETE_SEATS', seatIds: deletable })
          }}
          onSetSeatStatus={(seatIds, status) => {
            dispatchWithHistory({ type: 'SET_SEAT_STATUS', seatIds, status })
          }}
          onScaleSeats={(seatIds, factor) => {
            dispatchWithHistory({ type: 'SCALE_SEATS', seatIds, factor })
          }}
          onRotateSeats={(seatIds, degrees) => {
            dispatchWithHistory({ type: 'ROTATE_SEATS', seatIds, degrees })
          }}
          onResetSeatFacing={(seatIds) => {
            dispatchWithHistory({ type: 'SET_SEAT_FACING', seatIds, facing: null })
          }}
          onSaveAsPiece={handleSaveAsPiece}
          onDuplicateSection={(id, mirror) => {
            dispatchWithHistory({ type: 'DUPLICATE_SECTION', id, mirror })
          }}
          editPoints={editPoints}
          onToggleEditPoints={() => setEditPoints((v) => !v)}
          onRotateSections={(ids, degrees) => {
            dispatchWithHistory({ type: 'ROTATE_SECTIONS', ids, degrees })
          }}
          onAlignSections={(ids, mode) => {
            dispatchWithHistory({ type: 'ALIGN_SECTIONS', ids, mode })
          }}
          onScaleSection={handleScaleSection}
          seatRadius={state.seatRadius}
          seatShape={state.seatShape}
          onSetSeatRadius={(r) => dispatch({ type: 'SET_SEAT_RADIUS', radius: r })}
          onSetSeatShape={(s) => dispatch({ type: 'SET_SEAT_SHAPE', shape: s })}
        />
      )}
      </div>
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

/** Below this, a table-tool drag is treated as a click. Also the floor on a drag. */
const TABLE_MIN_SIZE = 24

/** How close, in SCREEN pixels, a piece must come before it snaps to another. */
const SNAP_TOLERANCE_PX = 7

/** Floor on a box-handle drag. A piece scaled to 0 has no size left to grab. */
const MIN_SCALE = 0.05

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

