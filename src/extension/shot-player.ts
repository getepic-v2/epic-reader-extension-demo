import type { Shot } from './types'
import type { ShotPreloadQueue } from './composables/useShotPreloadQueue'
import { appendCacheBuster } from './utils/url'

/** Delay before the MarkLayer (star-overlay) fades in on a loop=0 shot.
 *  Matches the SVG subtitle's 1s animation delay so both appear together. */
const MARK_LAYER_DELAY_MS = 1000

/**
 * Web Audio fade for loop>=1 (audible) shots. GainNode.gain is ramped via
 * setTargetAtTime (exponential) on the browser's audio render thread, so JS
 * main-thread jank never causes a stepped/zippered fade.
 *
 * τ is the time-constant to reach ~63% of the target; 1s ≈ 3τ reaches ~95%,
 * so a 0.3s τ gives a perceived "~1s fade". Exponential (not linear) because
 * human loudness perception is logarithmic — linear ramps sound sudden at the
 * start.
 */
const FADE_TAU_S = 0.3
/** Start the fade-out when this much playback time remains. */
const FADE_TAIL_THRESHOLD_S = 1.0

/**
 * Pure-JS page-level video shot player.
 *
 * Replaces the Vue ShotOverlay component with framework-agnostic code, because
 * video playback is inherently imperative (play/pause/load/currentTime) and
 * Vue's reactivity buys nothing here while adding ref-timing hazards. This
 * class owns the DOM elements and their lifecycle directly.
 *
 * Design: PRELOAD-ALL-THEN-PLAY.
 *   One <video> per shot. On mount, every shot url is queued for serial
 *   download (concurrency=1 via ShotPreloadQueue). Each video's src is set
 *   when the queue reaches it; when it fires canplaythrough it releases the
 *   queue slot and bumps the ready count. Only once EVERY shot is ready does
 *   playback begin — so the first frame shown is already decoded, and every
 *   shot-to-shot cut is a pure visibility flip with zero decode/seek gap and
 *   no flash. Cost: a brief white pause while videos preload.
 *
 * Loop semantics:
 *   loop === 0 → infinite loop, MUTED (terminal background state)
 *   loop >= 1  → play N times, WITH SOUND, then advance to the next shot
 *
 * Two-phase page turn (only when the page contains BOTH a loop===0 shot and
 * a loop>=1 shot): while the user is resting on the loop=0 background, the
 * first "next page" turn does NOT advance the book — instead it replays the
 * page's loop>=1 (audible) shot. When that audible shot finishes ALL its loop
 * iterations, the player requests a real page turn via `onRequestPageTurn`.
 * A second tap during the audible playback is swallowed (debounced).
 * `previousPage` always passes through (handled by the host).
 *
 * Layering/pointer-events are applied by the host via injected CSS
 * (`.shot-overlay`, `.shot-layer`, `.shot-video`, `.shot-subtitle`).
 */
export interface ShotPlayerOptions {
  /** Container element to mount into (its children become the shot layers). */
  container: HTMLElement
  /** Ordered shots for the current page (played by ascending index). */
  shots: Shot[]
  /** Global preload queue (concurrency=1). */
  queue: ShotPreloadQueue
  /**
   * Called when the MarkLayer (star-overlay) visibility should change. The
   * player shows it 1s after a loop===0 shot starts (in sync with the SVG
   * subtitle fade-in) and hides it whenever a loop>=1 (audible, finite) shot
   * is playing — those are the "video" moments where stars must not appear.
   */
  onMarkLayer?: (visible: boolean) => void
  /**
   * Called when a two-phase "next page" turn should actually advance the book
   * — i.e. the user tapped next while on the loop=0 background, the audible
   * (loop>=1) shot was played to completion, and the real page turn is now
   * due. The host should invoke the reader's nextPage command.
   */
  onRequestPageTurn?: (direction: 'next' | 'prev') => void
}

interface ShotLayer {
  video: HTMLVideoElement
  subtitle: HTMLImageElement | null
  counted: boolean
  // --- Web Audio (only populated for loop>=1 shots; loop===0 layers leave these null) ---
  sourceNode?: MediaElementAudioSourceNode | null
  gainNode?: GainNode | null
  /** Guards createMediaElementSource — a second call on the same <video> throws. */
  sourceCreated?: boolean
  /** One tail-fade per play; reset by disarmTailFade / replay. */
  tailFadeStarted?: boolean
  /** Stable ref so removeEventListener works across arm/disarm. */
  timeupdateHandler?: ((e: Event) => void) | null
}

