import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { FlipMatchActivationPoint } from '../types'

/**
 * "Comet trail" effect fired when flip-match cards land on activation points.
 * Ported 1:1 from EpicWeb MotionActiveOverlayComponent.
 *
 * The Angular component renders no template (it builds DOM on document.body via
 * Renderer2 and is driven imperatively by the parent). The Vue port keeps that
 * shape: a factory returning launchComets/clearAll/dispose, held directly by the
 * entry instead of mounted as a component.
 *
 * The Angular version's setTimeout has no handle and ngOnDestroy only removes
 * DOM (not the lottie instances). The port tracks every animation and timer and
 * tears them all down in dispose().
 */

export interface MotionActiveOverlay {
  launchComets(
    points: FlipMatchActivationPoint[],
    bookMarkLayerEl: HTMLElement | null | undefined,
  ): Promise<void>
  clearAll(): void
  dispose(): void
}

export function createMotionActiveOverlay(
  getDrawerDimensions: () => { drawerWidth: number; drawerHeight: number },
): MotionActiveOverlay {
  const ANIM_PATH = '/assets/epic-labs/animations/motion-active/1.json'
  const LOTTIE_W = 1100
  const LOTTIE_H = 700
  /** Animation start (trail origin) is at x=95%, end (trail tip) is at x=5%. */
  const TRAIL_ORIGIN_PCT = 0.95
  const TRAIL_TIP_PCT = 0.05

  const activeRoots: HTMLElement[] = []
  const activeAnims: AnimationItem[] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function clearAll(): void {
    for (const id of timers) clearTimeout(id)
    timers.clear()
    for (const anim of activeAnims) {
      try {
        anim.destroy()
      } catch {
        // already destroyed
      }
    }
    activeAnims.length = 0
    for (const el of activeRoots) {
      el.parentNode?.removeChild(el)
    }
    activeRoots.length = 0
  }

  function launchComets(
    points: FlipMatchActivationPoint[],
    bookMarkLayerEl: HTMLElement | null | undefined,
  ): Promise<void> {
    if (!bookMarkLayerEl || !points.length) return Promise.resolve()

    const vw = window.innerWidth
    const vh = window.innerHeight
    const { drawerWidth } = getDrawerDimensions()

    const startX = vw - drawerWidth / 2
    const startY = vh / 2

    const markRect = bookMarkLayerEl.getBoundingClientRect()

    let remaining = points.length
    return new Promise<void>((resolve) => {
      const onDone = () => {
        if (--remaining === 0) {
          flashReadingArea(bookMarkLayerEl)
          resolve()
        }
      }
      for (const point of points) {
        const endX = markRect.left + (point.xPercent / 100) * markRect.width
        const endY = markRect.top + (point.yPercent / 100) * markRect.height
        launchSingleAnim(startX, startY, endX, endY, onDone)
      }
    })
  }

  function launchSingleAnim(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    onComplete: () => void,
  ): void {
    const dx = endX - startX
    const dy = endY - startY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Angle from start to target in screen coords.
    const realAngle = Math.atan2(dy, dx) * (180 / Math.PI)
    // Animation trail goes from x=95% → x=5%, i.e. the -x direction (180°).
    // Rotation needed: point the -x axis along the realAngle direction.
    const rotationDeg = realAngle + 180

    const displayW = 200
    const displayH = Math.round((LOTTIE_H / LOTTIE_W) * displayW)

    // Scale so the trail tip (5%) reaches the target point.
    const trailSpanPx = displayW * (TRAIL_ORIGIN_PCT - TRAIL_TIP_PCT)
    const targetScale = distance / trailSpanPx

    // Offset so the trail origin (95%, 50%) sits at (0,0) of the rot wrapper.
    const offsetX = displayW * TRAIL_ORIGIN_PCT
    const offsetY = displayH * 0.5

    // Root: fixed anchor at start position (drawer center).
    const root = document.createElement('div')
    root.style.cssText = `position:fixed;left:${startX}px;top:${startY}px;width:0;height:0;overflow:visible;z-index:9998;pointer-events:none;`
    document.body.appendChild(root)
    activeRoots.push(root)

    // Rotation + scale wrapper: origin at trail start point.
    const rotWrapper = document.createElement('div')
    rotWrapper.style.cssText = `position:absolute;left:0;top:0;width:0;height:0;overflow:visible;transform-origin:0 0;transform:rotate(${rotationDeg}deg) scale(${targetScale});`
    root.appendChild(rotWrapper)

    // Animation container: trail origin pinned at rot wrapper origin.
    const animEl = document.createElement('div')
    animEl.style.cssText = `position:absolute;left:${-offsetX}px;top:${-offsetY}px;width:${displayW}px;height:${displayH}px;`
    rotWrapper.appendChild(animEl)

    const anim = lottie.loadAnimation({
      container: animEl,
      path: ANIM_PATH,
      renderer: 'svg',
      loop: false,
      autoplay: true,
    })
    anim.setSpeed(0.7)
    activeAnims.push(anim)

    // Base duration 1000ms at 1x; at 0.7x speed → ~1430ms; end 100ms early.
    const lottieMs = 1000 / 0.7
    const id = setTimeout(() => {
      timers.delete(id)
      anim.destroy()
      const animIdx = activeAnims.indexOf(anim)
      if (animIdx !== -1) activeAnims.splice(animIdx, 1)
      const rootIdx = activeRoots.indexOf(root)
      if (rootIdx !== -1) activeRoots.splice(rootIdx, 1)
      root.parentNode?.removeChild(root)
      onComplete()
    }, lottieMs - 100)
    timers.add(id)
  }

  function flashReadingArea(markLayerEl: HTMLElement): void {
    const flash = document.createElement('div')
    flash.style.cssText = `position:absolute;inset:0;background:white;z-index:9997;pointer-events:none;opacity:0;`
    markLayerEl.appendChild(flash)

    flash.animate(
      [
        { opacity: '0' },
        { opacity: '0.55', offset: 0.3 },
        { opacity: '0' },
      ],
      { duration: 400, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => {
      flash.parentNode?.removeChild(flash)
    }
  }

  function dispose(): void {
    clearAll()
  }

  return { launchComets, clearAll, dispose }
}
