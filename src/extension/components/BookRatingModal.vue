<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import type { BookRatingDialogData, BookRatingDialogResult } from '../types'
import type { Analytics } from '../composables/useAnalytics'
import { EPIC_LABS_BOOK_RATING } from '../constants/analytics-events'

/**
 * Book rating prompt. Ported 1:1 from EpicWeb BookRatingModalComponent.
 *
 * The user taps 1-5 stars and submits. After submit the modal auto-closes
 * after 2s. Closing via the X emits { rating: null } instead. Either way the
 * parent marks the book as "rating shown" so the prompt never repeats.
 */
const props = defineProps<{
  data?: BookRatingDialogData
  analytics?: Analytics
}>()
const emit = defineEmits<{
  (e: 'closed', result: BookRatingDialogResult): void
}>()

const rating = ref<number | null>(null)
const stars = [1, 2, 3, 4, 5]
const isSubmitted = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | undefined

function onStarClick(star: number) {
  if (isSubmitted.value) return
  rating.value = star
}

function submit() {
  if (!rating.value || isSubmitted.value) return
  props.analytics?.log(EPIC_LABS_BOOK_RATING, {
    rating: rating.value,
    book_id: props.data?.bookId,
  })
  isSubmitted.value = true
  closeTimer = setTimeout(() => {
    emit('closed', { rating: rating.value })
  }, 2000)
}

function close() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = undefined
  }
  emit('closed', { rating: null })
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="mat-dialog-close" @click="close"></div>
  <div class="book-rating-modal-container">
    <img
      v-if="data?.coverUrl"
      class="book-cover"
      :src="data.coverUrl"
      alt="Book cover"
    />

    <h2>How was the book?</h2>
    <p class="subtitle">Tap the stars to rate this book.</p>

    <div class="stars-container">
      <button
        v-for="star in stars"
        :key="star"
        class="star-button"
        type="button"
        :class="{ selected: rating !== null && rating >= star }"
        :disabled="isSubmitted"
        @click="onStarClick(star)"
      >
        <img
          class="star-icon"
          :src="
            rating !== null && rating >= star
              ? '/assets/epic-labs/star-pink.svg'
              : '/assets/epic-labs/star-gray.svg'
          "
          alt="Star rating"
        />
      </button>
    </div>

    <button
      class="epic-btn epic-btn--l submit-button"
      type="button"
      :class="{ 'submit-button--success': isSubmitted }"
      :disabled="rating === null || isSubmitted"
      @click="submit"
    >
      {{ isSubmitted ? 'Thank You!' : 'Submit' }}
    </button>
  </div>
</template>
