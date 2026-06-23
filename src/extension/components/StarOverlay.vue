<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { ExtensionContext, Star, DragFillItem, HotspotRegion, ClickVideo } from '../types'
import type { DrawerStore, InteractionCommand } from '../composables/useDrawerStore'
import { dfX, dfW, hsX, hsW } from '../utils/coords'

const props = defineProps<{
  context: ExtensionContext
  state: {
    page: number
    bookId: number | undefined
    stars: Star[]
  }
  store?: DrawerStore
  clickVideos?: ClickVideo[]
}>()

const STAR_LOTTIE_PATH = '/assets/epic-labs/animations/star/'
const GAME_LOTTIE_PATH = '/assets/epic-labs/animations/game/'

const starRefs = ref<Map<number, HTMLElement>>(new Map())
const animations: AnimationItem[] = []
const flipBookStyle = ref<Record<string, string>>({})

// --- reading-area interaction layers (drag-fill / hotspot) ---
const dragFillDropZones = ref<DragFillItem[]>([])
const dragFillPlacedItems = ref<DragFillItem[]>([])
const dragFillDirection = ref<'left' | 'right'>('right')
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
      // all zones filled — clear the interaction layer
      dragFillPlacedItems.value = []
      dragFillDropZones.value = []
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

function onClickVideoClick(index: number) {
  clickVideoPlaying.value.add(index)
  // TODO(stage 4): open video modal with props.clickVideos[index].url
  console.log('[epic-labs] click video', index, props.clickVideos?.[index]?.url)
}

function handleCommand(cmd: InteractionCommand) {
  if (cmd.type === 'highlight-drag-targets') {
    dragFillDropZones.value = cmd.items
    dragFillPlacedItems.value = []
    dragFillDirection.value = cmd.tempPageDirection ?? 'right'
    // Note: epic-labs also injects a temp_page background image across both
    // page slots here. That requires manipulating sibling slots and is
    // deferred — the placed-item images themselves mark filled slots.
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
    hotspotCorrectRegion.value = null
    hotspotWrongRegion.value = null
    hotspotTappedState.value = null
    clickVideoPlaying.value.clear()
    await nextTick()
    initLottieAnimations()
  },
)

onMounted(() => {
  updateFlipBookPosition()
  nextTick(() => initLottieAnimations())
  unsubCommand = props.store?.interactionCommand.on(handleCommand) ?? null
})

onBeforeUnmount(() => {
  animations.forEach((a) => a.destroy())
  animations.length = 0
  unsubCommand?.()
  if (hotspotClearTimer) clearTimeout(hotspotClearTimer)
})
</script>

<template>
  <div class="star-overlay" :style="flipBookStyle">
    <div class="star-container">
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
      <template v-for="(cv, i) in clickVideos || []" :key="'cv-' + i">
        <button
          v-if="!clickVideoPlaying.has(i)"
          class="click-video-button"
          :style="{
            left: (cv.coordinates.x * 100) + '%',
            top: (cv.coordinates.y * 100) + '%',
          }"
          @click="onClickVideoClick(i)"
        >
          <span class="click-video-icon">▶</span>
        </button>
      </template>
    </div>
  </div>
</template>
