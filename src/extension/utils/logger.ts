/**
 * Unified SDK logger.
 *
 * Every call into the host SDK (context.data / context.commands / context.events
 * / context.globalState / context.user / context.slots) is logged with the
 * `[EpicLabsExt]` prefix so the extension's SDK traffic is easy to filter in
 * the host's console (already noisy with reader output).
 *
 * Levels:
 * - log:  normal SDK round-trips (command issued, state loaded, event fired)
 * - warn: SDK call failed or returned an unexpected shape (non-fatal)
 * - error: reserved for now; SDK failures are caught at call sites
 *
 * Set EPIC_LABS_EXT_LOG=0 (on window) to silence the log level.
 */

const PREFIX = '[EpicLabsExt]'
const RAW_ENABLED =
  typeof window !== 'undefined' &&
  (window as { EPIC_LABS_EXT_LOG?: unknown }).EPIC_LABS_EXT_LOG !== 0

function fmt(message: string, extra?: unknown[]): string {
  if (!extra || extra.length === 0) return `${PREFIX} ${message}`
  return `${PREFIX} ${message}`
}

export const sdkLog = {
  /** Normal SDK round-trip. Pass the call name + a short detail string. */
  log(message: string, ...extra: unknown[]): void {
    if (!RAW_ENABLED) return
    // eslint-disable-next-line no-console
    console.log(fmt(message), ...extra)
  },
  /** SDK call failed or returned an unexpected shape — non-fatal. */
  warn(message: string, ...extra: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(`${PREFIX} ${message}`, ...extra)
  },
  /** SDK call threw — only for genuinely unexpected errors. */
  error(message: string, ...extra: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(`${PREFIX} ${message}`, ...extra)
  },
}

/** Tag a value for logging without dumping huge objects. */
export function brief(value: unknown): string {
  if (value == null) return String(value)
  if (typeof value === 'string') return `"${value.slice(0, 60)}"`
  try {
    const s = JSON.stringify(value)
    return s.length > 120 ? `${s.slice(0, 120)}…` : s
  } catch {
    return String(value)
  }
}
