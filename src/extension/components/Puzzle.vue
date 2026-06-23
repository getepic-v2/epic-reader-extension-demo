<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import type { DrawerStore } from '../composables/useDrawerStore'

/**
 * Canvas-based jigsaw puzzle. Ported 1:1 from EpicWeb DrawerPuzzleComponent.
 *
 * The source used Canvas 2D to slice an image into pieces whose edges have
 * interlocking "chips" (concave/convex arcs), then pointer-drag pieces onto a
 * board grid with snap-to-cell placement. The Angular component also tracked 6
 * timers + a rAF loop; the onBeforeUnmount below mirrors ngOnDestroy's cleanup
 * exactly so none of those leak.
 *
 * Angular → Vue translation: @Input → defineProps; ngOnChanges → watch(content);
 * ngAfterViewInit → onMounted schedule; ViewChild → ref; Renderer2/DOM → plain
 * canvas API; DrawerService → props.store.updateCloseMetrics.
 */

interface Chip {
  direction: 'top' | 'bottom' | 'left' | 'right'
  type: 'in' | 'out'
}

interface GridCell {
  id: number
  row: number
  col: number
  normalizedX: number
  normalizedY: number
  chip: Chip[]
  occupied: boolean
  occupiedPieceId: number | null
}

interface PuzzlePiece {
  id: number
  imageX: number
  imageY: number
  normalizedX: number
  normalizedY: number
  homeNormalizedX: number
  homeNormalizedY: number
  chip: Chip[]
  placed: boolean
  placedCellId: number | null
  correctCellId: number
  dragging: boolean
}

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const ROWS = 3
const COLS = 3
const PREFERRED_GAP = 24
const PREFERRED_MARGIN = 24
const FALLBACK_GAP = 12
const FALLBACK_MARGIN = 24
const PREFERRED_RATIO = 0.7
const COMPLETION_ANIMATION_MS = 500

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// --- reactive view state ---
const imageLoaded = ref(false)
const showOriginalImage = ref(true)
const previewCountdown = ref(5)
const isComplete = ref(false)
const showCompleteMessage = ref(false)
const completeTitleStyle = ref<Record<string, string> | null>(null)
const completeActionStyle = ref<Record<string, string> | null>(null)

// --- non-reactive puzzle state (mutated inside the rAF draw loop) ---
let pieces: PuzzlePiece[] = []
let gridCells: GridCell[] = []
let draggingPiece: PuzzlePiece | null = null
let snapCell: GridCell | null = null
let startPosition: { x: number; y: number } | null = null
let tempPosition: { x: number; y: number } | null = null
let dragOffset = { x: 0, y: 0 }

// --- timers / raf (all cleared in onBeforeUnmount) ---
let hideOriginalTimer: number | undefined
let countdownTimer: number | undefined
let measureTimer: number | undefined
let animationFrameId: number | undefined
let completionTimer: number | undefined
let replayResetTimer: number | undefined

let imageRef: HTMLImageElement | null = null
let boundMoveHandler: ((e: Event) => void) | undefined
let boundUpHandler: ((e: Event) => void) | undefined

const puzzleSize = {
  canvasSize: { width: 0, height: 0 },
  boardSize: { width: 0, height: 0 },
}

let openedAt = 0
let successCount = 0
let replayCount = 0

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function getLayout() {
  const { canvasSize, boardSize } = puzzleSize
  const pieceW = boardSize.width / COLS
  const pieceH = boardSize.height / ROWS
  const gridRows = 3
  const gridCols = 3
  const tryLayout = (gap: number, gridMargin: number) => {
    const gridWidth = gridCols * pieceW + (gridCols - 1) * gap
    const gridHeight = gridRows * pieceH + (gridRows - 1) * gap
    const totalHeight = gridHeight + gridMargin + boardSize.height
    const totalStartY = (canvasSize.height - totalHeight) / 2
    return { gap, gridMargin, gridWidth, gridHeight, totalStartY }
  }

  let layout = tryLayout(PREFERRED_GAP, PREFERRED_MARGIN)
  if (layout.totalStartY < 0) {
    layout = tryLayout(FALLBACK_GAP, FALLBACK_MARGIN)
  }
  const totalStartY = Math.max(0, layout.totalStartY)
  const gridStartX = (canvasSize.width - layout.gridWidth) / 2
  const gridStartY = totalStartY
  const boardStartX = canvasSize.width / 2 - boardSize.width / 2
  const boardStartY = totalStartY + layout.gridHeight + layout.gridMargin
  return {
    pieceW,
    pieceH,
    gridStartX,
    gridStartY,
    boardStartX,
    boardStartY,
    gap: layout.gap,
  }
}

