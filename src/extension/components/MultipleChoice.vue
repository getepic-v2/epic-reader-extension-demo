<script setup lang="ts">
import { ref } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import type { DrawerStore } from '../composables/useDrawerStore'

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const selectedIndex = ref<number | null>(null)
const hasAnswered = ref(false)
const isCorrect = ref(false)

function onOptionClick(index: number) {
  if (hasAnswered.value) return
  selectedIndex.value = index
}

function checkAnswer() {
  if (selectedIndex.value === null) return
  const option = props.content?.options?.[selectedIndex.value]
  isCorrect.value = !!option?.isCorrect
  hasAnswered.value = true
  props.store?.updateCloseMetrics({
    isStarComplete: true,
    isCorrect: isCorrect.value,
  })
  emit('complete', {
    type: 'multiple-choice',
    data: {
      hasAnswered: true,
      optionId: option?.id,
      isCorrect: isCorrect.value,
    },
  })
}

function getOptionClass(index: number, option: { isCorrect: boolean }) {
  if (!hasAnswered.value) {
    return { selected: index === selectedIndex.value }
  }
  return {
    correct: option.isCorrect,
    incorrect: index === selectedIndex.value && !option.isCorrect,
  }
}

function getButtonText() {
  if (!hasAnswered.value) return 'Check Answer'
  return isCorrect.value ? 'Great Job!' : 'Nice Try!'
}
</script>

<template>
  <div class="mc-container">
    <h3 class="mc-question">{{ content?.question }}</h3>

    <div class="mc-options">
      <button
        v-for="(option, index) in content?.options"
        :key="option.id"
        class="mc-option"
        :class="getOptionClass(index, option)"
        :disabled="hasAnswered"
        @click="onOptionClick(index)"
      >
        <span class="mc-option-text">{{ option.text }}</span>
      </button>
    </div>

    <button
      class="mc-action"
      :class="{
        'mc-action--success': hasAnswered && isCorrect,
        'mc-action--fail': hasAnswered && !isCorrect,
      }"
      :disabled="selectedIndex === null || (hasAnswered && !isCorrect)"
      @click="checkAnswer"
    >
      {{ getButtonText() }}
    </button>
  </div>
</template>
