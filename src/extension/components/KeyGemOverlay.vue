<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type {
  EpicLabsBookData,
  Star,
} from '../types'
import type { TreasureService } from '../composables/useTreasureService'
import type { DrawerStore } from '../composables/useDrawerStore'
import type { Analytics } from '../composables/useAnalytics'
import { EPIC_LABS_KEY_COLLECT, EPIC_LABS_GAME_UNLOCK } from '../constants/analytics-events'
import TreasureModal from './TreasureModal.vue'

/**
 * Key + Gem + Portal overlay. Ported 1:1 from EpicWeb KeyGemOverlayComponent.
 *
 * Tracks collected keys (gems) and, once all are gathered, lets the reader tap
 * a portal that flies the key into the door and unlocks the game. The most
 * animation-heavy component in epic-labs: gem spring-appear + fly-to-slot, key
 * fly-to-portal, and a 3-state portal lottie state machine.
 *
 * Angular Renderer2/DOCUMENT/NgZone are dropped for plain DOM + Vue reactivity.
 * The setTimeout chains in triggerGemAnimation/triggerKeyFlyToPortal are tracked
 * and cleared on unmount (the Angular version leaked these).
 */

export interface GemOverlayOpenGameEvent {
  gameUrl: string
}

const props = defineProps<{
  epicLabsBookData: EpicLabsBookData | null
  /** Reactive reader state — currentPage is read off state.page so it tracks
   *  page turns (passing state.page as a value prop captures a snapshot that
   *  never updates, hiding the portal on its target page). */
  state: { page: number }
  bookId: string | number | undefined
  drawerDimensions: { drawerWidth: number; drawerHeight: number }
  treasureService: TreasureService
  store?: DrawerStore
  analytics?: Analytics
  /** Called once mounted with the imperative API the parent needs. */
  onReady?: (api: KeyGemOverlayApi) => void
}>()
const emit = defineEmits<{
  (e: 'openGame', payload: GemOverlayOpenGameEvent): void
  (e: 'treasureInitialized'): void
  (e: 'portalActivated'): void
  (e: 'preUnlockGameClick'): void
}>()

/** Imperative surface exposed to the entry (replaces @ViewChild + defineExpose). */
export interface KeyGemOverlayApi {
  collect: (interactionId: string, starIndex: number, starType?: string) => void
  reset: () => void
  restoreGems: (collectedIds: string[]) => void
  resetPortalVisualState: () => void
}

// --- Asset paths (1:1 from source) ---
const KEY_NORMAL = '/assets/epic-labs/animations/key-gem/key-normal/key.svg'
const KEY_SHINE_PATH = '/assets/epic-labs/animations/key-gem/key-shine/key.json'
const GEM_SHINE_PATHS = [
  '/assets/epic-labs/animations/key-gem/gem-shine/blue.json',
  '/assets/epic-labs/animations/key-gem/gem-shine/pink.json',
  '/assets/epic-labs/animations/key-gem/gem-shine/green.json',
]
const GEM_ROTATES = [-18, 0, 20]
const GEM_NORMAL_PATHS = [
  '/assets/epic-labs/animations/key-gem/gem-normal/blue.json',
  '/assets/epic-labs/animations/key-gem/gem-normal/pink.json',
  '/assets/epic-labs/animations/key-gem/gem-normal/green.json',
]
const GEM_NORMAL_SVG_PATHS = [
  '/assets/epic-labs/animations/key-gem/gem-normal/blue.svg',
  '/assets/epic-labs/animations/key-gem/gem-normal/pink.svg',
  '/assets/epic-labs/animations/key-gem/gem-normal/green.svg',
]
const PORTAL_SOUND_PATH = '/assets/epic-labs/animations/portal/sc04.mp3'
const PORTAL_PATHS = {
  default: '/assets/epic-labs/animations/portal/1.json',
  activate: '/assets/epic-labs/animations/portal/2.json',
  activated: '/assets/epic-labs/animations/portal/3.json',
}

// --- Reactive state ---
const gemCount = ref(0)
const filledSlotIndices = ref<boolean[]>([false, false, false])
const keyState = ref<'normal' | 'shine'>('normal')
const keyHidden = ref(false)
const keyAnimating = ref(false)
const portalState = ref<'hidden' | 'default' | 'activate' | 'activated'>('hidden')
const showTreasureModal = ref(false)