function calculateGridCells(): GridCell[] {
  const { boardStartX, boardStartY, pieceW, pieceH } = getLayout()
  const cells: GridCell[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const pixelX = boardStartX + col * pieceW
      const pixelY = boardStartY + row * pieceH
      const normalizedX = pixelX / puzzleSize.canvasSize.width
      const normalizedY = pixelY / puzzleSize.canvasSize.height
      cells.push({
        id: row * COLS + col,
        row,
        col,
        normalizedX,
        normalizedY,
        chip: [],
        occupied: false,
        occupiedPieceId: null,
      })
    }
  }
  return cells
}

function calculateGridCellsWithChips(): GridCell[] {
  const cells = calculateGridCells()
  const cellMap = new Map<number, GridCell>()
  cells.forEach((cell) => {
    cellMap.set(cell.id, { ...cell })
  })

  const getNeighbor = (
    row: number,
    col: number,
    direction: Chip['direction'],
  ): GridCell | null => {
    let nextRow = row
    let nextCol = col
    switch (direction) {
      case 'top':
        nextRow = row - 1
        break
      case 'bottom':
        nextRow = row + 1
        break
      case 'left':
        nextCol = col - 1
        break
      case 'right':
        nextCol = col + 1
        break
    }
    if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) {
      return null
    }
    return cellMap.get(nextRow * COLS + nextCol) || null
  }

  const oppositeDirection = (direction: Chip['direction']): Chip['direction'] => {
    switch (direction) {
      case 'top':
        return 'bottom'
      case 'bottom':
        return 'top'
      case 'left':
        return 'right'
      case 'right':
        return 'left'
    }
  }

  const getNeighborChipType = (
    neighbor: GridCell,
    direction: Chip['direction'],
  ): Chip['type'] | null => {
    const opposite = oppositeDirection(direction)
    const chip = neighbor.chip.find((c) => c.direction === opposite)
    return chip ? chip.type : null
  }

  const directionOrder: Chip['direction'][] = ['top', 'right', 'bottom', 'left']
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = cellMap.get(row * COLS + col)
      if (!cell) continue
      const chips: Chip[] = []
      directionOrder.forEach((direction, directionIndex) => {
        const neighbor = getNeighbor(row, col, direction)
        if (!neighbor) return
        const neighborType = getNeighborChipType(neighbor, direction)
        if (neighborType) {
          chips.push({
            direction,
            type: neighborType === 'in' ? 'out' : 'in',
          })
          return
        }
        const pattern = (row + col + directionIndex) % 2 === 0 ? 'out' : 'in'
        chips.push({ direction, type: pattern })
      })
      cellMap.set(cell.id, { ...cell, chip: chips })
    }
  }

  return Array.from(cellMap.values())
}

function calculatePuzzlePieces(cells: GridCell[]): PuzzlePiece[] {
  if (!imageRef) return []
  const result: PuzzlePiece[] = []
  const imagePieceWidth = imageRef.width / COLS
  const imagePieceHeight = imageRef.height / ROWS
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cellId = row * COLS + col
      const correctCell = cells.find((cell) => cell.id === cellId) || null
      result.push({
        id: cellId,
        imageX: col * imagePieceWidth,
        imageY: row * imagePieceHeight,
        normalizedX: 0,
        normalizedY: 0,
        homeNormalizedX: 0,
        homeNormalizedY: 0,
        chip: correctCell?.chip || [],
        placed: false,
        placedCellId: null,
        correctCellId: cellId,
        dragging: false,
      })
    }
  }
  return result
}