export class ShotPlayer {
  private readonly container: HTMLElement
  private readonly shots: Shot[]
  private readonly queue: ShotPreloadQueue
  private readonly onMarkLayer: ((visible: boolean) => void) | null
  private readonly onRequestPageTurn:
    | ((direction: 'next' | 'prev') => void)
    | null
  private readonly layers: ShotLayer[] = []
  /** The white-backed wrapper element (`.shot-overlay`). */
  private overlayEl: HTMLElement | null = null
  /** Loading dots shown during preload (`.shot-loader`). */
  private loaderEl: HTMLElement | null = null

  /** Index of the currently-visible/playing shot. -1 = still preloading. */
  private currentIndex = -1
  /** Number of shots whose video has reached canplaythrough. */
  private readyCount = 0
  /** Whether playback has begun. */
  private playing = false
  /** For loop>=1: remaining plays (incl. current). Ignored for loop===0. */
  private remainingPlays = 0
  /** Per-index event handlers (stable references so removeEventListener works). */
  private readonly readyHandlers: ((e: Event) => void)[] = []
  private readonly endedHandlers: ((e: Event) => void)[] = []
  /** Pending MarkLayer reveal timer (1s delay, mirroring subtitle fade-in). */
  private markLayerTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  /** Lazily created on the first audible (loop>=1) shot play; closed in destroy(). */
  private audioCtx: AudioContext | null = null

  // --- Two-phase page turn state (only when page has both loop=0 and loop>=1) ---
  /** True when this page's shots contain both a loop===0 and a loop>=1 shot. */
  private readonly twoPhase: boolean
  /** Index of the loop>=1 (audible) shot used by two-phase. -1 if none. */
  private readonly nIndex: number
  /** Index of the loop===0 (background) shot used by two-phase. -1 if none. */
  private readonly zeroIndex: number
  /**
   * True when the currently-playing audible shot was triggered by a two-phase
   * page turn (vs. the page's natural first-play sequence). When true, the shot
   * finishing ALL its loop iterations fires onRequestPageTurn instead of
   * advancing to the next shot.
   */
  private nTriggeredByTurn = false

