<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { StarContent, DrawerCompleteEvent, DragFillItem } from '../types'
import { DragFillLogic } from '../logic/drag-fill.logic'
import type { DragFillState } from '../logic/drag-fill.logic'
import type { DrawerStore } from '../composables/useDrawerStore'

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const TIMER_DURATION_MS = 10_000

const state = reactive<DragFillState>({
  placedItemIds: [],
  dragCount: 0,
  isComplete: false,
})
const timerPct = ref(100)
const draggingItemId = ref<string | null>(null)

let logic: DragFillLogic | null = null
let dragGhostEl: HTMLImageElement | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null
let timerStart = 0
let successAudio: HTMLAudioElement | null = null
let unsubResult: (() => void) | null = null
let boundMoveHandler: ((e: PointerEvent) => void) | null = null
let boundUpHandler: ((e: PointerEvent) => void) | null = null

const timerLabel = computed(
  () =>
    Math.ceil((timerPct.value / 100) * (TIMER_DURATION_MS / 1000)) + 'S',
)

function syncState() {
  if (!logic) return
  const s = logic.getState()
  state.placedItemIds = s.placedItemIds
  state.dragCount = s.dragCount
  state.isComplete = s.isComplete
}

function playSuccessAudio() {
  const url = props.content?.dragFillSuccessAudioUrl
  if (!url) return
  successAudio = new Audio(url)
  successAudio.play().catch(() => {})
}

function isPlaced(item: DragFillItem): boolean {
  return state.placedItemIds.includes(item.id)
}
function isDragging(item: DragFillItem): boolean {
  return draggingItemId.value === item.id
}

function startDrag(event: PointerEvent, item: DragFillItem) {
  if (isPlaced(item)) return
  event.preventDefault()

  draggingItemId.value = item.id
  props.store?.setDraggingItemId(item.id)

  const ghost = document.createElement('img')
  ghost.src = item.imageUrl
  ghost.draggable = false
  ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:80px;height:80px;object-fit:contain;opacity:0.85;transform:translate(-50%,-50%);left:${event.clientX}px;top:${event.clientY}px;`
  document.body.appendChild(ghost)
  dragGhostEl = ghost

  boundMoveHandler = (e: PointerEvent) => {
    if (!dragGhostEl) return
    dragGhostEl.style.left = `${e.clientX}px`
    dragGhostEl.style.top = `${e.clientY}px`
  }
  boundUpHandler = () => {
    // Drop detection is handled by the drop zones in the reading area.
    // Just clean up the ghost here.
    cleanupDrag()
    props.store?.setDraggingItemId(null)
  }
  document.addEventListener('pointermove', boundMoveHandler, { passive: true })
  document.addEventListener('pointerup', boundUpHandler)
}

function cleanupDrag() {
  if (dragGhostEl) {
    dragGhostEl.remove()
    dragGhostEl = null
  }
  if (boundMoveHandler) {
    document.removeEventListener('pointermove', boundMoveHandler)
    boundMoveHandler = null
  }
  if (boundUpHandler) {
    document.removeEventListener('pointerup', boundUpHandler)
    boundUpHandler = null
  }
  draggingItemId.value = null
}

function startTimer() {
  clearTimer()
  timerStart = Date.now()
  timerPct.value = 100
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - timerStart
    const pct = Math.max(0, 100 - (elapsed / TIMER_DURATION_MS) * 100)
    timerPct.value = pct
    if (pct <= 0) clearTimer()
  }, 100)
}

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

onMounted(() => {
  const store = props.store
  const items = props.content?.dragFillItems || []
  logic = new DragFillLogic(items)
  logic.onChange(syncState)
  syncState()
  startTimer()

  // Tell reading area to show drop zones and inject temp_page
  store?.sendInteractionCommand({
    type: 'highlight-drag-targets',
    items,
    tempPageUrl: props.content?.dragFillTempPageUrl,
    tempPageDirection: props.content?.dragFillTempPageDirection ?? 'right',
  })

  // Listen for drop results from reading area
  unsubResult = store?.interactionResult.on((result) => {
    if (!result || result.type !== 'item-dropped') return
    if (result.isCorrect) {
      const s = logic?.placeItem(result.itemId)
      if (s?.isComplete) {
        clearTimer()
        playSuccessAudio()
        emit('complete', {
          type: 'drag-fill',
          data: {
            isComplete: true,
            dragCount: s.dragCount,
          },
        })
      }
    } else {
      logic?.recordMiss()
    }
  }) ?? null
})

onUnmounted(() => {
  cleanupDrag()
  clearTimer()
  unsubResult?.()
  props.store?.sendInteractionCommand({ type: 'clear-highlights' })
  props.store?.setDraggingItemId(null)
  if (successAudio) {
    successAudio.pause()
    successAudio = null
  }
})
</script>

<template>
  <div class="df-root">
    <div class="df-timer-row">
      <span class="df-timer-secs">{{ timerLabel }}</span>
      <div class="df-timer-bar">
        <div class="df-timer-fill" :style="{ width: timerPct + '%' }"></div>
      </div>
    </div>
    <p class="df-instruction">Drag both pieces into the picture.</p>

    <div class="df-items">
      <div
        v-for="item in logic?.getItems() || []"
        :key="item.id"
        class="df-item"
        :class="{
          'df-item--placed': isPlaced(item),
          'df-item--dragging': isDragging(item),
          'df-item--draggable': !isPlaced(item),
        }"
        @pointerdown="startDrag($event, item)"
      >
        <img
          :src="item.imageUrl"
          :alt="item.label || ''"
          class="df-item__img"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>