function shufflePieces(toShuffle: PuzzlePiece[]): PuzzlePiece[] {
  const shuffled = [...toShuffle]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = temp
  }

  const { gridStartX, gridStartY, pieceW, pieceH, gap } = getLayout()
  const gridCols = 3
  return shuffled.map((piece, index) => {
    const row = Math.floor(index / gridCols)
    const col = index % gridCols
    const pixelX = gridStartX + col * (pieceW + gap)
    const pixelY = gridStartY + row * (pieceH + gap)
    const normalizedX = pixelX / puzzleSize.canvasSize.width
    const normalizedY = pixelY / puzzleSize.canvasSize.height
    return {
      ...piece,
      normalizedX,
      normalizedY,
      homeNormalizedX: normalizedX,
      homeNormalizedY: normalizedY,
    }
  })
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

function drawChipPath(
  ctx: CanvasRenderingContext2D,
  chips: Chip[],
  x: number,
  y: number,
  pieceW: number,
  pieceH: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  const directions: Array<'top' | 'right' | 'bottom' | 'left'> = [
    'top',
    'right',
    'bottom',
    'left',
  ]
  directions.forEach((direction) => {
    const chip = chips.find((c) => c.direction === direction)
    if (direction === 'top') {
      if (chip) {
        const centerX = x + pieceW / 2
        const centerY = y
        ctx.lineTo(centerX - radius, y)
        ctx.arc(centerX, centerY, radius, Math.PI, 0, chip.type === 'out' ? false : true)
        ctx.lineTo(x + pieceW, y)
      } else {
        ctx.lineTo(x + pieceW, y)
      }
    } else if (direction === 'right') {
      if (chip) {
        const centerX = x + pieceW
        const centerY = y + pieceH / 2
        ctx.lineTo(x + pieceW, centerY - radius)
        ctx.arc(
          centerX,
          centerY,
          radius,
          -Math.PI / 2,
          Math.PI / 2,
          chip.type === 'out' ? false : true,
        )
        ctx.lineTo(x + pieceW, y + pieceH)
      } else {
        ctx.lineTo(x + pieceW, y + pieceH)
      }
    } else if (direction === 'bottom') {
      if (chip) {
        const centerX = x + pieceW / 2
        const centerY = y + pieceH
        ctx.lineTo(x + pieceW, centerY)
        ctx.arc(centerX, centerY, radius, 0, Math.PI, chip.type === 'out' ? false : true)
        ctx.lineTo(x, y + pieceH)
      } else {
        ctx.lineTo(x, y + pieceH)
      }
    } else if (direction === 'left') {
      if (chip) {
        const centerX = x
        const centerY = y + pieceH / 2
        ctx.lineTo(x, centerY + radius)
        ctx.arc(
          centerX,
          centerY,
          radius,
          Math.PI / 2,
          -Math.PI / 2,
          chip.type === 'out' ? false : true,
        )
        ctx.lineTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
  })
  ctx.closePath()
}

function drawPiecePath(
  ctx: CanvasRenderingContext2D,
  piece: PuzzlePiece,
  x: number,
  y: number,
  pieceW: number,
  pieceH: number,
  radius: number,
): void {
  drawChipPath(ctx, piece.chip, x, y, pieceW, pieceH, radius)
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: PuzzlePiece,
  x: number,
  y: number,
  isDragging = false,
): void {
  if (!imageRef) return
  const { pieceW, pieceH } = getLayout()
  const radius = Math.min(pieceW, pieceH) / 6
  ctx.save()
  if (isDragging) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 4
    ctx.shadowOffsetY = 4
  }
  drawPiecePath(ctx, piece, x, y, pieceW, pieceH, radius)
  ctx.clip()
  const expandSize = radius
  const sourceWidth = imageRef.width / COLS
  const sourceHeight = imageRef.height / ROWS
  const sourceExpandX = (expandSize / pieceW) * sourceWidth
  const sourceExpandY = (expandSize / pieceH) * sourceHeight
  ctx.drawImage(
    imageRef,
    piece.imageX - sourceExpandX,
    piece.imageY - sourceExpandY,
    sourceWidth + sourceExpandX * 2,
    sourceHeight + sourceExpandY * 2,
    x - expandSize,
    y - expandSize,
    pieceW + expandSize * 2,
    pieceH + expandSize * 2,
  )
  ctx.restore()
  ctx.save()
  drawPiecePath(ctx, piece, x, y, pieceW, pieceH, radius)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = piece.placed ? 2 : 1
  ctx.stroke()
  ctx.restore()
}

function drawCell(ctx: CanvasRenderingContext2D, cell: GridCell, x: number, y: number): void {
  const { pieceW, pieceH } = getLayout()
  const radius = Math.min(pieceW, pieceH) / 6
  ctx.save()
  drawChipPath(ctx, cell.chip, x, y, pieceW, pieceH, radius)
  ctx.fillStyle = '#2a2a2a'
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas || !imageRef) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { boardStartX, boardStartY, pieceW, pieceH } = getLayout()
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(boardStartX, boardStartY, puzzleSize.boardSize.width, puzzleSize.boardSize.height)

  gridCells.forEach((cell) => {
    if (!cell.occupied) {
      const pos = denormalize({ x: cell.normalizedX, y: cell.normalizedY })
      drawCell(ctx, cell, pos.x, pos.y)
    }
  })

  pieces
    .filter((piece) => piece.placed)
    .forEach((piece) => {
      const pos = denormalize({ x: piece.normalizedX, y: piece.normalizedY })
      drawPiece(ctx, piece, pos.x, pos.y)
    })

  if (snapCell && draggingPiece) {
    const pos = denormalize({ x: snapCell.normalizedX, y: snapCell.normalizedY })
    ctx.save()
    const radius = Math.min(pieceW, pieceH) / 6
    drawChipPath(ctx, snapCell.chip, pos.x, pos.y, pieceW, pieceH, radius)
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.stroke()
    ctx.restore()
  }

  pieces
    .filter((piece) => !piece.placed && !piece.dragging)
    .forEach((piece) => {
      const pos = denormalize({ x: piece.normalizedX, y: piece.normalizedY })
      drawPiece(ctx, piece, pos.x, pos.y)
    })

  if (draggingPiece && tempPosition) {
    drawPiece(ctx, draggingPiece, tempPosition.x, tempPosition.y, true)
  }
}

