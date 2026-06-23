<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'
import { FlipMatchLogic } from '../logic/flip-match.logic'
import type { FlipCardItem, FlipMatchState } from '../logic/flip-match.logic'

const props = defineProps<{
  content?: StarContent
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const MATCH_COLORS = ['#47B334', '#FFE54F', '#FB598A']

const state = reactive<FlipMatchState>({
  cards: [],
  openCardIds: [],
  matchedPairIds: [],
  wrongCardIds: [],
  locked: false,
  clickCount: 0,
  isComplete: false,
})

let logic: FlipMatchLogic | null = null
let wrongTimer: ReturnType<typeof setTimeout> | null = null
let successAudio: HTMLAudioElement | null = null

function syncState() {
  if (!logic) return
  const s = logic.getState()
  state.cards = s.cards
  state.openCardIds = s.openCardIds
  state.matchedPairIds = s.matchedPairIds
  state.wrongCardIds = s.wrongCardIds
  state.locked = s.locked
  state.clickCount = s.clickCount
  state.isComplete = s.isComplete
}

function isOpen(card: FlipCardItem): boolean {
  return (
    state.openCardIds.includes(card.id) ||
    state.matchedPairIds.includes(card.pairId)
  )
}
function isMatched(card: FlipCardItem): boolean {
  return state.matchedPairIds.includes(card.pairId)
}
function isWrong(card: FlipCardItem): boolean {
  return state.wrongCardIds.includes(card.id)
}
function pairColor(pairId: string): string {
  const idx = (props.content?.flipMatchPairs ?? []).findIndex(
    (p) => p.id === pairId,
  )
  return MATCH_COLORS[idx] ?? MATCH_COLORS[0]!
}

function playSuccessAudio() {
  const url = props.content?.flipMatchSuccessAudioUrl
  if (!url) return
  successAudio = new Audio(url)
  successAudio.play().catch(() => {})
}

function onCardClick(card: FlipCardItem) {
  if (!logic) return
  if (state.locked && !state.wrongCardIds.length) return
  if (isMatched(card)) return
  if (isOpen(card) && !isMatched(card)) return

  logic.flipCard(card.id)

  if (state.wrongCardIds.length > 0) {
    if (wrongTimer) clearTimeout(wrongTimer)
    wrongTimer = setTimeout(() => {
      logic?.clearWrong()
      wrongTimer = null
    }, 1000)
  }

  if (state.isComplete) {
    playSuccessAudio()
    emit('complete', {
      type: 'flip-match',
      data: {
        isComplete: true,
        matchedPairs: state.matchedPairIds.length,
        clickCount: state.clickCount,
      },
    })
  }
}

onMounted(() => {
  const pairs = props.content?.flipMatchPairs || []
  logic = new FlipMatchLogic(pairs)
  logic.onChange(syncState)
  syncState()
})

onUnmounted(() => {
  if (wrongTimer) clearTimeout(wrongTimer)
  if (successAudio) {
    successAudio.pause()
    successAudio = null
  }
})
</script>

<template>
  <div class="flip-match-container">
    <p class="flip-title">Find the picture and word that belong together.</p>

    <div class="cards-grid">
      <button
        v-for="card in state.cards"
        :key="card.id"
        class="flip-card"
        :class="{
          'flip-card--open': isOpen(card),
          'flip-card--matched': isMatched(card),
          'flip-card--wrong': isWrong(card),
        }"
        :disabled="isMatched(card) || (state.locked && !isWrong(card))"
        @click="onCardClick(card)"
      >
        <div class="flip-card__inner">
          <div class="flip-card__back">
            <span class="flip-card__question">?</span>
          </div>
          <div
            class="flip-card__front"
            :style="
              isMatched(card)
                ? {
                    outline: '3px solid ' + pairColor(card.pairId),
                    outlineOffset: '-3px',
                  }
                : undefined
            "
          >
            <img
              v-if="card.face === 'image' && card.imageUrl"
              :src="card.imageUrl"
              :alt="card.label"
              class="flip-card__img"
              draggable="false"
            />
            <span v-if="card.face === 'text'" class="flip-card__text">
              {{ card.label }}
            </span>
            <span
              class="flip-card__check"
              :style="{ background: pairColor(card.pairId) }"
            ></span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
