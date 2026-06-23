import type { ExtensionContext } from '../types'

/**
 * Thin wrapper around context.analytics.log that tolerates a missing context
 * (e.g. when running outside the host). Components and stores call
 * `analytics.log(EVENT, params)` uniformly; this swallows errors if analytics
 * is unavailable so interactive logic never breaks on logging failures.
 */
export interface Analytics {
  log(event: string, params?: Record<string, unknown>): void
}

export function createAnalytics(context: ExtensionContext | null): Analytics {
  const raw = context?.analytics
  return {
    log(event: string, params?: Record<string, unknown>): void {
      try {
        raw?.log(event, params)
      } catch {
        // analytics failure must not break interaction flow
      }
    },
  }
}

/** No-op analytics for tests / headless contexts. */
export const noopAnalytics: Analytics = {
  log() {},
}