function startAnimationLoop(): void {
  const drawLoop = () => {
    draw()
    animationFrameId = requestAnimationFrame(drawLoop)
  }
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  drawLoop()
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function normalize(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: position.x / puzzleSize.canvasSize.width,
    y: position.y / puzzleSize.canvasSize.height,
  }
}

function denormalize(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: position.x * puzzleSize.canvasSize.width,
    y: position.y * puzzleSize.canvasSize.height,
  }
}

function getEventPos(event: MouseEvent | TouchEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  if ('touches' in event) {
    const touch = event.touches[0] || (event as TouchEvent).changedTouches[0]
    if (!touch) return { x: 0, y: 0 }
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }
  return {
    x: (event as MouseEvent).clientX - rect.left,
    y: (event as MouseEvent).clientY - rect.top,
  }
}

function getPieceAt(normalizedX: number, normalizedY: number): PuzzlePiece | null {
  const { pieceW, pieceH } = getLayout()
  const testPixel = denormalize({ x: normalizedX, y: normalizedY })
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const piece = pieces[i]!
    const pos = denormalize({ x: piece.normalizedX, y: piece.normalizedY })
    if (
      testPixel.x >= pos.x &&
      testPixel.x <= pos.x + pieceW &&
      testPixel.y >= pos.y &&
      testPixel.y <= pos.y + pieceH
    ) {
      return piece
    }
  }
  return null
}

