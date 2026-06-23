<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import { WordChoiceLogic } from '../logic/word-choice.logic'
import type { WordChoiceState } from '../logic/word-choice.logic'
import type { DrawerStore } from '../composables/useDrawerStore'

const props = defineProps<{
  content?: StarContent
  store?: DrawerStore
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const HINT_DELAY_MS = 10_000
const RESULT_ADVANCE_MS = 1_100

const state = reactive<WordChoiceState>({
  phase: 'intro',
  questions: [],
  qIndex: 0,
  picked: null,
  isPickCorrect: false,
  score: 0,
  totalRounds: 0,
})

const timerPct = ref(100)
const introExiting = ref(false)
const gameExiting = ref(false)
const replayCount = ref(0)

let logic: WordChoiceLogic | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null
let timerStart = 0
let resultTimer: ReturnType<typeof setTimeout> | null = null
let exitTimer: ReturnType<typeof setTimeout> | null = null

const currentQuestion = computed(() => logic?.currentQuestion ?? null)
const timerSeconds = computed(() =>
  Math.ceil((timerPct.value / 100) * (HINT_DELAY_MS / 1000)),
)

function syncState() {
  if (!logic) return
  const s = logic.getState()
  state.phase = s.phase
  state.questions = s.questions
  state.qIndex = s.qIndex
  state.picked = s.picked
  state.isPickCorrect = s.isPickCorrect
  state.score = s.score
  state.totalRounds = s.totalRounds
}

function emitDone() {
  emit('complete', {
    type: 'word-choice',
    data: {
      isComplete: true,
      score: state.score,
      totalRounds: state.totalRounds,
    },
  })
}

function handleAfterAdvance() {
  if (state.phase === 'question') {
    startTimer()
  } else if (state.phase === 'done') {
    emitDone()
    gameExiting.value = true
    if (exitTimer) clearTimeout(exitTimer)
    exitTimer = setTimeout(() => {
      gameExiting.value = false
    }, 280)
  }
}

function onStart() {
  introExiting.value = true
  setTimeout(() => {
    introExiting.value = false
    logic?.startGame()
    startTimer()
  }, 280)
}

function onPick(optionId: string) {
  if (state.picked !== null) return
  clearTimers()
  logic?.pick(optionId)

  resultTimer = setTimeout(() => {
    logic?.advance()
    handleAfterAdvance()
  }, RESULT_ADVANCE_MS)
}

function onTimeout() {
  if (state.picked !== null) return
  logic?.pick('__timeout__')

  resultTimer = setTimeout(() => {
    logic?.advance()
    handleAfterAdvance()
  }, RESULT_ADVANCE_MS)
}

function onReplay() {
  replayCount.value += 1
  props.store?.updateCloseMetrics({ playCount: replayCount.value })
  clearTimers()
  logic?.startGame()
  startTimer()
}

function startTimer() {
  clearTimer()
  timerStart = Date.now()
  timerPct.value = 100

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - timerStart
    const pct = Math.max(0, 100 - (elapsed / HINT_DELAY_MS) * 100)
    timerPct.value = pct

    if (pct <= 0) {
      clearTimer()
      onTimeout()
    }
  }, 100)
}

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function clearTimers() {
  clearTimer()
  if (resultTimer !== null) {
    clearTimeout(resultTimer)
    resultTimer = null
  }
}

onMounted(() => {
  logic = new WordChoiceLogic(props.content?.wordChoiceWords ?? [])
  logic.onChange(syncState)
  syncState()
})

onUnmounted(() => {
  clearTimers()
  if (exitTimer) clearTimeout(exitTimer)
})
</script>

<template>
  <div
    class="wc-root"
    :class="{
      'wc-root--dark': state.phase === 'intro',
      'wc-root--done': state.phase === 'done',
      'wc-root--perfect':
        state.phase === 'done' && state.score === state.totalRounds,
    }"
  >
    <!-- Intro -->
    <div
      v-if="state.phase === 'intro'"
      class="wc-intro"
      :class="{ 'wc-intro--exiting': introExiting }"
    >
      <div class="wc-intro__content">
        <h2 class="wc-intro__title">{{ content?.title || 'Word Pick' }}</h2>
        <p class="wc-intro__prompt">
          Choose the word that correctly describes the main character.
        </p>
        <button class="wc-start-btn" :disabled="!logic?.canStart()" @click="onStart">
          <span class="wc-start-btn__label">Start!</span>
        </button>
      </div>
    </div>

    <!-- Question / Result -->
    <div
      v-if="state.phase === 'question' || state.phase === 'result'"
      class="wc-game"
    >
      <div class="wc-game__top">
        <div class="wc-timer-row">
          <span class="wc-timer-secs">{{ timerSeconds }}S</span>
          <div class="wc-timer-bar">
            <div class="wc-timer-fill" :style="{ width: timerPct + '%' }"></div>
          </div>
        </div>
        <p class="wc-prompt">
          Choose the word that correctly describes the main character.
        </p>
      </div>

      <div class="wc-game__bottom">
        <div v-if="currentQuestion" class="wc-options">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt.id"
            class="wc-option"
            :class="{
              'wc-option--correct':
                state.phase === 'result' && opt.id === currentQuestion.correctId,
              'wc-option--wrong':
                state.phase === 'result' &&
                state.picked === opt.id &&
                opt.id !== currentQuestion.correctId,
            }"
            :disabled="state.phase !== 'question'"
            @click="onPick(opt.id)"
          >
            <span class="wc-option__text">{{ opt.text }}</span>
          </button>
        </div>

        <div class="wc-dots">
          <span
            v-for="(q, i) in state.questions"
            :key="i"
            class="wc-dot"
            :class="{ 'wc-dot--active': i === state.qIndex }"
          ></span>
        </div>
      </div>
    </div>

    <!-- Done -->
    <div
      v-if="state.phase === 'done'"
      class="wc-done"
      :class="{ 'wc-done--perfect': state.score === state.totalRounds }"
    >
      <div class="wc-done__content">
        <h2 class="wc-done__title">
          {{ state.score === state.totalRounds ? 'PERFECT!' : 'NICE TRY!' }}
        </h2>
        <p class="wc-done__score">{{ state.score }}/{{ state.totalRounds }} correct</p>
      </div>
      <button class="wc-start-btn" @click="onReplay">
        <span class="wc-start-btn__label">{{
          state.score === state.totalRounds ? 'Again!' : 'Try Again!'
        }}</span>
      </button>
    </div>
  </div>
</template>
