/**
 * Global shot-video preload queue with concurrency = 1.
 *
 * The browser downloads `<video preload="auto">` resources in parallel and
 * gives us no direct throttle. To enforce a single in-flight video download
 * across the whole SDK (current-page playback + intra-page back-buffer +
 * cross-page next-page preload), we SERIALIZE downloads: only one video
 * element holds the "active download" slot at a time, and it releases the
 * slot once it fires `canplaythrough`.
 *
 * Two preload channels share the single slot, dispatched by priority:
 *
 *   1. back-buffer (P1) — `enqueueBack(url, onReady)`. The back <video> in
 *      ShotOverlay is the preload target itself: when the slot frees, the
 *      queue calls `onReady(url)` and ShotOverlay sets src on the BACK video
 *      element + load(). When that back video fires canplaythrough, ShotOverlay
 *      calls `reportBackReady()` to release the slot. Because the back video
 *      was the preload target, its first frame is already decoded when
 *      advanceTo swaps it to front → zero decode gap → no white flash.
 *
 *   2. cross-page next-page (P2) — `enqueuePage(urls)`. A hidden pool
 *      <video> cycles the urls to warm the HTTP cache (URL-keyed, survives
 *      src changes) so the NEXT page's front video hits the cache.
 *
 * Slot ownership (priority high → low):
 *   front playback (holdSlot/reportPlayingReady) > back preload
 *   (enqueueBack/reportBackReady) > cross-page pool (enqueuePage).
 *
 * `appendCacheBuster` uses a 3h time bucket, so queue and player produce
 * identical urls within a session → cache hits.
 */
export interface ShotPreloadQueue {
  /** Occupy the concurrency slot (front video is loading). Pauses everything. */
  holdSlot(): void
  /** Front video reached canplaythrough — release the slot. */
  reportPlayingReady(): void
  /**
   * Enqueue a back-buffer preload. When the slot frees, `onReady(url)` is
   * invoked and the caller sets src on the back <video>. The slot stays held
   * until `reportBackReady()` (caller's back video fired canplaythrough).
   * priority 1 (intra-page) — runs before cross-page pool.
   */
  enqueueBack(url: string, onReady: (url: string) => void): void
  /** Back video reached canplaythrough — release the slot to the next task. */
  reportBackReady(): void
  /** Enqueue all next-page shot urls at priority 2 (cross-page pool warmup). */
  enqueuePage(urls: string[]): void
  /** Page turn: clear all pending tasks + hard-cancel pool download + back hold. */
  drain(): void
  /** Release the pool video element. */
  dispose(): void
}

interface BackTask {
  url: string
  onReady: (url: string) => void
}

interface PoolTask {
  url: string
}

const POOL_TIMEOUT_MS = 15000

export function createShotPreloadQueue(): ShotPreloadQueue {
  // Hidden container + pool video for cross-page (P2) HTTP-cache warmup only.
  // Lives in the main document (not a shadow root) — never renders.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:0;top:0;'
  const pool = document.createElement('video')
  pool.preload = 'auto'
  pool.muted = true
  pool.setAttribute('playsinline', '')
  pool.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;'
  host.appendChild(pool)
  document.body.appendChild(host)

  const backQueue: BackTask[] = [] // P1: intra-page back preload
  const poolQueue: PoolTask[] = [] // P2: cross-page pool warmup

  // Slot holders. At most one is active at a time. frontHolding and
  // backHolding are mutually exclusive with each other and with pool pumping.
  let frontHolding = false
  let backHolding = false
  let pumping = false
  let currentTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function takeBack(): BackTask | undefined {
    return backQueue.shift()
  }
  function takePool(): PoolTask | undefined {
    return poolQueue.shift()
  }

  function onPoolReady() {
    if (currentTimer) {
      clearTimeout(currentTimer)
      currentTimer = null
    }
    if (disposed) return
    pumping = false
    pump()
  }

  function pump() {
    if (disposed) return
    // front playback and back preload both hold the slot; while either is
    // active, the pool cannot run.
    if (frontHolding || backHolding || pumping) return

    // P1: back-buffer preload — drive the back video element directly.
    const backTask = takeBack()
    if (backTask) {
      backHolding = true
      try {
        backTask.onReady(backTask.url)
      } catch {
        // If the callback throws, release the hold so we don't deadlock.
        backHolding = false
        pump()
        return
      }
      // Safety net: if the back video never fires canplaythrough (network
      // stall, codec issue), force-release the slot so the queue doesn't
      // deadlock waiting for reportBackReady.
      currentTimer = setTimeout(() => {
        if (backHolding) {
          console.warn('[ShotPreloadQueue] back canplaythrough timeout, advancing', backTask.url)
          backHolding = false
          pump()
        }
      }, POOL_TIMEOUT_MS)
      return
    }

    // P2: cross-page pool warmup.
    const poolTask = takePool()
    if (!poolTask) return
    pumping = true

    // Hard-cancel any in-flight pool download before starting the next.
    pool.removeAttribute('src')
    try {
      pool.load()
    } catch {
      /* ignore */
    }

    pool.src = poolTask.url
    try {
      pool.load()
    } catch {
      /* ignore */
    }

    // Safety net: if canplaythrough never fires, force-advance.
    currentTimer = setTimeout(() => {
      if (pumping) {
        console.warn('[ShotPreloadQueue] canplaythrough timeout, advancing', poolTask.url)
        onPoolReady()
      }
    }, POOL_TIMEOUT_MS)
  }

  pool.addEventListener('canplaythrough', onPoolReady)
  pool.addEventListener('error', onPoolReady) // skip broken urls

  return {
    holdSlot() {
      frontHolding = true
    },
    reportPlayingReady() {
      if (!frontHolding) return
      frontHolding = false
      pump()
    },
    enqueueBack(url, onReady) {
      if (!url) return
      // De-dupe by url: don't enqueue the same back url twice.
      if (backQueue.some((t) => t.url === url)) return
      backQueue.push({ url, onReady })
      pump()
    },
    reportBackReady() {
      if (!backHolding) return
      backHolding = false
      if (currentTimer) {
        clearTimeout(currentTimer)
        currentTimer = null
      }
      pump()
    },
    enqueuePage(urls) {
      for (const u of urls) {
        if (u && !poolQueue.some((t) => t.url === u))
          poolQueue.push({ url: u })
      }
      pump()
    },
    drain() {
      backQueue.length = 0
      poolQueue.length = 0
      if (currentTimer) {
        clearTimeout(currentTimer)
        currentTimer = null
      }
      pumping = false
      backHolding = false
      frontHolding = false
      // Cancel the in-flight pool download.
      pool.removeEventListener('canplaythrough', onPoolReady)
      pool.removeEventListener('error', onPoolReady)
      pool.removeAttribute('src')
      try {
        pool.load()
      } catch {
        /* ignore */
      }
      pool.addEventListener('canplaythrough', onPoolReady)
      pool.addEventListener('error', onPoolReady)
    },
    dispose() {
      disposed = true
      if (currentTimer) clearTimeout(currentTimer)
      currentTimer = null
      pool.removeEventListener('canplaythrough', onPoolReady)
      pool.removeEventListener('error', onPoolReady)
      pool.removeAttribute('src')
      try {
        pool.load()
      } catch {
        /* ignore */
      }
      host.remove()
    },
  }
}
