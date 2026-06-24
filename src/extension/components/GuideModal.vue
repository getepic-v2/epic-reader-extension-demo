<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { EpicLabsGuideModalResult } from '../types'

/**
 * First-visit onboarding guide. Ported 1:1 from EpicWeb GuideModalComponent.
 *
 * Two stacked lottie animations: an "appear" intro that plays once, then a
 * "loop" animation takes over. A sound clip plays on mount (autoplay may be
 * blocked by the browser — failures are swallowed). The user either starts
 * reading or asks not to be shown again; the parent persists the choice.
 */
const emit = defineEmits<{
  (e: 'closed', result: EpicLabsGuideModalResult): void
}>()

const APPEAR_PATH = '/assets/epic-labs/animations/guide/1.json'
const LOOP_PATH = '/assets/epic-labs/animations/guide/2.json'
const SOUND_PATH = '/assets/epic-labs/animations/guide/sc01.mp3'
const BUDDY_SVG = '/assets/epic-labs/onboarding-buddy.svg'
const BG_SVG = '/assets/epic-labs/animations/guide/guide-anim-bg.svg'
const STAR_SVG = '/assets/epic-labs/mark/star.svg'

const phase = ref<'appear' | 'loop'>('appear')
const appearEl = ref<HTMLElement>()
const loopEl = ref<HTMLElement>()
const soundEl = ref<HTMLAudioElement>()

let appearAnim: AnimationItem | null = null
let loopAnim: AnimationItem | null = null

function onAppearComplete() {
  phase.value = 'loop'
  loopAnim?.play()
}

onMounted(() => {
  if (appearEl.value) {
    appearAnim = lottie.loadAnimation({
      container: appearEl.value,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      path: APPEAR_PATH,
    })
    appearAnim.addEventListener('complete', onAppearComplete)
  }
  if (loopEl.value) {
    loopAnim = lottie.loadAnimation({
      container: loopEl.value,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      path: LOOP_PATH,
    })
  }
  playSound()
})

function playSound() {
  try {
    soundEl.value?.play()
  } catch {
    // autoplay may be blocked
  }
}

function dontShowAgain() {
  emit('closed', 'dont-show')
}

function startReading() {
  emit('closed', 'start')
}

onBeforeUnmount(() => {
  appearAnim?.destroy()
  loopAnim?.destroy()
  appearAnim = null
  loopAnim = null
})
</script>

<template>
  <div class="guide-modal-overlay">
    <div class="guide-modal-wrapper">
      <img
        class="guide-modal-buddy"
        :src="BUDDY_SVG"
        alt=""
        aria-hidden="true"
      />
    <div class="guide-modal-container">
      <button
        class="guide-modal-close"
        aria-label="Close"
        type="button"
        @click="startReading"
      ></button>
      <h2>Welcome to Interactive Books!</h2>

      <div class="guide-modal-lottie">
        <img
          class="guide-modal-lottie__bg"
          :src="BG_SVG"
          alt=""
          aria-hidden="true"
        />
        <div class="guide-modal-lottie__anim">
          <div
            ref="appearEl"
            class="guide-modal-lottie__appear"
            :class="{ 'guide-modal-lottie__appear--hidden': phase === 'loop' }"
          ></div>
          <div
            ref="loopEl"
            class="guide-modal-lottie__loop"
            :class="{ 'guide-modal-lottie__loop--visible': phase === 'loop' }"
          ></div>
        </div>
      </div>

      <p class="guide-description">
        Explore and read closely — tap the stars<img
          class="guide-modal-star"
          :src="STAR_SVG"
          alt=""
          aria-hidden="true"
        />
        <br />
        to discover hidden gems! Grab all 3 to unlock the key...
        <br />and a secret surprise awaits! ✨
      </p>

      <button class="epic-btn epic-btn--l" @click="startReading">
        Start Reading!
      </button>
      <button
        class="guide-modal-text-button"
        type="button"
        @click="dontShowAgain"
      >
        Don't show me again
      </button>
    </div>

    <audio ref="soundEl" :src="SOUND_PATH" preload="auto"></audio>
    </div>
  </div>
</template>
