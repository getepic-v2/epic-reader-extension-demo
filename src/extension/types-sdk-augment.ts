/**
 * SDK capability augmentations.
 *
 * These APIs are documented in docs/Epic_Reader_Extension_开发文档.md but not
 * yet present in the installed @getepic-v2/reader-extension-types typings. The
 * SDK team is actively developing them; this module exposes a local augmented
 * type so the extension can call them today under the documented contract.
 * Once the typings ship these members, delete this file and drop the cast in
 * index.ts.
 *
 * Contracts (from the doc):
 * - `context.data.getBookCoverUrl(): string` — current book's cover CDN URL
 *   (absolute, unsigned). Returns `''` when no book is open.
 * - `context.globalState.save(data): Promise<void>` — persist per-(user+book)
 *   state across sessions. Gracefully no-ops (resolves void) when no appKey is
 *   configured (local debug / unconfigured test books).
 * - `context.globalState.load(): Promise<object | null>` — read the last saved
 *   state, or `null` when there is none.
 *
 * The published `ExtensionContext.data` is an inline object type (no named
 * interface to merge), so we can't use `declare module` to add members to it.
 * Instead we intersect: `AugmentedExtensionContext = ExtensionContext & {...}`,
 * and `activate` casts the incoming context once at the boundary.
 */
import type { ExtensionContext } from '@getepic-v2/reader-extension-types'
import { sdkLog } from './utils/logger'

export interface GlobalStateApi {
  /**
   * Persist state for the current user+book. No-op (resolves void) when
   * unconfigured. Optional `appKey` overrides the book's extensionConfig.appKey
   * (doc §4.8) — used when the host hasn't configured appKey on a test book
   * and the extension wants to supply its own (e.g. 'think_studio').
   */
  save(data: unknown, appKey?: string): Promise<void>
  /** Read the last persisted state, or null. Optional `appKey` as above. */
  load(appKey?: string): Promise<object | null>
}

/** Extra data methods not yet in the published typings. */
export interface ExtensionContextDataAugment {
  /** Current book cover CDN URL (absolute, unsigned), or '' when no book is open. */
  getBookCoverUrl(): string
}

export type AugmentedExtensionContext = ExtensionContext & {
  globalState?: GlobalStateApi
  data: {
    getBookCoverUrl?(): string
  }
  user?: {
    /** True when the active profile is a parent. Drives Family vs School content. */
    isParent?(): boolean
  }
}

/** Cast at the activate() boundary so internal helpers see the augmented shape. */
export function augmentContext(context: ExtensionContext): AugmentedExtensionContext {
  return context as AugmentedExtensionContext
}

/**
 * Resolve the account type for summary-game URL selection.
 *
 * Per the project's mapping rule: `isParent === true` → Family account,
 * otherwise School account. Returns 'family' / 'school' / null when the
 * SDK user API is unavailable (local debug) — callers fall back to the
 * first available URL.
 */
export function resolveAccountType(
  context: AugmentedExtensionContext,
): 'family' | 'school' | null {
  if (typeof context.user?.isParent !== 'function') {
    sdkLog.warn('user.isParent', 'unavailable — cannot resolve account type')
    return null
  }
  try {
    const isParent = context.user.isParent()
    const accountType = isParent ? 'family' : 'school'
    sdkLog.log('user.isParent', `isParent=${isParent} → ${accountType}`)
    return accountType
  } catch (e) {
    sdkLog.warn('user.isParent failed', e)
    return null
  }
}

/**
 * RTM (Read-To-Me) pause/resume controller.
 *
 * When the drawer opens we want RTM playback to pause, and to resume once the
 * drawer closes. The host's pause/resume command API is not yet exposed by the
 * SDK (no `rtmPause`/`rtmResume` command in context.commands today). This
 * controller issues those commands optimistically via `commands.execute` —
 * they become effective the moment the SDK ships them, with no code change
 * here. Until then the calls are no-ops on the host side.
 *
 * Tracks whether *we* paused playback so resume is only issued to undo our
 * own pause (never resumes an RTM we didn't touch — e.g. if the host paused
 * independently, or RTM was off entirely).
 */
export interface RtmController {
  /** Pause host RTM. Idempotent; remembers it paused so resume() can undo it. */
  pause(): void
  /** Resume host RTM, but only if this controller previously paused it. */
  resume(): void
}

export function createRtmController(
  context: AugmentedExtensionContext,
): RtmController {
  let pausedByUs = false
  return {
    pause() {
      if (pausedByUs) return
      pausedByUs = true
      // TODO(sdk): replace with a typed RTM command once the SDK exposes one.
      try {
        context.commands.execute('rtmPause')
      } catch {
        // command may not exist yet — safe to ignore
      }
    },
    resume() {
      if (!pausedByUs) return
      pausedByUs = false
      try {
        context.commands.execute('rtmResume')
      } catch {
        // command may not exist yet — safe to ignore
      }
    },
  }
}