// --- Template refs ---
const keyEl = ref<HTMLElement>()
const keyWrapEl = ref<HTMLElement>()
const keyShineEl = ref<HTMLElement>()
const portalEl = ref<HTMLElement>()
const portalDefaultEl = ref<HTMLElement>()
const portalActivateEl = ref<HTMLElement>()
const portalActivatedEl = ref<HTMLElement>()
const portalSoundRef = ref<HTMLAudioElement>()

// --- Non-reactive animation handles ---
let flyingGemEl: HTMLElement | null = null
let flyingKeyEl: HTMLElement | null = null
let portal2Anim: AnimationItem | null = null
let portal3Anim: AnimationItem | null = null
let keyShineAnim: AnimationItem | null = null
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
let unsubTreasure: (() => void) | null = null

function scheduleTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    fn()
  }, ms)
  pendingTimers.add(id)
  return id
}

function clearAllTimers() {
  for (const id of pendingTimers) clearTimeout(id)
  pendingTimers.clear()
}

// --- Computed ---
const portalVisible = computed(
  () =>
    !!props.epicLabsBookData?.treasureConfig &&
    props.epicLabsBookData?.portalConfig?.pageNumber === props.state.page,
)

const portalTooltipText = computed<string | null>(() => {
  if (portalState.value === 'activate' || portalState.value === 'activated') return null
  const ts = props.treasureService
  if (ts.isGameUnlocked()) {
    return 'Tap the door to discover your surprise!'
  }
  const remaining = ts.getTotalCount() - ts.getCollectedCount()
  if (remaining <= 0) return null
  return `<b>TIPS: </b>You still have ${remaining} gem${remaining !== 1 ? 's' : ''} to find.
        <br>Tap and explore to find them!`
})

function gameUrl(): string | undefined {
  return (
    props.epicLabsBookData?.portalConfig?.gameUrl ||
    props.epicLabsBookData?.gameConfig?.gameUrl
  )
}

// --- Lifecycle ---
onMounted(() => {
  if (props.epicLabsBookData?.treasureConfig) {
    initTreasure()
  }
  unsubTreasure = props.treasureService.onChange((state) => {
    gemCount.value = state.collectedCount
  })
  props.onReady?.({ collect, reset, restoreGems, resetPortalVisualState })
})

onBeforeUnmount(() => {
  unsubTreasure?.()
  removeFlyingGem()
  removeFlyingKey()
  clearAllTimers()
  keyShineAnim?.destroy()
  portal2Anim?.destroy()
  portal3Anim?.destroy()
  keyShineAnim = null
  portal2Anim = null
  portal3Anim = null
})

// ngOnChanges: bookData first set → initTreasure; page change → reset portal visuals
watch(
  () => props.epicLabsBookData,
  (data) => {
    if (data?.treasureConfig) initTreasure()
  },
)
watch(
  () => props.state.page,
  () => {
    if (props.epicLabsBookData?.treasureConfig) resetPortalVisualState()
  },
)

// Portal lottie state machine: keep all three animations resident in the DOM
// (so switching doesn't drop frames) and drive play/pause/reset from portalState.
watch(portalState, (state, prev) => {
  void prev
  nextTick(() => {
    if (state === 'default' && portalDefaultEl.value && !defaultPortalAnim) {
      defaultPortalAnim = lottie.loadAnimation({
        container: portalDefaultEl.value,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: PORTAL_PATHS.default,
      })
    }
    if (state === 'activate' && portalActivateEl.value && !portal2Anim) {
      portal2Anim = lottie.loadAnimation({
        container: portalActivateEl.value,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        path: PORTAL_PATHS.activate,
      })
      portal2Anim.addEventListener('complete', () => {
        portalState.value = 'activated'
        portal3Anim?.goToAndPlay(0, true)
        const url = gameUrl()
        if (url) emit('openGame', { gameUrl: url })
      })
      portal2Anim.goToAndPlay(0, true)
    }
    if (state === 'activated' && portalActivatedEl.value && !portal3Anim) {
      portal3Anim = lottie.loadAnimation({
        container: portalActivatedEl.value,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: PORTAL_PATHS.activated,
      })
    }
  })
})

