/**
 * Append a time-bucketed cache-buster to a media URL so the browser refetches
 * at most once per `cacheWindowMs` window. Extracted from index.ts so overlay
 * components (e.g. ShotOverlay) can reuse it without importing the extension
 * entry.
 */
export function appendCacheBuster(
  url: string,
  cacheWindowMs = 3 * 60 * 60 * 1000,
): string {
  if (!url) return url
  const stamp =
    cacheWindowMs > 0
      ? Math.floor(Date.now() / cacheWindowMs) * cacheWindowMs
      : Date.now()
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${stamp}`
}
