/**
 * Minimal type-safe event emitter (no dependencies).
 *
 * Replaces RxJS Subject used by epic-labs DrawerService for the
 * interactionCommand / interactionResult / drawerComplete channels.
 * Keeps the API surface tiny: on / off / emit / clear.
 */
export type Listener<T> = (payload: T) => void

export interface Emitter<T> {
  on(listener: Listener<T>): () => void
  off(listener: Listener<T>): void
  emit(payload: T): void
  clear(): void
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>()

  return {
    on(listener: Listener<T>): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    off(listener: Listener<T>): void {
      listeners.delete(listener)
    },
    emit(payload: T): void {
      // Copy to a local array so listeners that unsubscribe during emit
      // (e.g. one-shot handlers) don't mutate the set mid-iteration.
      for (const listener of [...listeners]) {
        listener(payload)
      }
    },
    clear(): void {
      listeners.clear()
    },
  }
}
