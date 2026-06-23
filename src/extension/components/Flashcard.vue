<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import type { DrawerStore } from '../composables/useDrawerStore'

interface FlashcardFaceStyle {
  backgroundUrl: string
  textColor: string
}
interface FlashcardStyle extends FlashcardFaceStyle {
  buttonTextColor: string
}

// Background images are host assets (assets/epic-labs/flashcard/front-*).
// They may 404 in the extension context; the SCSS falls back to a solid
// color via the --flashcard-* CSS variables when the image fails to load.
const FLASHCARD_STYLES: FlashcardStyle[] = [
  { backgroundUrl: 'assets/epic-labs/flashcard/front-1.svg', textColor: '#ffffff', buttonTextColor: '#0A96E6' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-2.svg', textColor: '#3F1E56', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-3.svg', textColor: '#3F1E56', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-4.jpg', textColor: '#FAD604', buttonTextColor: '#02613B' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-5.svg', textColor: '#FAD604', buttonTextColor: '#E2195D' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-6.svg', textColor: '#3F1E56', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-7.svg', textColor: '#FD5533', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-8.png', textColor: '#0A96E6', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-9.png', textColor: '#FD5533', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-10.png', textColor: '#E2195D', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-11.png', textColor: '#3F1E56', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-12.png', textColor: '#EF5BA1', buttonTextColor: '#ffffff' },
  { backgroundUrl: 'assets/epic-labs/flashcard/front-13.png', textColor: '#02613B', buttonTextColor: '#ffffff' },
]

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const isRevealed = ref(false)
const flashcardStyle = ref<FlashcardStyle | undefined>(undefined)
const randomPool = ref<number[]>([])

function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined
  if (randomPool.value.length === 0) {
    randomPool.value = items.map((_, i) => i)
  }
  const poolIndex = Math.floor(Math.random() * randomPool.value.length)
  const itemIndex = randomPool.value[poolIndex]!
  randomPool.value.splice(poolIndex, 1)
  return items[itemIndex]
}

function setRandomStyles() {
  flashcardStyle.value = pickRandom(FLASHCARD_STYLES)
  isRevealed.value = false
}

function reveal() {
  if (isRevealed.value) return
  isRevealed.value = true
  props.store?.updateCloseMetrics({ isStarComplete: true })
  emit('complete', { type: 'flashcard', data: { isRevealed: true } })
}

onMounted(() => {
  setRandomStyles()
})

const frontBg = () =>
  flashcardStyle.value?.backgroundUrl
    ? `url(${flashcardStyle.value.backgroundUrl})`
    : undefined
</script>

<template>
  <div class="flashcard-container" :class="{ revealed: isRevealed }">
    <div class="flashcard-flip">
      <div
        class="flashcard-face flashcard-front"
        :style="{
          'background-image': frontBg(),
          '--flashcard-text-color': flashcardStyle?.textColor,
          '--flashcard-button-text-color': flashcardStyle?.buttonTextColor,
          '--flashcard-button-bg-color': flashcardStyle?.textColor,
        }"
      >
        <p>{{ content?.front }}</p>
        <button
          class="epic-btn epic-btn--l"
          :disabled="isRevealed"
          @click="reveal"
        >
          Reveal the Answer
        </button>
      </div>
      <div
        class="flashcard-face flashcard-back"
        :style="{
          'background-image': frontBg(),
          '--flashcard-text-color': flashcardStyle?.textColor,
          '--flashcard-button-text-color': flashcardStyle?.buttonTextColor,
          '--flashcard-button-bg-color': flashcardStyle?.textColor,
        }"
      >
        <p>{{ content?.back }}</p>
      </div>
    </div>
  </div>
</template>
