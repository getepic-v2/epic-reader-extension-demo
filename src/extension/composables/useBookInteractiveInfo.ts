import { loadJSON, saveJSON, STORAGE_KEYS } from '../utils/storage'

/**
 * Per-book interactive info persistence. Ported from EpicWeb
 * EpicLabsUserDataService, downgraded from a backend API to localStorage.
 *
 * The Angular service called `WebUser/getBookInteractiveInfo` and
 * `WebUser/upsertBookInteractiveInfo` with `appKey='think_studio'`. The
 * extension has no backend DataService, so reads/writes are local. The method
 * signatures are kept async to match the original contract — Stage 6+ can swap
 * the body for a real fetch() against the same endpoints without touching
 * callers.
 *
 * Currently stores collected gem/key ids under `info.gems.collectedIds`.
 */

export interface EpicLabsGemsInfo {
  /** interactionId list: `${pageNumber}_${starIndex}` */
  collectedIds: string[]
}

export interface EpicLabsInteractiveInfo {
  gems?: EpicLabsGemsInfo
  [key: string]: unknown
}

export interface BookInteractiveInfoStore {
  getBookInteractiveInfo(bookId: number | string): Promise<EpicLabsInteractiveInfo | null>
  upsertBookInteractiveInfo(
    bookId: number | string,
    info: EpicLabsInteractiveInfo,
  ): Promise<boolean>
  /** Convenience: read just the collected gem ids for a book. */
  getCollectedIds(bookId: number | string): Promise<string[]>
  /** Convenience: write just the collected gem ids for a book (merges). */
  setCollectedIds(bookId: number | string, collectedIds: string[]): Promise<boolean>
}

export function createBookInteractiveInfoStore(): BookInteractiveInfoStore {
  return {
    async getBookInteractiveInfo(bookId) {
      return loadJSON<EpicLabsInteractiveInfo | null>(
        STORAGE_KEYS.INTERACTION_INFO,
        null,
        bookId,
      )
    },

    async upsertBookInteractiveInfo(bookId, info) {
      saveJSON(STORAGE_KEYS.INTERACTION_INFO, info, bookId)
      return true
    },

    async getCollectedIds(bookId) {
      const info = await this.getBookInteractiveInfo(bookId)
      return info?.gems?.collectedIds ?? []
    },

    async setCollectedIds(bookId, collectedIds) {
      const info = (await this.getBookInteractiveInfo(bookId)) ?? {}
      info.gems = { collectedIds }
      return this.upsertBookInteractiveInfo(bookId, info)
    },
  }
}