let defaultPortalAnim: AnimationItem | null = null

// Key shine lottie: load on demand when keyState flips to 'shine'.
// keyShineEl is rendered by v-if="keyState === 'shine'", so at the moment the
// watcher fires the ref isn't bound yet — defer to nextTick so the element
// exists before lottie mounts into it. Without this, the lottie never loads,
// its 'complete' never fires, and keyAnimating stays true forever → the key
// region stays at opacity:1 (never returns to its 0.4 resting state) after a
// gem is collected.
watch(keyState, async (state) => {
  if (state !== 'shine' || keyShineAnim) return
  await nextTick()
  const el = keyShineEl.value
  if (!el || keyShineAnim) return
  keyShineAnim = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    path: KEY_SHINE_PATH,
  })
  keyShineAnim.addEventListener('complete', () => {
    keyState.value = 'normal'
    keyAnimating.value = false
    keyShineAnim?.destroy()
    keyShineAnim = null
  })
})

// --- Public methods (exposed for parent imperative calls) ---
function collect(interactionId: string, starIndex: number, starType?: string): void {
  const ts = props.treasureService
  const result = ts.collectKey(interactionId)
  if (!result.isNew) return

  props.store?.updateCloseMetrics({ hasTreasure: true })
  props.analytics?.log(EPIC_LABS_KEY_COLLECT, {
    book_id: props.bookId,
    page_index: props.state.page,
    star_index: starIndex,
    star_type: starType,
    collected_count: ts.getCollectedCount(),
    total_count: ts.getTotalCount(),
  })

  if (result.isAllCollected) {
    props.analytics?.log(EPIC_LABS_GAME_UNLOCK, {
      book_id: props.bookId,
      total_keys: ts.getTotalCount(),
    })
  }

  triggerGemAnimation(
    result.slotIndex,
    result.isAllCollected
      ? () => {
          showTreasureModal.value = true
        }
      : undefined,
  )
}

function reset(): void {
  removeFlyingGem()
  removeFlyingKey()
  portal2Anim = null
  portal3Anim = null
  defaultPortalAnim = null
  gemCount.value = 0
  filledSlotIndices.value = [false, false, false]
  keyState.value = 'normal'
  keyHidden.value = false
  keyAnimating.value = false
  portalState.value = 'hidden'
  showTreasureModal.value = false
  props.treasureService.reset()
}

function restoreGems(collectedIds: string[]): void {
  const ts = props.treasureService
  ts.restore(collectedIds)
  const filled = [...filledSlotIndices.value]
  for (const id of collectedIds) {
    const slotIndex = ts.getSlotIndex(id)
    if (slotIndex >= 0 && slotIndex < filled.length) {
      filled[slotIndex] = true
    }
  }
  filledSlotIndices.value = filled
}

function resetPortalVisualState(): void {
  removeFlyingKey()
  keyHidden.value = false
  keyState.value = 'normal'
  keyAnimating.value = false
  portalState.value = 'default'
  // Rebuild filled slots from each collected gem's REAL slotIndex (via the
  // treasure service), NOT from gemCount. The old `i < gemCount` heuristic
  // filled the first N slots in count order — which mismatched the actual
  // slot each gem flew into when gems were collected out of page order (e.g.
  // slot 1 collected before slot 0). That made a gem's color flip between
  // its fly-in (real slot) and post-page-turn display (count-order slot).
  // This mirrors restoreGems() exactly so both paths agree.
  const ts = props.treasureService
  const filled = [...filledSlotIndices.value].fill(false)
  for (const id of ts.getCollectedIds()) {
    const slotIndex = ts.getSlotIndex(id)
    if (slotIndex >= 0 && slotIndex < filled.length) {
      filled[slotIndex] = true
    }
  }
  filledSlotIndices.value = filled
}

