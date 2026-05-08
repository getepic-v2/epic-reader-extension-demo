<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { ExtensionContext, Star } from '../types'

const props = defineProps<{
  context: ExtensionContext
  state: {
    page: number
    bookId: number | undefined
    stars: Star[]
  }
}>()

const STAR_LOTTIE_PATH = '/assets/epic-labs/animations/star/'
const GAME_LOTTIE_PATH = '/assets/epic-labs/animations/game/'

const starRefs = ref<Map<number, HTMLElement>>(new Map())
const animations: AnimationItem[] = []
const flipBookStyle = ref<Record<string, string>>({})

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

  // The slot container is position:absolute;inset:0 inside read-container.
  // We need to find the offset of flipbook relative to the slot's parent (read-container).
  const slotParent = document.getElementById('read-container')
  const parentRect = slotParent?.getBoundingClientRect()

  if (parentRect) {
    flipBookStyle.value = {
      position: 'absolute',
      top: `${rect.y - parentRect.y}px`,
      left: `${rect.x - parentRect.x}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: 'none',
    }
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

watch(
  () => props.state.stars,
  async () => {
    await nextTick()
    updateFlipBookPosition()
    initLottieAnimations()
  },
)

onMounted(() => {
  updateFlipBookPosition()
  nextTick(() => initLottieAnimations())
})

onBeforeUnmount(() => {
  animations.forEach((a) => a.destroy())
  animations.length = 0
})
</script>

<template>
  <div class="star-overlay" :style="flipBookStyle">
    <div class="star-container">
      <button
        v-for="(star, index) in state.stars"
        :key="`${state.page}-${index}`"
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
    </div>
  </div>
</template>
