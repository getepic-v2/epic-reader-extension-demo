<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import { QuizSingleLogic } from '../logic/quiz-single.logic'
import type { QuizSingleState } from '../logic/quiz-single.logic'

const props = defineProps<{
  content?: StarContent
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

// Mirror of logic state, kept reactive via the timerCallback hook
// (logic calls it on every state mutation). Replaces Angular's
// cdr.detectChanges() + getter pattern.
const state = reactive<QuizSingleState>({
  phase: 'cover',
  currentQuestionIndex: 0,
  correctCount: 0,
  totalCount: 0,
  selectedOptionIndex: null,
  isCurrentCorrect: null,
  isComplete: false,
})

let logic: QuizSingleLogic | null = null
const pendingTimeouts: ReturnType<typeof setTimeout>[] = []

function syncState(s: QuizSingleState) {
  Object.assign(state, s)
}

function emitComplete(s: Readonly<QuizSingleState>) {
  emit('complete', {
    type: 'quiz-single',
    data: {
      isComplete: s.isComplete,
      correctCount: s.correctCount,
      totalCount: s.totalCount,
    },
  })
}

onMounted(() => {
  const question = props.content?.question || props.content?.title || ''
  const optionSets = props.content?.quizSingleOptionSets || []
  logic = new QuizSingleLogic(question, optionSets)
  logic.setTimerCallback((s) => {
    syncState(s)
    if (s.isComplete) emitComplete(s)
  })
  syncState(logic.getState())
})

function start() {
  logic?.start()
}

function selectOption(index: number) {
  logic?.selectOption(index)
  const handle = setTimeout(() => {
    const s = logic?.getState()
    if (s?.isComplete) emitComplete(s)
  }, 2100)
  pendingTimeouts.push(handle)
}

function onDone() {
  const s = logic?.getState()
  if (s) emitComplete(s)
}

onUnmounted(() => {
  logic?.destroy()
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
})
</script>

<template>
  <div class="quiz-single-container">
    <!-- Cover -->
    <template v-if="state.phase === 'cover'">
      <h3 class="quiz-title">{{ content?.title }}</h3>
      <button class="epic-btn epic-btn--l quiz-start-btn" @click="start">
        Start
      </button>
    </template>

    <!-- Playing -->
    <template v-if="state.phase === 'playing'">
      <div class="quiz-progress">
        {{ state.currentQuestionIndex + 1 }} / {{ state.totalCount }}
      </div>
      <h3 v-if="logic?.getQuestion()" class="quiz-question">
        {{ logic.getQuestion() }}
      </h3>
      <div class="quiz-options">
        <button
          v-for="(option, i) in logic?.getCurrentOptions() || []"
          :key="i"
          class="option-btn"
          :class="{
            selected: state.selectedOptionIndex === i,
            correct:
              state.selectedOptionIndex === i &&
              state.isCurrentCorrect === true,
            incorrect:
              state.selectedOptionIndex === i &&
              state.isCurrentCorrect === false,
          }"
          :disabled="state.selectedOptionIndex !== null"
          @click="selectOption(i)"
        >
          {{ option.text }}
        </button>
      </div>
    </template>

    <!-- Result -->
    <template v-if="state.phase === 'result'">
      <div class="quiz-result">
        <p class="result-score">
          {{ state.correctCount }} / {{ state.totalCount }}
        </p>
        <p class="result-label">
          {{
            state.correctCount === state.totalCount ? 'Perfect!' : 'Nice try!'
          }}
        </p>
      </div>
      <button class="epic-btn epic-btn--l quiz-done-btn" @click="onDone">
        Done
      </button>
    </template>
  </div>
</template>
