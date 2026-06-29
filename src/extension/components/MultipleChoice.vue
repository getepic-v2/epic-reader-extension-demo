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
const hasCheckedAnswer = ref(false)
const isCorrect = ref(false)

const theme = {
  backgroundColor: '#3F1E56',
  questionTextColor: '#FD5533',
  optionSelectedBackgroundColor: '#F9FAFD',
  actionTextColor: '#ffffff',
  actionDisabledBackgroundColor: '#FF9670',
  actionDisabledTextColor: '#ffffff',
}

function onOptionClick(index: number) {
  if (hasAnswered.value) return
  selectedIndex.value = index
}

function checkAnswer() {
  if (selectedIndex.value === null) return
  const option = props.content?.options?.[selectedIndex.value]
  isCorrect.value = !!option?.isCorrect
  hasAnswered.value = true
  hasCheckedAnswer.value = true
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
  if (!hasCheckedAnswer.value) return 'Check Answer'
  return isCorrect.value ? 'Great Job!' : 'Nice Try!'
}
</script>

<template>
  <div
    class="multiple-choice-container"
    :style="{
      '--mc-bg-color': theme.backgroundColor,
      '--mc-question-color': theme.questionTextColor,
      '--mc-option-selected-bg-color': theme.optionSelectedBackgroundColor,
      '--mc-action-text-color': theme.actionTextColor,
      '--mc-action-disabled-bg-color': theme.actionDisabledBackgroundColor,
      '--mc-action-disabled-text-color': theme.actionDisabledTextColor,
    }"
  >
    <h3 class="question-text">{{ content?.question }}</h3>

    <div class="options-container">
      <button
        v-for="(option, index) in content?.options"
        :key="option.id"
        class="option-button"
        :class="getOptionClass(index, option)"
        :disabled="hasAnswered"
        @click="onOptionClick(index)"
      >
        <span class="option-text">{{ option.text }}</span>
      </button>
    </div>

    <button
      class="epic-btn epic-btn--l drawer-action"
      :class="{ 'drawer-action--success': hasCheckedAnswer && isCorrect }"
      :disabled="selectedIndex === null || (hasCheckedAnswer && !isCorrect)"
      @click="checkAnswer"
    >
      {{ getButtonText() }}
    </button>
  </div>
</template>
