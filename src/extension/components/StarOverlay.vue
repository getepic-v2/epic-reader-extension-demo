<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { ExtensionContext, Star, DragFillItem, HotspotRegion, ClickVideo } from '../types'
import type { DrawerStore, InteractionCommand } from '../composables/useDrawerStore'
import type { InteractionMemory } from '../composables/useInteractionMemory'
import { dfX, dfW, hsX, hsW } from '../utils/coords'

const props = defineProps<{
  context: ExtensionContext
  state: {
    page: number
    bookId: number | undefined
    stars: Star[]
    clickVideos: ClickVideo[]
  }
  store?: DrawerStore
  memory?: InteractionMemory
}>()

const STAR_LOTTIE_PATH = '/assets/epic-labs/animations/star/'
const GAME_LOTTIE_PATH = '/assets/epic-labs/animations/game/'
const CLICK_VIDEO_ICON = '/assets/epic-labs/mark/finger-point.svg'

const starRefs = ref<Map<number, HTMLElement>>(new Map())
const animations: AnimationItem[] = []
const flipBookStyle = ref<Record<string, string>>({})
const starContainerEl = ref<HTMLElement | null>(null)
/** Injected click-video <video> elements, keyed by cv index. */
const clickVideoEls = new Map<number, HTMLVideoElement>()

// --- reading-area interaction layers (drag-fill / hotspot) ---
const dragFillDropZones = ref<DragFillItem[]>([])
const dragFillPlacedItems = ref<DragFillItem[]>([])
const dragFillDirection = ref<'left' | 'right'>('right')
const dragFillTempPageUrl = ref<string | undefined>(undefined)
const hotspotCorrectRegion = ref<HotspotRegion | null>(null)
const hotspotWrongRegion = ref<HotspotRegion | null>(null)
const hotspotTappedState = ref<'correct' | 'wrong' | null>(null)
const clickVideoPlaying = ref<Set<number>>(new Set())

let unsubCommand: (() => void) | null = null
let hotspotClearTimer: ReturnType<typeof setTimeout> | null = null

function setStarRef(el: any, index: number) {
  if (el) {
    starRefs.value.set(index, el as HTMLElement)
  } else {
    starRefs.value.delete(index)
  }
}

