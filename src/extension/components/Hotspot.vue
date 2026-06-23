<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import type { DrawerStore } from '../composables/useDrawerStore'

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const phase = ref<'question' | 'wrong-feedback'>('question')
const wrongShake = ref(false)

let completed = false
let unsubResult: (() => void) | null = null
let shakeTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  const store = props.store
  if (!store) return

  if (props.content?.hotspotRegion && props.content?.wrongRegion) {
    store.sendInteractionCommand({
      type: 'show-hotspot-regions',
      correctRegion: props.content.hotspotRegion,
      wrongRegion: props.content.wrongRegion,
    })
  }

  unsubResult = store.interactionResult.on((r) => {
    if (r?.type !== 'hotspot-tapped') return
    if (!completed) {
      completed = true
      emit('complete', { type: 'hotspot', data: { isCorrect: r.isCorrect } })
    }
    if (!r.isCorrect) {
      wrongShake.value = true
      if (shakeTimer) clearTimeout(shakeTimer)
      shakeTimer = setTimeout(() => {
        wrongShake.value = false
      }, 600)
    }
  })
})

function onGotIt() {
  props.store?.closeDrawer()
}

onUnmounted(() => {
  unsubResult?.()
  if (shakeTimer) clearTimeout(shakeTimer)
  props.store?.sendInteractionCommand({ type: 'clear-highlights' })
})
</script>

<template>
  <div class="hs-root">
    <!-- Question phase -->
    <div
      v-if="phase === 'question'"
      class="hs-question"
      :class="{ 'hs-question--shake': wrongShake }"
    >
      <!-- Background image is a host asset (epic-labs/flashcard/front-8.png);
           fall back to a solid color when unavailable. -->
      <div class="hs-question__bg"></div>
      <div class="hs-question__body">
        <p class="hs-question__text">{{ content?.hotspotQuestion }}</p>
      </div>
    </div>
  </div>
</template>
