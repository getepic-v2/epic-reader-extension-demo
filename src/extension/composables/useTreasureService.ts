import { reactive } from 'vue'
import type { TreasureConfig } from '../types'
import { createEmitter } from '../utils/emitter'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../utils/storage'

/**
 * Treasure collection state — keys collected across the book, which together
 * unlock the portal game. Ported 1:1 from EpicWeb TreasureService.
 *
 * Angular's BehaviorSubject<TreasureState> is split into a `reactive` state
 * (read directly in templates) plus an emitter for code that needs to react
 * to changes (matching the logic-class onChange pattern used elsewhere).
 *
 * Persistence: collectedIds are stored in localStorage per book (Stage 4 stand-in).
 * Stage 5 swaps this for the backend WebUser.upsertBookInteractiveInfo API while
 * keeping the same service surface.
 */

export interface TreasureState {
  collectedCount: number
  totalCount: number
  isGameUnlocked: boolean
}

export interface CollectKeyResult {
  isNew: boolean
  isAllCollected: boolean
  slotIndex: number
}

export interface TreasureService {
  /** Reactive snapshot — read directly in templates. */
  readonly state: TreasureState
  /** Subscribe to state changes (replaces treasureState$ subscription). */
  readonly onChange: (cb: (state: TreasureState) => void) => () => void
  getTreasureState(): TreasureState
  init(config: TreasureConfig, keyRewardMap: Map<string, number>): void
  collectKey(interactionId: string): CollectKeyResult
  isKeyCollected(interactionId: string): boolean
  isGameUnlocked(): boolean
  getCollectedCount(): number
  getTotalCount(): number
  getSlotIndex(interactionId: string): number
  hasKeyReward(interactionId: string): boolean
  restore(collectedIds: string[]): void
  getCollectedIds(): string[]
  getUncollectedPageNumbers(): number[]
  reset(): void
  /** Persist current collected ids for the given book (Stage 4 localStorage stand-in). */
  persist(bookId: number | string | undefined): void
  /** Load persisted collected ids for the given book. Call before init/restore. */
  loadPersisted(bookId: number | string | undefined): string[]
  dispose(): void
}

export function createTreasureService(): TreasureService {
  const collectedKeys = new Set<string>()
  let totalTreasures = 0
  let gameUnlockThreshold = 0
  let keyRewardMap = new Map<string, number>() // interactionId → key amount
  let slotIndexMap = new Map<string, number>() // interactionId → fixed slot index by page order
  let currentBookId: number | string | undefined

  const state = reactive<TreasureState>({
    collectedCount: 0,
    totalCount: 0,
    isGameUnlocked: false,
  })

  const emitter = createEmitter<TreasureState>()

  function emitState() {
    state.collectedCount = collectedKeys.size
    state.totalCount = totalTreasures
    state.isGameUnlocked = collectedKeys.size >= gameUnlockThreshold
    emitter.emit({ ...state })
  }

  function persistNow() {
    if (currentBookId === undefined) return
    saveJSON(
      STORAGE_KEYS.COLLECTED_KEYS,
      { collectedIds: Array.from(collectedKeys) },
      currentBookId,
    )
  }

  return {
    state,
    onChange: (cb) => emitter.on(cb),

    getTreasureState() {
      return { ...state }
    },

    init(config, keyRewardMap_) {
      collectedKeys.clear()
      totalTreasures = config.totalTreasures
      gameUnlockThreshold = config.gameUnlockThreshold
      keyRewardMap = new Map(keyRewardMap_)

      // Deterministic slot order: sort by (page, star) so slot indices are
      // stable across reloads. interactionId format is `${pageNumber}_${starIndex}`.
      const sortedIds = Array.from(keyRewardMap.keys()).sort((a, b) => {
        const [pageA, starA] = a.split('_').map(Number)
        const [pageB, starB] = b.split('_').map(Number)
        return pageA !== pageB ? pageA - pageB : starA - starB
      })
      slotIndexMap = new Map(sortedIds.map((id, i) => [id, i]))

      emitState()
    },

    collectKey(interactionId) {
      if (collectedKeys.has(interactionId)) {
        return {
          isNew: false,
          isAllCollected: collectedKeys.size >= gameUnlockThreshold,
          slotIndex: -1,
        }
      }

      const keyAmount = keyRewardMap.get(interactionId)
      if (!keyAmount || keyAmount <= 0) {
        return {
          isNew: false,
          isAllCollected: collectedKeys.size >= gameUnlockThreshold,
          slotIndex: -1,
        }
      }

      const slotIndex = slotIndexMap.get(interactionId) ?? collectedKeys.size
      collectedKeys.add(interactionId)
      emitState()
      persistNow()

      return {
        isNew: true,
        isAllCollected: collectedKeys.size >= gameUnlockThreshold,
        slotIndex,
      }
    },

    isKeyCollected(interactionId) {
      return collectedKeys.has(interactionId)
    },

    isGameUnlocked() {
      return collectedKeys.size >= gameUnlockThreshold
    },

    getCollectedCount() {
      return collectedKeys.size
    },

    getTotalCount() {
      return totalTreasures
    },

    getSlotIndex(interactionId) {
      return slotIndexMap.get(interactionId) ?? -1
    },

    hasKeyReward(interactionId) {
      const amount = keyRewardMap.get(interactionId)
      return !!amount && amount > 0
    },

    restore(collectedIds) {
      for (const id of collectedIds) {
        if (keyRewardMap.has(id)) {
          collectedKeys.add(id)
        }
      }
      emitState()
    },

    getCollectedIds() {
      return Array.from(collectedKeys)
    },

    getUncollectedPageNumbers() {
      const pages = new Set<number>()
      for (const id of keyRewardMap.keys()) {
        if (!collectedKeys.has(id)) {
          const pageNum = parseInt(id.split('_')[0], 10)
          if (!isNaN(pageNum)) pages.add(pageNum)
        }
      }
      return Array.from(pages).sort((a, b) => a - b)
    },

    reset() {
      collectedKeys.clear()
      slotIndexMap.clear()
      totalTreasures = 0
      gameUnlockThreshold = 0
      keyRewardMap.clear()
      emitState()
    },

    persist(bookId) {
      currentBookId = bookId
      persistNow()
    },

    loadPersisted(bookId) {
      currentBookId = bookId
      const data = loadJSON<{ collectedIds?: string[] }>(
        STORAGE_KEYS.COLLECTED_KEYS,
        {},
        bookId,
      )
      return data.collectedIds ?? []
    },

    dispose() {
      emitter.clear()
    },
  }
}