function getCellAt(normalizedX: number, normalizedY: number): GridCell | null {
  const { boardStartX, boardStartY, pieceW, pieceH } = getLayout()
  const pixel = denormalize({ x: normalizedX, y: normalizedY })
  const relativeX = pixel.x - boardStartX
  const relativeY = pixel.y - boardStartY
  const col = Math.floor(relativeX / pieceW)
  const row = Math.floor(relativeY / pieceH)
  if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
    return gridCells.find((cell) => cell.row === row && cell.col === col) || null
  }
  return null
}

// ---------------------------------------------------------------------------
// Pointer / touch dragging
// ---------------------------------------------------------------------------

function onPointerDown(event: MouseEvent | TouchEvent): void {
  if (isComplete.value || !canvasRef.value) return
  event.preventDefault()
  const pos = getEventPos(event)
  const normalized = normalize(pos)
  const piece = getPieceAt(normalized.x, normalized.y)
  if (!piece) return

  const piecePixel = denormalize({ x: piece.normalizedX, y: piece.normalizedY })
  startPosition = { x: piecePixel.x, y: piecePixel.y }
  tempPosition = { x: piecePixel.x, y: piecePixel.y }
  dragOffset = { x: pos.x - piecePixel.x, y: pos.y - piecePixel.y }
  snapCell = null
  draggingPiece = { ...piece, dragging: true, placed: false }
  pieces = pieces.map((item) =>
    item.id === piece.id
      ? { ...item, dragging: true, placed: false, placedCellId: null }
      : item,
  )
  if (piece.placedCellId !== null) {
    gridCells = gridCells.map((cell) =>
      cell.id === piece.placedCellId
        ? { ...cell, occupied: false, occupiedPieceId: null }
        : cell,
    )
  }

  bindDragListeners('touches' in event)
}

function onPointerMove(event: MouseEvent | TouchEvent): void {
  if (!draggingPiece) return
  event.preventDefault()
  const pos = getEventPos(event)
  const rawX = pos.x - dragOffset.x
  const rawY = pos.y - dragOffset.y
  tempPosition = { x: rawX, y: rawY }

  const centerNormalized = normalize({
    x: rawX + getLayout().pieceW / 2,
    y: rawY + getLayout().pieceH / 2,
  })
  const cell = getCellAt(centerNormalized.x, centerNormalized.y)
  snapCell = cell && !cell.occupied ? cell : null
}

function onPointerUp(): void {
  if (!draggingPiece || !startPosition) return

  unbindDragListeners()

  const currentPieceId = draggingPiece.id
  if (snapCell && snapCell.id === draggingPiece.correctCellId) {
    pieces = pieces.map((piece) =>
      piece.id === currentPieceId
        ? {
            ...piece,
            normalizedX: snapCell!.normalizedX,
            normalizedY: snapCell!.normalizedY,
            placed: true,
            placedCellId: snapCell!.id,
            dragging: false,
          }
        : piece,
    )
    gridCells = gridCells.map((cell) =>
      cell.id === snapCell!.id
        ? { ...cell, occupied: true, occupiedPieceId: currentPieceId }
        : cell,
    )
  } else {
    pieces = pieces.map((piece) =>
      piece.id === currentPieceId
        ? {
            ...piece,
            normalizedX: piece.homeNormalizedX,
            normalizedY: piece.homeNormalizedY,
            dragging: false,
          }
        : piece,
    )
  }

  draggingPiece = null
  snapCell = null
  startPosition = null
  tempPosition = null
  dragOffset = { x: 0, y: 0 }
  checkComplete()
}

function bindDragListeners(isTouch: boolean): void {
  unbindDragListeners()
  if (isTouch) {
    boundMoveHandler = (e) => onPointerMove(e as TouchEvent)
    boundUpHandler = () => onPointerUp()
    document.addEventListener('touchmove', boundMoveHandler, { passive: false })
    document.addEventListener('touchend', boundUpHandler)
    document.addEventListener('touchcancel', boundUpHandler)
  } else {
    boundMoveHandler = (e) => onPointerMove(e as MouseEvent)
    boundUpHandler = () => onPointerUp()
    document.addEventListener('mousemove', boundMoveHandler)
    document.addEventListener('mouseup', boundUpHandler)
  }
}