// --- Event handlers ---
function onPortalClick(): void {
  const ts = props.treasureService
  if (portalState.value === 'activated') {
    const url = gameUrl()
    if (url) emit('openGame', { gameUrl: url })
    return
  }

  if (!ts.isGameUnlocked() || portalState.value !== 'default') {
    if (!ts.isGameUnlocked()) emit('preUnlockGameClick')
    return
  }

  if (!gameUrl()) return

  triggerKeyFlyToPortal(() => {
    portalState.value = 'activate'
    portal2Anim?.goToAndPlay(0, true)
    portalSoundRef.value?.play().catch(() => {})
    emit('portalActivated')
  })
}

function onTreasureModalClose(): void {
  showTreasureModal.value = false
}
function onTreasureModalGo(): void {
  showTreasureModal.value = false
}

// --- Treasure init ---
function initTreasure(): void {
  const data = props.epicLabsBookData
  if (!data?.treasureConfig) return
  const config = data.treasureConfig
  const keyRewardMap = new Map<string, number>()
  data.pages.forEach((page) => {
    page.stars.forEach((star: Star, starIndex: number) => {
      if (star.content?.treasure) {
        keyRewardMap.set(`${page.pageNumber}_${starIndex}`, 1)
      }
    })
  })
  props.treasureService.init(config, keyRewardMap)
  portalState.value = 'default'
  preloadGemSvgs()
  preloadLottieJsons()
  emit('treasureInitialized')
}

function preloadGemSvgs(): void {
  GEM_NORMAL_SVG_PATHS.forEach((path) => {
    const img = new Image()
    img.src = path
  })
}

function preloadLottieJsons(): void {
  const paths = [
    PORTAL_PATHS.default,
    PORTAL_PATHS.activate,
    PORTAL_PATHS.activated,
    '/assets/epic-labs/animations/key-ready/3.json',
  ]
  paths.forEach((p) => fetch(p).catch(() => {}))
}

