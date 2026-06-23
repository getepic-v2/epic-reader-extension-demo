<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
} from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import { QuizCompareLogic } from '../logic/quiz-compare.logic'
import type { QuizCompareState } from '../logic/quiz-compare.logic'
import type { DrawerStore } from '../composables/useDrawerStore'

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const TIMER_MS = 10_000
const ADVANCE_MS = 2_100

const state = reactive<QuizCompareState>({
  phase: 'cover',
  currentQuestionIndex: 0,
  correctCount: 0,
  totalCount: 0,
  selectedSubjectId: null,
  isCurrentCorrect: null,
  isComplete: false,
})

const timerPct = ref(100)
const subjectHeight = ref(0)
const coverExiting = ref(false)
const gameExiting = ref(false)
const showResultPanel = ref(false)
const questionExiting = ref(false)
const questionEntering = ref(false)
const replayCount = ref(0)

const rootEl = ref<HTMLElement | null>(null)
let logic: QuizCompareLogic | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null
let timerStart = 0
let advanceTimeout: ReturnType<typeof setTimeout> | null = null
let questionTransitionTimer: ReturnType<typeof setTimeout> | null = null
let exitTimer: ReturnType<typeof setTimeout> | null = null
let enterTimer: ReturnType<typeof setTimeout> | null = null

const timerLabel = computed(
  () => Math.ceil((timerPct.value / 100) * (TIMER_MS / 1000)) + 'S',
)
const dotIndices = computed(() =>
  Array.from({ length: state.totalCount }, (_, i) => i),
)

function syncState() {
  if (!logic) return
  const s = logic.getState()
  Object.assign(state, s)
}

function updateSubjectHeight() {
  const root = rootEl.value
  const h = root?.clientHeight ?? 0
  if (h > 0) {
    subjectHeight.value = Math.round(h * 0.46)
  }
}

function emitDone() {
  emit('complete', {
    type: 'quiz-compare',
    data: {
      isComplete: true,
      correctCount: state.correctCount,
      totalCount: state.totalCount,
    },
  })
}

function start() {
  coverExiting.value = true
  setTimeout(() => {
    coverExiting.value = false
    logic?.start()
    nextTick(() => updateSubjectHeight())
    startTimerDisplay()
  }, 280)
}

function selectSubject(id: string) {
  clearTimerDisplay()
  logic?.selectSubject(id)
  scheduleAdvance()
}

function onTimeout() {
  if (state.selectedSubjectId !== null) return
  clearTimerDisplay()
  logic?.timeout()
  scheduleAdvance()
}

function scheduleAdvance() {
  const isLastQuestion =
    state.currentQuestionIndex === state.totalCount - 1

  if (!isLastQuestion) {
    questionTransitionTimer = setTimeout(() => {
      questionTransitionTimer = null
      questionExiting.value = true
    }, ADVANCE_MS - 350)
  }

  advanceTimeout = setTimeout(() => {
    advanceTimeout = null
    logic?.advance()
    if (state.isComplete) {
      gameExiting.value = true
      if (exitTimer) clearTimeout(exitTimer)
      exitTimer = setTimeout(() => {
        gameExiting.value = false
        showResultPanel.value = true
        emitDone()
      }, 280)
    } else {
      questionExiting.value = false
      questionEntering.value = true
      startTimerDisplay()
      if (enterTimer) clearTimeout(enterTimer)
      enterTimer = setTimeout(() => {
        questionEntering.value = false
      }, 400)
    }
  }, ADVANCE_MS)
}

function isCorrectResult(subjectId: string): boolean {
  return (
    state.selectedSubjectId !== null &&
    subjectId === logic?.getCurrentCorrectSubjectId()
  )
}
function isWrongResult(subjectId: string): boolean {
  return (
    state.selectedSubjectId === subjectId && state.isCurrentCorrect === false
  )
}

function onReplay() {
  replayCount.value += 1
  props.store?.updateCloseMetrics({ playCount: replayCount.value })
  clearTimerDisplay()
  timerPct.value = 100
  questionExiting.value = false
  questionEntering.value = false
  showResultPanel.value = false
  logic?.reset()
}