function unbindDragListeners(): void {
  if (boundMoveHandler) {
    document.removeEventListener('mousemove', boundMoveHandler)
    document.removeEventListener('touchmove', boundMoveHandler)
    boundMoveHandler = undefined
  }
  if (boundUpHandler) {
    document.removeEventListener('mouseup', boundUpHandler)
    document.removeEventListener('touchend', boundUpHandler)
    document.removeEventListener('touchcancel', boundUpHandler)
    boundUpHandler = undefined
  }
}

// ---------------------------------------------------------------------------
// Sizing & reset
// ---------------------------------------------------------------------------

function updateCanvasSize(): boolean {
  if (!containerRef.value || !canvasRef.value) return false
  const canvasRect = canvasRef.value.getBoundingClientRect()
  const width = Math.floor(canvasRect.width)
  const height = Math.floor(canvasRect.height)
  if (width === 0 || height === 0) return false
  puzzleSize.canvasSize = { width, height }
  const maxByHeight = Math.floor((height - (PREFERRED_GAP * 2 + PREFERRED_MARGIN)) / 2)
  const maxByWidth = Math.floor(width - PREFERRED_GAP * 2)
  const candidateBoardSize = Math.floor(
    Math.min(width * PREFERRED_RATIO, height * PREFERRED_RATIO),
  )
  let boardSize = Math.min(candidateBoardSize, maxByHeight, maxByWidth)
  if (boardSize <= 0) {
    const fallbackMaxByHeight = Math.floor((height - (FALLBACK_GAP * 2 + FALLBACK_MARGIN)) / 2)
    const fallbackMaxByWidth = Math.floor(width - FALLBACK_GAP * 2)
    boardSize = Math.max(
      0,
      Math.min(candidateBoardSize, fallbackMaxByHeight, fallbackMaxByWidth),
    )
  }
  puzzleSize.boardSize = { width: boardSize, height: boardSize }
  const canvas = canvasRef.value
  canvas.width = width
  canvas.height = height
  return true
}

function scheduleCanvasMeasure(onMeasured?: () => void): void {
  if (measureTimer) window.clearTimeout(measureTimer)
  measureTimer = window.setTimeout(() => {
    if (updateCanvasSize()) {
      if (isComplete.value) updateCompletePositions()
      onMeasured?.()
      return
    }
    scheduleCanvasMeasure(onMeasured)
  }, 300)
}

function resetPuzzle(): void {
  if (!imageRef) return
  if (puzzleSize.boardSize.width === 0) return
  isComplete.value = false
  showCompleteMessage.value = false
  completeTitleStyle.value = null
  completeActionStyle.value = null
  if (completionTimer) {
    window.clearTimeout(completionTimer)
    completionTimer = undefined
  }
  if (replayResetTimer) {
    window.clearTimeout(replayResetTimer)
    replayResetTimer = undefined
  }
  gridCells = calculateGridCellsWithChips()
  const newPieces = calculatePuzzlePieces(gridCells)
  pieces = shufflePieces(newPieces)
  draggingPiece = null
  snapCell = null
  startPosition = null
  tempPosition = null
  dragOffset = { x: 0, y: 0 }
  startAnimationLoop()
}

function resetState(): void {
  pieces = []
  gridCells = []
  draggingPiece = null
  snapCell = null
  startPosition = null
  tempPosition = null
  dragOffset = { x: 0, y: 0 }
  isComplete.value = false
  imageLoaded.value = false
  showOriginalImage.value = true
  previewCountdown.value = 5
  showCompleteMessage.value = false
  completeTitleStyle.value = null
  completeActionStyle.value = null
  imageRef = null
  openedAt = Date.now()
  successCount = 0
  replayCount = 0
  props.store?.updateCloseMetrics({ isStarComplete: false })
  if (hideOriginalTimer) {
    window.clearTimeout(hideOriginalTimer)
    hideOriginalTimer = undefined
  }
  if (countdownTimer) {
    window.clearInterval(countdownTimer)
    countdownTimer = undefined
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = undefined
  }
  if (completionTimer) {
    window.clearTimeout(completionTimer)
    completionTimer = undefined
  }
  if (replayResetTimer) {
    window.clearTimeout(replayResetTimer)
    replayResetTimer = undefined
  }
}

