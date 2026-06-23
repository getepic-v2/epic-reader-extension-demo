<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import { TapMatchLogic } from '../logic/tap-match.logic'
import type { TapMatchState } from '../logic/tap-match.logic'

const props = defineProps<{
  content?: StarContent
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const state = reactive<TapMatchState>({
  currentQuestionIndex: 0,
  matchedQuestionIds: [],
  clickCount: 0,
  isComplete: false,
})

let logic: TapMatchLogic | null = null

function syncState() {
  if (!logic) return
  const s = logic.getState()
  state.currentQuestionIndex = s.currentQuestionIndex
  state.matchedQuestionIds = s.matchedQuestionIds
  state.clickCount = s.clickCount
  state.isComplete = s.isComplete
}

function onCharacterTap(index: number) {
  if (!logic || state.isComplete) return
  logic.tapCharacter(index)
  if (state.isComplete) {
    emit('complete', {
      type: 'tap-match',
      data: {
        isComplete: true,
        isCorrect: true,
        clickCount: state.clickCount,
      },
    })
  }
}

onMounted(() => {
  const characters = props.content?.tapMatchCharacters || []
  const questions = props.content?.tapMatchQuestions || []
  logic = new TapMatchLogic(characters, questions)
  logic.onChange(syncState)
  syncState()
})
</script>

<template>
  <div class="tap-match-container">
    <h3 class="tap-match-title">{{ content?.title }}</h3>

    <div v-if="logic?.getCurrentQuestion()" class="tap-match-question">
      <p class="tap-match-question__text">
        {{ logic.getCurrentQuestion()?.text }}
      </p>
      <p class="tap-match-question__progress">
        Question {{ state.currentQuestionIndex + 1 }}
      </p>
    </div>

    <div class="tap-match-characters">
      <button
        v-for="(char, i) in logic?.getCharacters() || []"
        :key="i"
        class="tap-match-char"
        :disabled="state.isComplete"
        @click="onCharacterTap(i)"
      >
        <img :src="char.imageUrl" :alt="char.name" class="tap-match-char__img" />
        <span class="tap-match-char__name">{{ char.name }}</span>
      </button>
    </div>

    <div v-if="state.isComplete" class="tap-match-result">
      <p>All matched! 🎉</p>
    </div>
  </div>
</template>