function startTimerDisplay() {
  clearTimerDisplay()
  timerStart = Date.now()
  timerPct.value = 100
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - timerStart
    const pct = Math.max(0, 100 - (elapsed / TIMER_MS) * 100)
    timerPct.value = pct
    if (pct <= 0) {
      clearTimerDisplay()
      onTimeout()
    }
  }, 100)
}

function clearTimerDisplay() {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function onResize() {
  updateSubjectHeight()
}

onMounted(() => {
  const subjects = props.content?.quizCompareSubjects || []
  const questionSets = props.content?.quizCompareQuestionSets || []
  logic = new QuizCompareLogic(subjects, questionSets)
  logic.onChange(syncState)
  syncState()
  nextTick(() => updateSubjectHeight())
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  logic?.destroy()
  clearTimerDisplay()
  if (advanceTimeout) clearTimeout(advanceTimeout)
  if (questionTransitionTimer) clearTimeout(questionTransitionTimer)
  if (exitTimer) clearTimeout(exitTimer)
  if (enterTimer) clearTimeout(enterTimer)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div ref="rootEl" class="qc-root">
    <!-- Cover -->
    <div
      v-if="state.phase === 'cover'"
      class="qc-cover"
      :class="{ 'qc-cover--exiting': coverExiting }"
    >
      <div class="qc-cover__content">
        <h2 class="qc-cover__title">MINI CLASH</h2>
        <p class="qc-cover__prompt">
          Choose the word that correctly describes the main character.
        </p>
        <button class="qc-cover__btn" @click="start">Start!</button>
      </div>
    </div>

    <!-- Playing -->
    <div
      v-if="
        ((state.phase === 'playing' || state.phase === 'result') &&
          !showResultPanel) ||
        gameExiting
      "
      class="qc-game"
      :class="{ 'qc-game--exiting': gameExiting }"
    >
      <div class="qc-game__top">
        <div class="qc-timer-row">
          <span class="qc-timer-secs">{{ timerLabel }}</span>
          <div class="qc-timer-bar">
            <div class="qc-timer-fill" :style="{ width: timerPct + '%' }"></div>
          </div>
        </div>
        <p
          class="qc-question"
          :class="{
            'qc-question--exiting': questionExiting,
            'qc-question--entering': questionEntering,
          }"
        >
          {{ logic?.getCurrentQuestion() }}
        </p>
      </div>

      <div class="qc-game__bottom">
        <div class="qc-subjects">
          <button
            v-for="subject in logic?.getSubjects() || []"
            :key="subject.id"
            class="qc-subject"
            :style="{ height: subjectHeight + 'px' }"
            :class="{
              'qc-subject--correct': isCorrectResult(subject.id),
              'qc-subject--wrong': isWrongResult(subject.id),
            }"
            :disabled="state.selectedSubjectId !== null"
            @click="selectSubject(subject.id)"
          >
            <img
              v-if="subject.imageUrl"
              :src="subject.imageUrl"
              :alt="subject.label"
              class="qc-subject__img"
              draggable="false"
            />
            <span class="qc-subject__label">{{ subject.label }}</span>
          </button>
        </div>

        <div class="qc-dots">
          <span
            v-for="idx in dotIndices"
            :key="idx"
            class="qc-dot"
            :class="{ 'qc-dot--active': idx === state.currentQuestionIndex }"
          ></span>
        </div>
      </div>
    </div>

    <!-- Result -->
    <div
      v-if="showResultPanel"
      class="qc-done"
      :class="{ 'qc-done--try-again': state.correctCount !== state.totalCount }"
    >
      <div class="qc-done__content">
        <h2 class="qc-done__title">
          {{ state.correctCount === state.totalCount ? 'BRILLIANT!' : 'KEEP GOING!' }}
        </h2>
        <p class="qc-done__score">
          {{ state.correctCount }}/{{ state.totalCount }} correct
        </p>
      </div>
      <button class="qc-btn" @click="onReplay">
        {{
          state.correctCount === state.totalCount ? 'Again!' : 'Try Again!'
        }}
      </button>
    </div>
  </div>
</template>