function preloadImage(): void {
  const imageUrl = props.content?.imageUrl || ''
  if (!imageUrl) {
    imageLoaded.value = false
    return
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imageLoaded.value = true
    imageRef = img
    startOriginalPreview()
  }
  img.onerror = () => {
    imageLoaded.value = false
  }
  img.src = imageUrl
}

function startOriginalPreview(): void {
  showOriginalImage.value = true
  previewCountdown.value = 5
  if (hideOriginalTimer) window.clearTimeout(hideOriginalTimer)
  if (countdownTimer) window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(() => {
    previewCountdown.value -= 1
    if (previewCountdown.value <= 0) {
      window.clearInterval(countdownTimer)
      countdownTimer = undefined
      showOriginalImage.value = false
      scheduleCanvasMeasure(() => resetPuzzle())
    }
  }, 1000)
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

function onComplete(): void {
  emit('complete', { type: 'puzzle', data: { isComplete: isComplete.value } })
}

function checkComplete(): void {
  const wasComplete = isComplete.value
  const complete =
    pieces.length > 0 &&
    pieces.every(
      (piece) => piece.placedCellId !== null && piece.placedCellId === piece.correctCellId,
    )
  isComplete.value = complete
  if (complete && !wasComplete) {
    successCount += 1
    props.store?.updateCloseMetrics({ isStarComplete: true })
    onComplete()
    showCompleteMessage.value = false
    if (completionTimer) window.clearTimeout(completionTimer)
    completionTimer = window.setTimeout(() => {
      updateCompletePositions()
      showCompleteMessage.value = true
      completionTimer = undefined
    }, COMPLETION_ANIMATION_MS)
  }
}

function getBoardRect(): DOMRect | null {
  if (!canvasRef.value || !containerRef.value) return null
  const canvasRect = canvasRef.value.getBoundingClientRect()
  const containerRect = containerRef.value.getBoundingClientRect()
  const { boardStartX, boardStartY } = getLayout()
  const { width, height } = puzzleSize.boardSize
  return new DOMRect(
    canvasRect.left - containerRect.left + boardStartX,
    canvasRect.top - containerRect.top + boardStartY,
    width,
    height,
  )
}

function updateCompletePositions(): void {
  const boardRect = getBoardRect()
  if (!boardRect) {
    completeTitleStyle.value = null
    completeActionStyle.value = null
    return
  }
  const centerX = boardRect.x + boardRect.width / 2
  completeTitleStyle.value = {
    left: `${centerX}px`,
    top: `${boardRect.y - 32}px`,
    transform: 'translate(-50%, -100%)',
  }
  completeActionStyle.value = {
    left: `${centerX}px`,
    top: `${boardRect.y + boardRect.height + 32}px`,
    transform: 'translate(-50%, 0)',
  }
}

// ---------------------------------------------------------------------------
// Public actions (template)
// ---------------------------------------------------------------------------

function startPuzzleNow(): void {
  if (!showOriginalImage.value) return
  if (countdownTimer) {
    window.clearInterval(countdownTimer)
    countdownTimer = undefined
  }
  previewCountdown.value = 0
  showOriginalImage.value = false
  scheduleCanvasMeasure(() => resetPuzzle())
}

function playAgain(): void {
  replayCount += 1
  props.store?.updateCloseMetrics({ playCount: replayCount })
  if (isComplete.value) {
    isComplete.value = false
    showCompleteMessage.value = false
    if (completionTimer) {
      window.clearTimeout(completionTimer)
      completionTimer = undefined
    }
    if (replayResetTimer) window.clearTimeout(replayResetTimer)
    replayResetTimer = window.setTimeout(() => {
      resetPuzzle()
      replayResetTimer = undefined
    }, COMPLETION_ANIMATION_MS)
    return
  }
  resetPuzzle()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  openedAt = Date.now()
  props.store?.updateCloseMetrics({ isStarComplete: false })
  scheduleCanvasMeasure()
})