function updateFlipBookPosition() {
  const rect = props.context.data.getFlipBookRect()
  if (!rect) return

  // The slot host element is our positioned ancestor — use it as reference
  const slotHost = (props.context.slots.get('reading-area') as ShadowRoot).host
  if (!slotHost) return
  const hostRect = slotHost.getBoundingClientRect()

  flipBookStyle.value = {
    position: 'absolute',
    top: `${rect.y - hostRect.y}px`,
    left: `${rect.x - hostRect.x}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: 'none',
  }
}

function initLottieAnimations() {
  animations.forEach((a) => a.destroy())
  animations.length = 0

  props.state.stars.forEach((star, index) => {
    const container = starRefs.value.get(index)
    if (!container) return

    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: star.type === 'game' ? GAME_LOTTIE_PATH + 'game.json' : STAR_LOTTIE_PATH + 'star.json',
    })
    animations.push(anim)
  })
}

function onStarClick(star: Star, starIndex: number) {
  props.context.commands.execute('openDrawer', { star, starIndex })
}

const isGameStar = (star: Star) => star.type === 'game'

// --- interaction handlers ---

/** drag-fill: pointer released over a drop zone */
function onDropZonePointerUp(zone: DragFillItem) {
  const store = props.store
  if (!store) return
  const draggingId = store.getDraggingItemId()

  // No item being dragged → treat as Place button click → open drawer
  if (!draggingId) {
    const dragFillStar = props.state.stars.find((s) => s.type === 'drag-fill')
    if (dragFillStar) {
      const idx = props.state.stars.indexOf(dragFillStar)
      onStarClick(dragFillStar, idx)
    }
    return
  }

  const isCorrect = draggingId === zone.id
  store.sendInteractionResult({
    type: 'item-dropped',
    itemId: zone.id,
    slotId: zone.id,
    isCorrect,
  })

  if (isCorrect) {
    dragFillPlacedItems.value = [...dragFillPlacedItems.value, zone]
    if (dragFillPlacedItems.value.length >= dragFillDropZones.value.length) {
      // all zones filled — clear the interaction layer (incl. temp_page so the
      // original book page shows through again)
      dragFillPlacedItems.value = []
      dragFillDropZones.value = []
      dragFillTempPageUrl.value = undefined
    }
  }
}

function isDragFillPlaced(zoneId: string): boolean {
  return dragFillPlacedItems.value.some((z) => z.id === zoneId)
}

/** hotspot: user tapped a (correct or wrong) region */
function onHotspotTap(isCorrect: boolean) {
  const store = props.store
  hotspotTappedState.value = isCorrect ? 'correct' : 'wrong'
  store?.sendInteractionResult({ type: 'hotspot-tapped', isCorrect })
  if (!isCorrect) {
    if (hotspotClearTimer) clearTimeout(hotspotClearTimer)
    hotspotClearTimer = setTimeout(() => {
      hotspotTappedState.value = null
    }, 600)
  }
}

/**
 * Inject the click-video's <video> over the book page (inline overlay), played
 * muted + autoplay. On 'ended' the video is removed and the finger-point button
 * reappears. Ported from EpicWeb injectClickVideoContent — EpicWeb injected a
 * width:200% video across two page slots; the SDK reading-area slot host IS the
 * full spread, so one width:100% video covers it.
 */
function onClickVideoClick(index: number) {
  const cv = props.state.clickVideos?.[index]
  if (!cv || clickVideoPlaying.value.has(index)) return
  clickVideoPlaying.value = new Set(clickVideoPlaying.value).add(index)

  const container = starContainerEl.value
  if (!container) return

  const video = document.createElement('video')
  video.src = cv.url
  video.muted = true
  video.autoplay = true
  video.loop = false
  video.setAttribute('playsinline', '')
  video.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:2;'
  video.addEventListener('ended', () => {
    video.remove()
    clickVideoEls.delete(index)
    const next = new Set(clickVideoPlaying.value)
    next.delete(index)
    clickVideoPlaying.value = next
  })
  container.appendChild(video)
  clickVideoEls.set(index, video)
}

function clearClickVideoContent() {
  for (const video of clickVideoEls.values()) video.remove()
  clickVideoEls.clear()
  clickVideoPlaying.value = new Set()
}

/**
 * drag-fill pages auto-show their drop zones + temp_page as soon as the page is
 * reached — the user taps a + Place button to open the drawer and drag. Ported
 * from EpicWeb EpicLabsComponent.autoInjectDragFillIfNeeded. Skipped when the
 * card is already completed this session (so a finished fill-in-the-blank
 * reverts to the original page instead of re-showing empty slots).
 */
function autoInjectDragFill() {
  const stars = props.state.stars || []
  const dragFillStar = stars.find((s) => s.type === 'drag-fill')
  if (!dragFillStar) return
  const dragFillIndex = stars.indexOf(dragFillStar)
  if (props.memory?.isCardCompleted(props.state.page, dragFillIndex)) return

  const content = dragFillStar.content
  dragFillDropZones.value = content.dragFillItems ?? []
  dragFillPlacedItems.value = []
  dragFillDirection.value = content.dragFillTempPageDirection ?? 'right'
  dragFillTempPageUrl.value = content.dragFillTempPageUrl
}

function handleCommand(cmd: InteractionCommand) {
  if (cmd.type === 'highlight-drag-targets') {
    dragFillDropZones.value = cmd.items
    dragFillPlacedItems.value = []
    dragFillDirection.value = cmd.tempPageDirection ?? 'right'
    // temp_page is the fill-in-the-blank "question" image that overlays the
    // entire book page (ported from epic-labs injectDragFillTempPage). The
    // SDK's reading-area slot host IS the full 2-page spread, so a single
    // width:100% image covers it (EpicWeb needed width:200% across two slots).
    dragFillTempPageUrl.value = cmd.tempPageUrl
  } else if (cmd.type === 'show-hotspot-regions') {
    hotspotCorrectRegion.value = cmd.correctRegion
    hotspotWrongRegion.value = cmd.wrongRegion
  } else if (cmd.type === 'clear-highlights') {
    // Drawer closed — clear hotspot highlights only. drag-fill drop zones
    // persist until completion or page turn.
    hotspotCorrectRegion.value = null
    hotspotWrongRegion.value = null
    hotspotTappedState.value = null
  }
}

watch(
  () => props.state.page,
  async () => {
    // page turn — reset interaction layers
    dragFillDropZones.value = []
    dragFillPlacedItems.value = []
    dragFillTempPageUrl.value = undefined
    hotspotCorrectRegion.value = null
    hotspotWrongRegion.value = null
    hotspotTappedState.value = null
    clearClickVideoContent()
    await nextTick()
    autoInjectDragFill()
    initLottieAnimations()
  },
)

let flipBookResizeObserver: ResizeObserver | null = null

onMounted(() => {
  updateFlipBookPosition()
  nextTick(() => initLottieAnimations())
  autoInjectDragFill()
  unsubCommand = props.store?.interactionCommand.on(handleCommand) ?? null

  // The flip-book rect (getFlipBookRect) may not be available at mount time —
  // the reader hydrates asynchronously, and the rect also changes on page
  // turns / window resize. Without re-fetching, .star-overlay keeps a stale
  // (or empty {}) style, so .star-container collapses to 0×0 and every cqh-
  // based size (drop-zone btn/plus/label, star-button) computes to 0 → the
  // whole interaction layer is invisible. Observe the slot host: whenever its
  // layout changes, recompute the flip-book position.
  const slotHost = (props.context.slots.get('reading-area') as ShadowRoot)?.host
  if (slotHost && typeof ResizeObserver !== 'undefined') {
    flipBookResizeObserver = new ResizeObserver(() => {
      updateFlipBookPosition()
    })
    flipBookResizeObserver.observe(slotHost)
  }
})

onBeforeUnmount(() => {
  flipBookResizeObserver?.disconnect()
  flipBookResizeObserver = null
  animations.forEach((a) => a.destroy())
  animations.length = 0
  clearClickVideoContent()
  unsubCommand?.()
  if (hotspotClearTimer) clearTimeout(hotspotClearTimer)
})
</script>

<template>
  <div class="star-overlay" :style="flipBookStyle">
    <div class="star-container" ref="starContainerEl">
      <!-- drag-fill temp_page: fill-in-the-blank question image overlaid on the
           whole book page while drag-fill is active -->
      <img
        v-if="dragFillTempPageUrl"
        :src="dragFillTempPageUrl"
        class="drag-fill-temp-page"
        draggable="false"
        aria-hidden="true"
      />

      <!-- Stars (skip drag-fill — it has no star button, only drop zones) -->
      <button
        v-for="(star, index) in state.stars"
        :key="`${state.page}-${index}`"
        v-show="star.type !== 'drag-fill'"
        class="star-button"
        :class="{ 'star-button--star': !isGameStar(star) }"
        :style="{
          left: (star.coordinates.x * 100) + '%',
          top: (star.coordinates.y * 100) + '%',
        }"
        type="button"
        :aria-label="`Interactive ${star.type} content`"
        @click="onStarClick(star, index)"
      >
        <span
          :class="isGameStar(star) ? 'game-lottie' : 'star-lottie'"
          :ref="(el) => setStarRef(el, index)"
        />
      </button>

      <!-- drag-fill drop zones (full 2-page spread coordinates) -->
      <div
        v-for="zone in dragFillDropZones"
        :key="'zone-' + zone.id"
        class="drag-fill-drop-zone"
        :class="{ 'drag-fill-drop-zone--placed': isDragFillPlaced(zone.id) }"
        :style="{
          left: dfX(zone.targetXPercent, dragFillDirection) + '%',
          top: zone.targetYPercent + '%',
          width: dfW(zone.targetWidthPercent) + '%',
          height: zone.targetHeightPercent + '%',
        }"
        @pointerup="onDropZonePointerUp(zone)"
      >
        <div class="drag-fill-drop-zone__btn">
          <span class="drag-fill-drop-zone__plus">+</span>
          <span class="drag-fill-drop-zone__label">Place</span>
        </div>
      </div>

      <!-- drag-fill placed item images -->
      <img
        v-for="placed in dragFillPlacedItems"
        :key="'placed-' + placed.id"
        :src="placed.imageUrl"
        class="drag-fill-placed-item"
        :style="{
          left: dfX(placed.targetXPercent, dragFillDirection) + '%',
          top: placed.targetYPercent + '%',
          width: dfW(placed.targetWidthPercent) + '%',
          height: placed.targetHeightPercent + '%',
        }"
        draggable="false"
      />

      <!-- hotspot tap regions -->
      <button
        v-if="hotspotCorrectRegion"
        class="hotspot-region hotspot-region--correct"
        :class="{
          'hotspot-region--tapped-correct': hotspotTappedState === 'correct',
          'hotspot-region--tapped': hotspotTappedState !== null,
        }"
        :style="{
          left: hsX(hotspotCorrectRegion.x - hotspotCorrectRegion.width / 2, hotspotCorrectRegion.direction) + '%',
          top: (hotspotCorrectRegion.y - hotspotCorrectRegion.height / 2) + '%',
          width: hsW(hotspotCorrectRegion.width) + '%',
          height: hotspotCorrectRegion.height + '%',
        }"
        @click="onHotspotTap(true)"
      >
        <span class="hotspot-region__cursor" aria-hidden="true"></span>
      </button>
      <button
        v-if="hotspotWrongRegion"
        class="hotspot-region hotspot-region--wrong"
        :class="{
          'hotspot-region--tapped-wrong': hotspotTappedState === 'wrong',
          'hotspot-region--tapped': hotspotTappedState !== null,
        }"
        :style="{
          left: hsX(hotspotWrongRegion.x - hotspotWrongRegion.width / 2, hotspotWrongRegion.direction) + '%',
          top: (hotspotWrongRegion.y - hotspotWrongRegion.height / 2) + '%',
          width: hsW(hotspotWrongRegion.width) + '%',
          height: hotspotWrongRegion.height + '%',
        }"
        @click="onHotspotTap(false)"
      >
        <span class="hotspot-region__cursor" aria-hidden="true"></span>
      </button>

      <!-- click-video buttons -->
      <template v-for="(cv, i) in state.clickVideos || []" :key="'cv-' + i">
        <button
          v-if="!clickVideoPlaying.has(i)"
          class="click-video-button"
          :style="{
            left: (cv.coordinates.x * 100) + '%',
            top: (cv.coordinates.y * 100) + '%',
          }"
          @click="onClickVideoClick(i)"
        >
          <img
            class="click-video-icon"
            :src="CLICK_VIDEO_ICON"
            alt=""
            aria-hidden="true"
          />
        </button>
      </template>
    </div>
  </div>
</template>
