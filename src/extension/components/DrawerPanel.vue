<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Star, DrawerCompleteEvent } from '../types'
import type { DrawerStore } from '../composables/useDrawerStore'
import MultipleChoice from './MultipleChoice.vue'
import Puzzle from './Puzzle.vue'
import Flashcard from './Flashcard.vue'
import QuizSingle from './QuizSingle.vue'
import QuizCompare from './QuizCompare.vue'
import HtmlCard from './HtmlCard.vue'
import FlipMatch from './FlipMatch.vue'
import DragFill from './DragFill.vue'
import TapMatch from './TapMatch.vue'
import Infographic from './Infographic.vue'
import Hotspot from './Hotspot.vue'
import WordChoice from './WordChoice.vue'
import Celebration from './Celebration.vue'

const props = defineProps<{
  store: DrawerStore
  /** Fallback selected star (used until store.state.selectedContent is set). */
  star?: Star | null
  /** Called when a star carrying a treasure reward is completed — collects the key. */
  onTreasureCollect?: (interactionId: string, starIndex: number, starType?: string) => void
}>()

const showCelebration = ref(false)
let unsubComplete: (() => void) | null = null

// Prefer store's selectedContent; fall back to the passed star prop so the
// component works both with the store-driven flow and the legacy prop flow.
const selectedStar = computed<Star | null>(
  () => (props.store.state.selectedContent as Star | null) ?? props.star ?? null,
)
const contentType = computed(() => selectedStar.value?.type)
const content = computed(() => selectedStar.value?.content)

function shouldCelebrate(event: DrawerCompleteEvent): boolean {
  switch (event.type) {
    case 'infographic':
      return false
    case 'multiple-choice':
      return !!event.data.isCorrect
    case 'hotspot':
      return event.data.isCorrect
    case 'tap-match':
      return event.data.isComplete && event.data.isCorrect
    case 'quiz-single':
    case 'quiz-compare':
      return (
        event.data.isComplete &&
        event.data.correctCount === event.data.totalCount
      )
    default:
      return (event.data as { isComplete?: boolean }).isComplete ?? false
  }
}

function onContentComplete(event: DrawerCompleteEvent) {
  props.store.sendCompleteEvent(event)
  // If the completed star carries a treasure reward, collect its key.
  const star = selectedStar.value
  if (star?.content?.treasure && props.onTreasureCollect) {
    const pageIndex = props.store.state.pageIndex
    const starIndex = props.store.state.starIndex
    if (pageIndex != null && starIndex != null) {
      props.onTreasureCollect(`${pageIndex}_${starIndex}`, starIndex, star.type)
    }
  }
}

function onCloseClick() {
  if (!props.store.state.isAnimating) {
    props.store.closeDrawer()
  }
}

onMounted(() => {
  unsubComplete = props.store.drawerComplete.on((event) => {
    showCelebration.value = shouldCelebrate(event)
  })
})

onUnmounted(() => {
  unsubComplete?.()
})
</script>

<template>
  <div class="drawer-panel" v-if="selectedStar">
    <MultipleChoice
      v-if="contentType === 'multiple-choice'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <Puzzle
      v-else-if="contentType === 'puzzle'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <Flashcard
      v-else-if="contentType === 'flashcard'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <QuizSingle
      v-else-if="contentType === 'quiz-single'"
      :content="content"
      @complete="onContentComplete"
    />
    <QuizCompare
      v-else-if="contentType === 'quiz-compare'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <HtmlCard
      v-else-if="contentType === 'html-card'"
      :content="content"
      @complete="onContentComplete"
    />
    <FlipMatch
      v-else-if="contentType === 'flip-match'"
      :content="content"
      @complete="onContentComplete"
    />
    <DragFill
      v-else-if="contentType === 'drag-fill'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <TapMatch
      v-else-if="contentType === 'tap-match'"
      :content="content"
      @complete="onContentComplete"
    />
    <Infographic
      v-else-if="contentType === 'infographic'"
      :content="content"
      @complete="onContentComplete"
    />
    <Hotspot
      v-else-if="contentType === 'hotspot'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />
    <WordChoice
      v-else-if="contentType === 'word-choice'"
      :content="content"
      :store="store"
      @complete="onContentComplete"
    />

    <!-- Fallback for game / information stars opened in drawer -->
    <div v-else class="drawer-info">
      <h3 class="drawer-info-title">{{ content?.title || contentType }}</h3>
      <p v-if="content?.paragraph" class="drawer-info-text">{{ content.paragraph }}</p>
      <p v-if="content?.url" class="drawer-info-text">
        <a :href="content.url" target="_blank" rel="noopener">Open content</a>
      </p>
    </div>

    <Celebration v-if="showCelebration" />
  </div>
</template>