onBeforeUnmount(() => {
  unbindDragListeners()
  if (hideOriginalTimer) window.clearTimeout(hideOriginalTimer)
  if (countdownTimer) window.clearInterval(countdownTimer)
  if (measureTimer) window.clearTimeout(measureTimer)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (completionTimer) window.clearTimeout(completionTimer)
  if (replayResetTimer) window.clearTimeout(replayResetTimer)
  if (openedAt) {
    props.store?.updateCloseMetrics({ isStarComplete: successCount > 0 })
  }
})

// ngOnChanges → reset + re-preload whenever the star content changes
watch(
  () => props.content,
  () => {
    resetState()
    preloadImage()
  },
)
</script>

<template>
  <div
    class="puzzle-container"
    :class="{ 'puzzle-container--complete': imageLoaded && !showOriginalImage && isComplete }"
    ref="containerRef"
  >
    <h2
      v-if="imageLoaded && !showOriginalImage && isComplete && showCompleteMessage"
      class="puzzle-complete-title"
      :style="completeTitleStyle || undefined"
    >
      Congratulations!
    </h2>

    <canvas
      v-if="imageLoaded && !showOriginalImage && content?.imageUrl"
      ref="canvasRef"
      class="puzzle-canvas"
      @mousedown="onPointerDown"
      @touchstart="onPointerDown"
    ></canvas>

    <div
      v-if="imageLoaded && showOriginalImage && content?.imageUrl"
      class="puzzle-preview"
    >
      <div class="puzzle-preview-content">
        <h2 class="puzzle-preview-title">
          Remember this image and start the puzzle challenge!
        </h2>
        <img :src="content.imageUrl" alt="Puzzle preview" />
        <button class="epic-btn epic-btn--l epic-btn--secondary" @click="startPuzzleNow">
          Begin in...{{ previewCountdown }}
        </button>
      </div>
    </div>

    <div v-if="!content?.imageUrl" class="puzzle-empty">
      <p>No puzzle image</p>
    </div>

    <div
      v-if="imageLoaded && !showOriginalImage && isComplete && showCompleteMessage"
      class="puzzle-complete-actions"
      :style="completeActionStyle || undefined"
    >
      <button class="epic-btn epic-btn--l" @click="playAgain">Play Again!</button>
    </div>
  </div>
</template>

<style scoped>
.puzzle-container {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

h2 {
  margin: 0;
}

.puzzle-container--complete {
  justify-content: center;
}

.puzzle-complete-title {
  position: absolute;
  color: #0a96e6;
  text-align: center;
}

.puzzle-canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transform: translateY(0);
  transition: transform 0.5s ease;
}

.puzzle-container--complete .puzzle-canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  transform: translateY(-25%);
}

.puzzle-preview {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
}

.puzzle-preview-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 16px;
}

.puzzle-preview-title {
  text-align: center;
}

.puzzle-preview img {
  width: min(100%, 360px);
  aspect-ratio: 1;
  height: auto;
  object-fit: contain;
  display: block;
  border-radius: 16px;
  background: #f9fafd;
}

.puzzle-empty {
  color: #666666;
  font-size: 14px;
}

.puzzle-complete-actions {
  position: absolute;
}

.epic-btn {
  border: none;
  background: #0a96e6;
  color: #ffffff;
  padding: 8px 14px;
  cursor: pointer;
  border-radius: 4px;
}

.epic-btn--l {
  padding: 10px 18px;
  font-size: 16px;
}

.epic-btn--secondary {
  background: #2a2a2a;
}
</style>
