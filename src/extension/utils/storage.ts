/**
 * localStorage wrapper for the extension.
 *
 * The Angular epic-labs used EpicWeb's LocalStorageService + ProfileService.
 * The extension has no profile concept, so persistence is plain localStorage
 * with a book-scoped key prefix to avoid cross-book data collisions.
 */

const PREFIX = 'epic_labs_ext'

function buildKey(bookId: number | string | undefined, key: string): string {
  return bookId !== undefined ? `${PREFIX}:${bookId}:${key}` : `${PREFIX}:${key}`
}

export function loadJSON<T>(
  key: string,
  fallback: T,
  bookId?: number | string,
): T {
  try {
    const raw = localStorage.getItem(buildKey(bookId, key))
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T, bookId?: number | string): void {
  try {
    localStorage.setItem(buildKey(bookId, key), JSON.stringify(value))
  } catch {
    // localStorage may be unavailable (private mode, quota) — fail silently.
  }
}

export function remove(key: string, bookId?: number | string): void {
  try {
    localStorage.removeItem(buildKey(bookId, key))
  } catch {
    // ignore
  }
}

export function loadFlag(key: string, bookId?: number | string): boolean {
  return loadJSON<boolean>(key, false, bookId)
}

export function saveFlag(key: string, value: boolean, bookId?: number | string): void {
  saveJSON(key, value, bookId)
}

// Global keys (not book-scoped) — kept identical to EpicWeb LocalStorageConstants
// for cross-session continuity of guide/rating prompts.
export const STORAGE_KEYS = {
  GUIDE_DISMISSED: 'epic_labs_guide_dismissed',
  BOOK_RATING_SHOWN: 'epic_labs_book_rating_shown',
  // book-scoped
  COLLECTED_KEYS: 'collected_keys',
  INTERACTION_INFO: 'interaction_info',
} as const