// --- Gem fly-in animation ---
function triggerGemAnimation(slotIndex: number, onComplete?: () => void): void {
  keyAnimating.value = true
  removeFlyingGem()

  const { drawerWidth, drawerHeight } = props.drawerDimensions
  const vw = window.innerWidth
  const vh = window.innerHeight

  const gemShineSize = drawerHeight * 0.26
  const gemNormalSize = drawerHeight * 0.136
  const anchorX = vw - drawerWidth / 2
  const anchorY = vh / 2

  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:${anchorX}px;top:${anchorY}px;width:0;height:0;overflow:visible;z-index:9999;pointer-events:none;`
  document.body.appendChild(container)
  flyingGemEl = container

  const inner = document.createElement('div')
  inner.style.cssText = `position:absolute;left:0;top:0;width:${gemShineSize}px;height:${gemShineSize}px;transform-origin:50% 50%;transform:translate(-50%,-50%) scale(0);`
  container.appendChild(inner)

  const shineAnim = lottie.loadAnimation({
    container: inner,
    path: GEM_SHINE_PATHS[slotIndex] ?? GEM_SHINE_PATHS[0]!,
    renderer: 'svg',
    loop: true,
    autoplay: true,
  })

  const inner2 = document.createElement('div')
  inner2.style.cssText = `position:absolute;left:0;top:0;width:${gemNormalSize}px;height:${gemNormalSize}px;transform:translate(-50%,-50%);display:none;`
  container.appendChild(inner2)

  const normalAnim = lottie.loadAnimation({
    container: inner2,
    path: GEM_NORMAL_PATHS[slotIndex] ?? GEM_NORMAL_PATHS[0]!,
    renderer: 'svg',
    loop: true,
    autoplay: false,
  })

  shineAnim.addEventListener('DOMLoaded', () => {
    const targetRotate = GEM_ROTATES[slotIndex] ?? 0

    const appear = inner.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', offset: 0 },
        {
          transform: `translate(-50%, -50%) scale(1.1) rotate(${targetRotate * 0.15}deg)`,
          offset: 0.15,
        },
        {
          transform: `translate(-50%, -50%) scale(0.9) rotate(${targetRotate * 0.45}deg)`,
          offset: 0.45,
        },
        {
          transform: `translate(-50%, -50%) scale(1.1) rotate(${targetRotate * 0.75}deg)`,
          offset: 0.75,
        },
        {
          transform: `translate(-50%, -50%) scale(1) rotate(${targetRotate}deg)`,
          offset: 1,
        },
      ],
      { duration: 2000, easing: 'linear', fill: 'forwards' },
    )

    appear.onfinish = () => {
      appear.cancel()
      inner.style.transform = `translate(-50%, -50%) scale(1) rotate(${targetRotate}deg)`
      inner.style.opacity = '0'
      shineAnim.destroy()
      if (inner.parentNode === container) container.removeChild(inner)

      inner2.style.display = 'block'
      normalAnim.play()

      const target = getGemSlotViewportPos(slotIndex)
      if (!target) {
        removeFlyingGem()
        return
      }

      const finalSize = 24
      container.style.transition =
        'left 0.6s cubic-bezier(0.4,0,0.6,1), top 0.6s cubic-bezier(0.4,0,0.6,1)'
      container.style.left = `${target.x}px`
      container.style.top = `${target.y}px`
      inner2.style.transition = 'width 0.6s ease, height 0.6s ease'
      inner2.style.width = `${finalSize}px`
      inner2.style.height = `${finalSize}px`

      scheduleTimer(() => {
        normalAnim.destroy()
        removeFlyingGem()
        const filled = [...filledSlotIndices.value]
        if (slotIndex >= 0 && slotIndex < filled.length) filled[slotIndex] = true
        filledSlotIndices.value = filled
        keyState.value = 'shine'
        onComplete?.()
      }, 700)
    }
  })
}

function removeFlyingGem(): void {
  if (flyingGemEl?.parentNode) flyingGemEl.parentNode.removeChild(flyingGemEl)
  flyingGemEl = null
}

// --- Key fly-to-portal animation ---
function triggerKeyFlyToPortal(onArrival: () => void): void {
  removeFlyingKey()

  const keyWrap = keyWrapEl.value
  const portal = portalEl.value
  if (!keyWrap || !portal) {
    onArrival()
    return
  }

  const keyRect = keyWrap.getBoundingClientRect()
  const portalRect = portal.getBoundingClientRect()

  keyHidden.value = true

  const startX = keyRect.left + keyRect.width / 2
  const startY = keyRect.top + keyRect.height / 2
  const endX = portalRect.left + portalRect.width / 2
  const endY = portalRect.top + portalRect.height * 0.37

  const KEY_FLY_END_SCALE = 0.4
  const TILT_MS = 100
  const FLY_MS = 1000
  const STRAIGHTEN_MS = 100

  const img = document.createElement('img')
  img.src = KEY_NORMAL
  img.setAttribute('draggable', 'false')
  img.style.cssText = `position:fixed;width:${keyRect.width}px;height:${keyRect.height}px;left:${startX}px;top:${startY}px;transform:translate(-50%,-50%) rotate(0deg) scale(1);z-index:9999;pointer-events:none;`
  document.body.appendChild(img)
  flyingKeyEl = img

  // force reflow so the first transition takes
  void img.offsetWidth

  // Phase 1: tilt
  img.style.transition = `transform ${TILT_MS}ms ease`
  img.style.transform = 'translate(-50%,-50%) rotate(-15deg) scale(1)'

  scheduleTimer(() => {
    // Phase 2: fly to portal + shrink
    img.style.transition = `left ${FLY_MS}ms cubic-bezier(0.4,0,0.6,1), top ${FLY_MS}ms cubic-bezier(0.4,0,0.6,1), transform ${FLY_MS}ms ease`
    img.style.left = `${endX}px`
    img.style.top = `${endY}px`
    img.style.transform = `translate(-50%,-50%) rotate(-15deg) scale(${KEY_FLY_END_SCALE})`

    scheduleTimer(() => {
      // Phase 3: straighten
      img.style.transition = `transform ${STRAIGHTEN_MS}ms ease`
      img.style.transform = `translate(-50%,-50%) rotate(0deg) scale(${KEY_FLY_END_SCALE})`

      scheduleTimer(() => {
        removeFlyingKey()
        onArrival()
      }, STRAIGHTEN_MS)
    }, FLY_MS)
  }, TILT_MS)
}

function removeFlyingKey(): void {
  if (flyingKeyEl?.parentNode) flyingKeyEl.parentNode.removeChild(flyingKeyEl)
  flyingKeyEl = null
}

function getGemSlotViewportPos(slotIndex: number): { x: number; y: number } | null {
  const keyWrap = keyWrapEl.value
  if (!keyWrap) return null
  const rect = keyWrap.getBoundingClientRect()
  const slots = [
    { xPct: 0.21, yPct: 0.3 },
    { xPct: 0.495, yPct: 0.3 },
    { xPct: 0.815, yPct: 0.31 },
  ]
  const slot = slots[slotIndex] ?? slots[0]!
  return {
    x: rect.left + slot.xPct * rect.width,
    y: rect.top + slot.yPct * rect.height,
  }
}
</script>

<template>
  <div v-if="epicLabsBookData?.treasureConfig" class="key-gem-overlay">
    <!-- Key layer -->
    <div
      ref="keyEl"
      class="key-overlay"
      :class="{ 'key-overlay--animating': keyAnimating }"
      :style="{ visibility: keyHidden ? 'hidden' : undefined }"
    >
      <div class="key-overlay__base"></div>
      <div
        ref="keyWrapEl"
        class="key-overlay__key-wrap"
      >
        <img
          class="key-overlay__img"
          :class="{ 'key-overlay__img--no-shadow': keyState === 'shine' }"
          :src="KEY_NORMAL"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <div
          v-if="keyState === 'shine'"
          ref="keyShineEl"
          class="key-overlay__img key-overlay__img--lottie"
        ></div>

        <div
          class="key-overlay__gem key-overlay__gem--0"
          :class="{ 'key-overlay__gem--visible': filledSlotIndices[0] }"
        >
          <img
            v-if="filledSlotIndices[0]"
            :src="GEM_NORMAL_SVG_PATHS[0]"
            alt=""
            aria-hidden="true"
            draggable="false"
          />
        </div>
        <div
          class="key-overlay__gem key-overlay__gem--1"
          :class="{ 'key-overlay__gem--visible': filledSlotIndices[1] }"
        >
          <img
            v-if="filledSlotIndices[1]"
            :src="GEM_NORMAL_SVG_PATHS[1]"
            alt=""
            aria-hidden="true"
            draggable="false"
          />
        </div>
        <div
          class="key-overlay__gem key-overlay__gem--2"
          :class="{ 'key-overlay__gem--visible': filledSlotIndices[2] }"
        >
          <img
            v-if="filledSlotIndices[2]"
            :src="GEM_NORMAL_SVG_PATHS[2]"
            alt=""
            aria-hidden="true"
            draggable="false"
          />
        </div>
      </div>
    </div>

    <!-- Portal layer -->
    <div
      v-if="portalVisible"
      ref="portalEl"
      class="portal-overlay"
      :style="{
        left: (epicLabsBookData?.portalConfig?.xPercent ?? 0) + '%',
        top: (epicLabsBookData?.portalConfig?.yPercent ?? 0) + '%',
      }"
    >
      <div v-if="portalTooltipText" class="portal-tooltip">
        <div class="portal-tooltip__bubble">
          <div class="portal-tooltip__inner">
            <div class="portal-tooltip__text" v-html="portalTooltipText"></div>
          </div>
        </div>
      </div>

      <div class="portal-anims">
        <div
          ref="portalDefaultEl"
          class="portal-anim"
          :class="{ 'portal-anim--active': portalState === 'default' }"
        ></div>
        <div
          ref="portalActivateEl"
          class="portal-anim portal-anim--stack"
          :class="{ 'portal-anim--active': portalState === 'activate' }"
        ></div>
        <div
          ref="portalActivatedEl"
          class="portal-anim portal-anim--stack"
          :class="{ 'portal-anim--active': portalState === 'activated' }"
        ></div>
      </div>

      <button class="portal-click-zone" type="button" aria-label="Open portal" @click="onPortalClick"></button>

      <audio ref="portalSoundRef" :src="PORTAL_SOUND_PATH" preload="auto"></audio>
    </div>

    <!-- Treasure modal -->
    <TreasureModal
      v-if="showTreasureModal"
      @go="onTreasureModalGo"
      @closed="onTreasureModalClose"
    />
  </div>
</template>
