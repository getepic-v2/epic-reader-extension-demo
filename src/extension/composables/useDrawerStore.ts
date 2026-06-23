import { reactive, readonly } from 'vue'
import { createEmitter, type Emitter } from '../utils/emitter'
import type {
  DrawerCloseMetrics,
  DrawerCompleteEvent,
  DragFillItem,
  TapMatchCharacter,
  HotspotRegion,
} from '../types'

// --- V1.1: interaction commands from drawer → reading area ---
export type InteractionCommand =
  | {
      type: 'highlight-drag-targets'
      items: DragFillItem[]
      tempPageUrl?: string
      tempPageDirection?: 'left' | 'right'
    }
  | { type: 'highlight-click-targets'; targets: TapMatchCharacter[] }
  | { type: 'clear-highlights' }
  | { type: 'fill-slot'; slotId: string; imageUrl: string }
  | { type: 'mark-slot-error'; slotId: string }
  | {
      type: 'show-hotspot-regions'
      correctRegion: HotspotRegion
      wrongRegion: HotspotRegion
    }

// --- V1.1: interaction results from reading area → drawer ---
export type InteractionResult =
  | {
      type: 'item-dropped'
      itemId: string
      slotId: string
      isCorrect: boolean
    }
  | { type: 'target-clicked'; targetId: string; isCorrect: boolean }
  | { type: 'hotspot-tapped'; isCorrect: boolean }

export interface DrawerRect {
  drawerWidth: number
  drawerHeight: number
  scale: number
}

export interface DrawerState {
  mounted: boolean
  isOpen: boolean
  isAnimating: boolean
  selectedContent: any
  bookId?: number
  pageIndex?: number
  starIndex?: number | null
  rect: DrawerRect
}

export interface DrawerStore {
  /** Reactive drawer state (read-only view). */
  readonly state: Readonly<DrawerState>
  /** interactionCommand channel (drawer → reading area). */
  readonly interactionCommand: Emitter<InteractionCommand>
  /** interactionResult channel (reading area → drawer). */
  readonly interactionResult: Emitter<InteractionResult>
  /** drawerComplete channel (drawer → orchestrator). */
  readonly drawerComplete: Emitter<DrawerCompleteEvent>

  updateDrawerState(partial: Partial<DrawerState>): void
  getDrawerState(): DrawerState
  closeDrawer(): void

  // interaction channels
  sendInteractionCommand(cmd: InteractionCommand): void
  sendInteractionResult(result: InteractionResult): void

  // completion
  sendCompleteEvent(event: DrawerCompleteEvent): void

  // dragging item tracking (drag-fill)
  setDraggingItemId(id: string | null): void
  getDraggingItemId(): string | null

  // stay duration (ms the drawer has been open)
  getStayDuration(): number

  // close metrics
  startCloseMetrics(metrics: DrawerCloseMetrics): void
  updateCloseMetrics(metrics: Partial<DrawerCloseMetrics>): void
  getCloseMetrics(): DrawerCloseMetrics | null
  clearCloseMetrics(): void

  resetDrawerState(): void
  /** Tear down all emitters (call on extension deactivate). */
  dispose(): void
}

const INITIAL_STATE: DrawerState = {
  mounted: false,
  isOpen: false,
  isAnimating: false,
  selectedContent: null,
  bookId: undefined,
  pageIndex: undefined,
  starIndex: null,
  rect: { drawerWidth: 0, drawerHeight: 0, scale: 1 },
}

/**
 * Create a drawer store instance — the shared communication hub between the
 * reading area (StarOverlay) and the drawer panel, ported from epic-labs
 * DrawerService (RxJS Subject → Vue reactive + emitters).
 *
 * Create once per extension activation and share across components.
 */
export function createDrawerStore(): DrawerStore {
  const state = reactive<DrawerState>({ ...INITIAL_STATE })

  const interactionCommand = createEmitter<InteractionCommand>()
  const interactionResult = createEmitter<InteractionResult>()
  const drawerComplete = createEmitter<DrawerCompleteEvent>()

  let closeMetrics: DrawerCloseMetrics | null = null
  let drawerOpenedAt = 0
  let draggingItemId: string | null = null

  function updateDrawerState(partial: Partial<DrawerState>): void {
    const wasOpen = state.isOpen
    Object.assign(state, partial)
    // track open time when drawer transitions to open
    if (partial.isOpen && !wasOpen) {
      drawerOpenedAt = Date.now()
    }
  }

  function getDrawerState(): DrawerState {
    return state
  }

  function closeDrawer(): void {
    updateDrawerState({ isOpen: false })
  }

  function sendInteractionCommand(cmd: InteractionCommand): void {
    interactionCommand.emit(cmd)
  }

  function sendInteractionResult(result: InteractionResult): void {
    interactionResult.emit(result)
  }

  function sendCompleteEvent(event: DrawerCompleteEvent): void {
    drawerComplete.emit(event)
  }

  function setDraggingItemId(id: string | null): void {
    draggingItemId = id
  }

  function getDraggingItemId(): string | null {
    return draggingItemId
  }

  function getStayDuration(): number {
    if (!drawerOpenedAt) {
      return 0
    }
    return Date.now() - drawerOpenedAt
  }

  function startCloseMetrics(metrics: DrawerCloseMetrics): void {
    closeMetrics = { ...metrics }
  }

  function updateCloseMetrics(metrics: Partial<DrawerCloseMetrics>): void {
    if (!closeMetrics) {
      return
    }
    closeMetrics = { ...closeMetrics, ...metrics }
  }

  function getCloseMetrics(): DrawerCloseMetrics | null {
    return closeMetrics ? { ...closeMetrics } : null
  }

  function clearCloseMetrics(): void {
    closeMetrics = null
  }

  function resetDrawerState(): void {
    Object.assign(state, INITIAL_STATE)
    clearCloseMetrics()
    drawerOpenedAt = 0
    draggingItemId = null
  }

  function dispose(): void {
    interactionCommand.clear()
    interactionResult.clear()
    drawerComplete.clear()
  }

  return {
    state: readonly(state),
    interactionCommand,
    interactionResult,
    drawerComplete,
    updateDrawerState,
    getDrawerState,
    closeDrawer,
    sendInteractionCommand,
    sendInteractionResult,
    sendCompleteEvent,
    setDraggingItemId,
    getDraggingItemId,
    getStayDuration,
    startCloseMetrics,
    updateCloseMetrics,
    getCloseMetrics,
    clearCloseMetrics,
    resetDrawerState,
    dispose,
  }
}
