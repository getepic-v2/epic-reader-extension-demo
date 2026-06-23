<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'

/**
 * "Your key is ready!" celebration modal shown the moment all keys are
 * collected and the portal game unlocks. Ported 1:1 from EpicWeb
 * TreasureModalComponent.
 *
 * The Angular version leaks: setTimeout has no handle and `new Audio` has no
 * reference, with no OnDestroy. The Vue port cleans both up on unmount.
 */
defineEmits<{
  (e: 'go'): void
  (e: 'closed'): void
}>()

const KEY_ANIM_PATH = '/assets/epic-labs/animations/key-ready/3.json'
const SOUND_PATH = '/assets/epic-labs/animations/key-ready/sc03.mp3'
const RIBBON_SVG = '/assets/epic-labs/treasure-modal-ribbon.svg'
const KEY_SM_PNG = '/assets/epic-labs/treasure-modal-key-sm.png'

const title = 'Your key is ready!'
const body =
  'Keep exploring—the door is waiting in the story. Unlock it for a surprise!'

const visible = ref(false)
const animEl = ref<HTMLElement>()
let anim: AnimationItem | null = null
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let audio: HTMLAudioElement | null = null

onMounted(() => {
  if (animEl.value) {
    anim = lottie.loadAnimation({
      container: animEl.value,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: KEY_ANIM_PATH,
    })
    anim.addEventListener('DOMLoaded', onLottieReady)
  }

  audio = new Audio(SOUND_PATH)
  audio.play().catch(() => {
    // autoplay may be blocked
  })
})

function onLottieReady() {
  // Defer the fade-in one tick so the lottie SVG is painted first.
  fadeTimer = setTimeout(() => {
    visible.value = true
  })
}

onBeforeUnmount(() => {
  if (fadeTimer) clearTimeout(fadeTimer)
  anim?.destroy()
  anim = null
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    audio = null
  }
})
</script>

<template>
  <div class="tm-overlay" @click.stop>
    <div class="tm-scrim"></div>

    <div class="tm-content" :class="{ 'tm-content--visible': visible }">
      <div class="tm-title-wrap">
        <img
          class="tm-ribbon"
          :src="RIBBON_SVG"
          alt=""
          aria-hidden="true"
        />
        <h2 class="tm-title">{{ title }}</h2>
      </div>

      <div ref="animEl" class="tm-key-anim"></div>

      <div class="tm-body-row">
        <img
          class="tm-key-sm"
          :src="KEY_SM_PNG"
          alt=""
          aria-hidden="true"
        />
        <p class="tm-body">{{ body }}</p>
      </div>

      <button class="tm-btn" @click="$emit('go')">Let's go!</button>
    </div>
  </div>
</template>