  constructor(opts: ShotPlayerOptions) {
    this.container = opts.container
    this.shots = opts.shots
    this.queue = opts.queue
    this.onMarkLayer = opts.onMarkLayer ?? null
    this.onRequestPageTurn = opts.onRequestPageTurn ?? null

    // Detect two-phase mode: the page must contain both a loop===0 (background)
    // and a loop>=1 (audible) shot. Locate the first of each (order-agnostic —
    // data is usually [N, 0] but some books are [0, N]).
    let nIndex = -1
    let zeroIndex = -1
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i]
      if (!s) continue
      if (s.loop === 0 && zeroIndex < 0) zeroIndex = i
      else if (s.loop >= 1 && nIndex < 0) nIndex = i
    }
    this.nIndex = nIndex
    this.zeroIndex = zeroIndex
    this.twoPhase = nIndex >= 0 && zeroIndex >= 0

    // Pre-create stable per-index handlers (capture i in closure). Using the
    // same reference for add/removeEventListener is required for removal.
    for (let i = 0; i < this.shots.length; i++) {
      this.readyHandlers.push((e) => this.onVideoReady(i, e))
      this.endedHandlers.push((e) => this.onVideoEnded(i, e))
    }

    this.build()
    this.preloadAll()
    // Hide the MarkLayer (stars) immediately for this shots page — videos are
    // still preloading and no shot is playing yet. It will be faded in 1s after
    // a loop=0 background shot starts (armMarkLayer). Pages without shots never
    // construct a ShotPlayer, so their stars stay visible (default CSS).
    this.setMarkLayer(false)
  }

  /** Build the white-backed .shot-overlay wrapper + one .shot-layer per shot. */
  private build(): void {
    // The wrapper carries the opaque white background so the book page never
    // bleeds through during preload (or any empty-frame gap). It is created
    // synchronously here, so the moment ShotPlayer is constructed on a page
    // turn, the white mask is already covering the page — before any video
    // has loaded.
    this.overlayEl = document.createElement('div')
    this.overlayEl.className = 'shot-overlay'

    const frag = document.createDocumentFragment()
    for (let i = 0; i < this.shots.length; i++) {
      const shot = this.shots[i]
      if (!shot) continue
      const readyHandler = this.readyHandlers[i]
      const endedHandler = this.endedHandlers[i]
      const layer = document.createElement('div')
      layer.className = 'shot-layer'

      const video = document.createElement('video')
      video.className = 'shot-video'
      // crossOrigin MUST be set before src is assigned (in preloadAll) so the
      // cross-origin video isn't tainted — a tainted <video> routed through a
      // MediaElementAudioSourceNode outputs silence (no error, just zeros).
      // The CDN returns access-control-allow-origin: *.
      video.crossOrigin = 'anonymous'
      video.setAttribute('playsinline', '')
      video.preload = 'auto'
      if (readyHandler) video.addEventListener('canplaythrough', readyHandler)
      if (endedHandler) video.addEventListener('ended', endedHandler)
      layer.appendChild(video)

      let subtitle: HTMLImageElement | null = null
      if (shot.subtitleUrl) {
        subtitle = document.createElement('img')
        subtitle.className = 'shot-subtitle'
        subtitle.src = shot.subtitleUrl
        subtitle.alt = ''
        subtitle.setAttribute('aria-hidden', 'true')
        subtitle.draggable = false
        layer.appendChild(subtitle)
      }

      frag.appendChild(layer)
      this.layers.push({ video, subtitle, counted: false })
    }
    this.overlayEl.appendChild(frag)
    // Loading dots (3 bouncing blue dots, matching EpicWeb's dot-loader),
    // shown while videos preload and removed once playback begins.
    this.loaderEl = document.createElement('div')
    this.loaderEl.className = 'shot-loader'
    const dots = document.createElement('div')
    dots.className = 'shot-loader__dots'
    for (let d = 1; d <= 3; d++) {
      const dot = document.createElement('div')
      dot.className = `shot-loader__dot shot-loader__dot--${d}`
      dots.appendChild(dot)
    }
    this.loaderEl.appendChild(dots)
    this.overlayEl.appendChild(this.loaderEl)
    this.container.appendChild(this.overlayEl)
  }

  /**
   * Begin preloading every shot's video through the queue. The queue
   * serializes src assignment (concurrency=1); each video's canplaythrough
   * releases the slot and bumps readyCount. When all are ready, playback
   * begins. Called from the constructor — element refs are already available
   * (no template/ref timing to worry about).
   */
  private preloadAll(): void {
    if (this.destroyed) return
    this.readyCount = 0
    this.shots.forEach((shot, i) => {
      const bustedUrl = appendCacheBuster(shot.url)
      this.queue.enqueueBack(bustedUrl, (url) => {
        if (this.destroyed) return
        const layer = this.layers[i]
        if (!layer) return
        this.applyLoopMute(layer.video, shot)
        layer.video.src = url
        layer.video.load()
      })
    })
  }

  /** Apply a shot's loop/mute config to its video element. */
  private applyLoopMute(video: HTMLVideoElement, shot: Shot): void {
    if (shot.loop === 0) {
      video.loop = true
      video.muted = true
    } else {
      video.loop = false
      video.muted = false
    }
  }

  /**
   * Arm the MarkLayer reveal for the current shot: hide it immediately, then
   * if this is a loop===0 (terminal background) shot, fade it in after
   * MARK_LAYER_DELAY_MS — in sync with the SVG subtitle fade-in. loop>=1
   * (audible, finite) shots keep the MarkLayer hidden the whole time.
   */
  private armMarkLayer(shot: Shot): void {
    this.clearMarkLayerTimer()
    // Hidden while any shot is mid-playback (and during preload).
    this.setMarkLayer(false)
    if (shot.loop !== 0) return
    this.markLayerTimer = setTimeout(() => {
      this.markLayerTimer = null
      if (this.destroyed) return
      // Only reveal if this loop=0 shot is still the current one.
      if (this.currentIndex >= 0 && this.shots[this.currentIndex]?.loop === 0) {
        this.setMarkLayer(true)
      }
    }, MARK_LAYER_DELAY_MS)
  }

  private clearMarkLayerTimer(): void {
    if (this.markLayerTimer) {
      clearTimeout(this.markLayerTimer)
      this.markLayerTimer = null
    }
  }

  private setMarkLayer(visible: boolean): void {
    this.onMarkLayer?.(visible)
  }

  // ── Web Audio fade (loop>=1 shots only) ──────────────────────────────────

  /**
   * Build the MediaElementSource → GainNode → destination graph for a layer's
   * video, once. Idempotent via sourceCreated. loop===0 shots get no graph
   * (they stay muted). On any failure, sourceCreated is still set (never retry)
   * but gainNode may be null — callers null-check and fall back to raw play.
   */
  private ensureAudioGraph(layer: ShotLayer, shot: Shot): void {
    if (shot.loop < 1) return
    if (layer.sourceCreated) return
    layer.sourceCreated = true
    try {
      if (!this.audioCtx) {
        const Ctor: typeof AudioContext =
          window.AudioContext || (window as any).webkitAudioContext
        if (!Ctor) return
        this.audioCtx = new Ctor()
      }
      const src = this.audioCtx.createMediaElementSource(layer.video)
      const gain = this.audioCtx.createGain()
      gain.gain.value = 0 // start silent so play→fadeIn can't leak the audio head
      src.connect(gain).connect(this.audioCtx.destination)
      layer.sourceNode = src
      layer.gainNode = gain
    } catch {
      // createMediaElementSource threw (already bound, or ctx issue) — leave
      // gainNode null; the shot still plays, just without fades.
      layer.gainNode = null
    }
  }

  private fadeIn(layer: ShotLayer): void {
    const ctx = this.audioCtx
    const gain = layer.gainNode
    if (!ctx || !gain) return
    ctx.resume().catch(() => {})
    const t = ctx.currentTime
    // Cancel any in-flight ramp (e.g. a half-finished fadeOut) and anchor first
    // so the new ramp starts from the live value — interruption-safe.
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(1, t, FADE_TAU_S)
  }

  private fadeOut(layer: ShotLayer): void {
    const ctx = this.audioCtx
    const gain = layer.gainNode
    if (!ctx || !gain) return
    const t = ctx.currentTime
    // Anchor at the live value so a fadeOut mid-fadeIn still ramps smoothly.
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.setTargetAtTime(0, t, FADE_TAU_S)
  }

  /** Arm the tail-fade: fade out over the last FADE_TAIL_THRESHOLD_S of playback. */
  private armTailFade(layer: ShotLayer, shot: Shot): void {
    if (shot.loop < 1) return
    this.disarmTailFade(layer)
    const handler = () => this.onTimeupdate(layer)
    layer.timeupdateHandler = handler
    layer.video.addEventListener('timeupdate', handler)
  }

  private disarmTailFade(layer: ShotLayer): void {
    const h = layer.timeupdateHandler
    if (h) {
      layer.video.removeEventListener('timeupdate', h)
      layer.timeupdateHandler = null
    }
    layer.tailFadeStarted = false
  }

  private onTimeupdate(layer: ShotLayer): void {
    if (layer.tailFadeStarted) return
    const v = layer.video
    const d = v.duration
    if (!Number.isFinite(d) || d <= 0) return
    if (d - v.currentTime <= FADE_TAIL_THRESHOLD_S) {
      layer.tailFadeStarted = true
      this.fadeOut(layer)
    }
  }

  /**
   * (Re)apply loop/mute then start playback from the beginning. src/load() can
   * reset a video's muted state in some browsers, so we re-apply right before
   * play to guarantee loop===0 stays muted and loop>=1 stays audible.
   */
  private startPlay(video: HTMLVideoElement, shot: Shot): void {
    this.applyLoopMute(video, shot)
    video.currentTime = 0
    const audible = shot.loop >= 1
    const p = video.play()
    if (p) {
      p.then(() => {
        if (this.destroyed) return
        if (!audible) return
        // play() raced against a layer switch — bail so we don't fade a stale layer.
        const layer = this.layers[this.currentIndex]
        if (!layer || layer.video !== video) return
        this.ensureAudioGraph(layer, shot)
        if (!layer.gainNode) return // graph failed → raw play, no fade
        this.fadeIn(layer)
        this.armTailFade(layer, shot)
      }).catch(() => {
        // Autoplay policy: unmuted autoplay may be blocked before any user
        // gesture. Degrade to muted so the sequence still progresses — and skip
        // the fade graph (meaningless when muted). Display takes priority over
        // sound; a muted-but-visible video is better than a blank white frame.
        video.muted = true
        video.play().catch(() => {})
      })
    }
  }

  /**
   * A shot's video reached canplaythrough. Release the queue slot and, if all
   * shots are ready, begin playback.
   */
  private onVideoReady(index: number, _e: Event): void {
    if (this.destroyed) return
    if (index < 0 || index >= this.layers.length) return
    const layer = this.layers[index]
    if (!layer || layer.counted) return
    layer.counted = true
    this.readyCount += 1
    this.queue.reportBackReady()
    if (!this.playing && this.readyCount >= this.shots.length) {
      this.startPlayback()
    }
  }

  /** All shots ready — show shot 0 and start playing. */
  private startPlayback(): void {
    if (this.playing || !this.shots.length) return
    this.playing = true
    // Loading done — remove the dot loader.
    if (this.loaderEl) {
      this.loaderEl.remove()
      this.loaderEl = null
    }
    const shot = this.shots[0]
    if (!shot) return
    this.remainingPlays = shot.loop === 0 ? 0 : shot.loop
    this.currentIndex = 0
    this.updateVisibility()
    this.armMarkLayer(shot)
    const v = this.layers[0]?.video
    if (v) this.startPlay(v, shot)
  }

  /** The current video ended — handle loop replay or advance. */
  private onVideoEnded(index: number, _e: Event): void {
    if (this.destroyed) return
    if (index !== this.currentIndex) return
    const shot = this.shots[index]
    if (!shot) return

    // loop===0 relies on native loop=true; 'ended' shouldn't fire. Restart
    // defensively if it ever does.
    if (shot.loop === 0) {
      this.layers[index]?.video.play().catch(() => {})
      return
    }

    this.remainingPlays -= 1
    if (this.remainingPlays > 0) {
      // Replay the same shot (same video, just rewind). No layer switch, so
      // the subtitle <img> is not touched — its CSS animation does not restart
      // and the subtitle stays visible.
      const v = this.layers[index]?.video
      if (v) this.startPlay(v, shot)
      return
    }

    // Plays exhausted.
    // Two-phase: if this audible shot was triggered by a page turn (the user
    // tapped next while on the loop=0 background), finishing ALL its loops
    // means the real page turn is now due — request it from the host instead
    // of advancing to the next shot.
    if (this.nTriggeredByTurn && index === this.nIndex) {
      this.nTriggeredByTurn = false
      // Hide the MarkLayer (an audible shot kept it hidden; on turn we stay
      // hidden until the next page's loop=0 shot arms it again).
      this.setMarkLayer(false)
      this.onRequestPageTurn?.('next')
      return
    }

    // Otherwise advance to the next shot (pure visibility flip).
    const nextIndex = index + 1
    if (nextIndex >= this.shots.length) {
      // Last shot exhausted. Freeze on the last frame.
      return
    }
    this.advanceTo(nextIndex)
  }

  /**
   * Switch the visible shot. Since every video is already loaded to
   * canplaythrough, this is just: pause old, flip currentIndex, play new.
   * No src change, no decode gap, no flash.
   */
  private advanceTo(nextIndex: number): void {
    if (this.currentIndex === nextIndex) return

    // --- OLD LAYER: cross-fade out (or hard-cut for loop===0 / no graph) ---
    const oldLayer = this.currentIndex >= 0 ? this.layers[this.currentIndex] : null
    const oldShot = this.currentIndex >= 0 ? this.shots[this.currentIndex] : null
    if (oldLayer && oldShot) {
      this.disarmTailFade(oldLayer)
      if (oldShot.loop >= 1 && oldLayer.gainNode) {
        // Cross-fade: ramp old gain →0 over ~1s while the new layer fades in.
        this.fadeOut(oldLayer)
        // Pause the old video once the fade is ~done (≈3τ = 95%). setTimeout is
        // approximate but the gain ramp runs on the audio thread regardless, so
        // worst case it plays silently a few extra ms before pausing.
        const ms = FADE_TAU_S * 3 * 1000
        window.setTimeout(() => {
          if (this.destroyed) return
          // Don't pause if the user has switched back to this layer.
          if (this.currentIndex !== nextIndex) return
          oldLayer.video.pause()
          oldLayer.video.muted = true
        }, ms)
      } else {
        // loop===0 (muted) or graph missing — hard cut as before.
        oldLayer.video.pause()
        oldLayer.video.muted = true
      }
    }

    const shot = this.shots[nextIndex]
    if (!shot) return

    this.currentIndex = nextIndex
    this.remainingPlays = shot.loop === 0 ? 0 : shot.loop
    this.updateVisibility()
    this.armMarkLayer(shot)

    const v = this.layers[nextIndex]?.video
    if (v) {
      this.startPlay(v, shot)
    }
  }

  /** Toggle .shot-layer--visible on the current layer only. */
  private updateVisibility(): void {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]
      if (!layer) continue
      const el = layer.video.parentElement
      if (!el) continue
      if (i === this.currentIndex) el.classList.add('shot-layer--visible')
      else el.classList.remove('shot-layer--visible')
    }
  }

  /**
   * Host hook for intercepting a page-turn command. Returns whether the turn
   * should be swallowed (handled internally) or passed through to the reader.
   *
   * - Non-two-phase pages, or not currently resting on the loop=0 background →
   *   'pass' (the reader turns normally).
   * - Two-phase + resting on loop=0 background → 'swallow' and start the
   *   page's audible (loop>=1) shot; finishing all its loops later fires
   *   onRequestPageTurn for the real turn.
   * - Two-phase + audible shot currently playing (triggered by a turn) →
   *   'swallow' (debounce repeated taps).
   *
   * Only `direction === 'next'` is intercepted; the host passes `previousPage`
   * through without consulting this.
   */
  consumePageTurn(direction: 'next' | 'prev'): 'swallow' | 'pass' {
    if (this.destroyed || direction !== 'next' || !this.twoPhase) return 'pass'
    // Resting on the loop=0 background → trigger the audible shot.
    if (this.currentIndex === this.zeroIndex) {
      this.playAudibleForTurn()
      return 'swallow'
    }
    // Audible shot already playing (triggered by a prior turn) → debounce.
    if (this.nTriggeredByTurn && this.currentIndex === this.nIndex) {
      return 'swallow'
    }
    return 'pass'
  }

  /**
   * Start (or restart) the page's audible shot as a two-phase turn trigger.
   * Marks nTriggeredByTurn so that when ALL its loop iterations complete, the
   * player fires onRequestPageTurn instead of advancing to the next shot.
   */
  private playAudibleForTurn(): void {
    if (this.nIndex < 0) return
    const shot = this.shots[this.nIndex]
    if (!shot) return
    this.nTriggeredByTurn = true
    // Reuse the normal advance path (pause old, flip visibility, arm MarkLayer
    // hidden, play from start). nTriggeredByTurn is what makes onVideoEnded
    // request the real turn instead of advancing.
    this.advanceTo(this.nIndex)
  }

  /** Tear down: remove listeners, pause, clear src, detach DOM. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clearMarkLayerTimer()
    // Restore MarkLayer (stars) to default-visible before unmounting, so the
    // next page — if it has no shots — shows its stars without a stale
    // hidden class lingering on .star-overlay.
    this.setMarkLayer(true)
    // Tear down the Web Audio graph: remove timeupdate listeners + disconnect
    // nodes while the AudioContext is still open.
    for (const layer of this.layers) {
      if (!layer) continue
      this.disarmTailFade(layer)
      try {
        layer.sourceNode?.disconnect()
      } catch {
        // already disconnected
      }
      try {
        layer.gainNode?.disconnect()
      } catch {
        // already disconnected
      }
      layer.sourceNode = null
      layer.gainNode = null
      layer.sourceCreated = false
    }
    if (this.audioCtx) {
      // Fire-and-forget: close() just releases the hardware. After
      // this.audioCtx = null, every fade method null-checks and early-returns.
      this.audioCtx.close().catch(() => {})
      this.audioCtx = null
    }
    // Remove listeners using the stable handler references.
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]
      if (!layer) continue
      const readyHandler = this.readyHandlers[i]
      const endedHandler = this.endedHandlers[i]
      if (readyHandler) layer.video.removeEventListener('canplaythrough', readyHandler)
      if (endedHandler) layer.video.removeEventListener('ended', endedHandler)
      layer.video.pause()
      layer.video.muted = true
      layer.video.removeAttribute('src')
      layer.video.load()
    }
    // Clear the container.
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild)
    }
    this.overlayEl = null
    this.layers.length = 0
    this.currentIndex = -1
    this.readyCount = 0
    this.playing = false
  }
}
