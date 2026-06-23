/**
 * In-memory scratch state for interaction bookkeeping that doesn't belong in
 * the drawer store or treasure service. Ported from EpicWeb EpicLabsStateService.
 *
 * The Angular service also tracked `activeStarIndex`, but the extension already
 * represents the active star via `state.selectedStar` in the entry, so that
 * field is dropped. What remains:
 * - `completedCards`: which (page,star) cards have been completed at least once,
 *   used to avoid double-firing completion side effects and to show "done" state.
 * - `dragFillPlaced`: which drag-fill items are currently placed per interaction,
 *   so the DragFill component can restore placement after a drawer reopen.
 *
 * Pure in-memory; reset on book change / session end. No persistence.
 */

export interface InteractionMemory {
  /** Keys are `${pageIndex}_${starIndex}`. */
  markCardCompleted(pageIndex: number, starIndex: number): void
  isCardCompleted(pageIndex: number, starIndex: number): boolean
  addDragFillPlacedItem(interactionId: string, itemId: string): void
  getDragFillPlacedItems(interactionId: string): string[]
  reset(): void
}

export function createInteractionMemory(): InteractionMemory {
  const completedCards = new Set<string>()
  const dragFillPlaced: Record<string, string[]> = {}

  const key = (pageIndex: number, starIndex: number) => `${pageIndex}_${starIndex}`

  return {
    markCardCompleted(pageIndex, starIndex) {
      completedCards.add(key(pageIndex, starIndex))
    },
    isCardCompleted(pageIndex, starIndex) {
      return completedCards.has(key(pageIndex, starIndex))
    },
    addDragFillPlacedItem(interactionId, itemId) {
      if (!dragFillPlaced[interactionId]) dragFillPlaced[interactionId] = []
      if (!dragFillPlaced[interactionId]!.includes(itemId)) {
        dragFillPlaced[interactionId]!.push(itemId)
      }
    },
    getDragFillPlacedItems(interactionId) {
      return dragFillPlaced[interactionId] ? [...dragFillPlaced[interactionId]!] : []
    },
    reset() {
      completedCards.clear()
      for (const k of Object.keys(dragFillPlaced)) delete dragFillPlaced[k]
    },
  }
}
