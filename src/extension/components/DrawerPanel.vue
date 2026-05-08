<script setup lang="ts">
import type { Star } from '../types'
import MultipleChoice from './MultipleChoice.vue'
import Flashcard from './Flashcard.vue'
import Puzzle from './Puzzle.vue'

const props = defineProps<{
  star: Star | null
}>()
</script>

<template>
  <div class="drawer-panel" v-if="star">
    <MultipleChoice
      v-if="star.type === 'multiple-choice'"
      :content="star.content"
    />
    <Flashcard
      v-else-if="star.type === 'flashcard'"
      :content="star.content"
    />
    <Puzzle
      v-else-if="star.type === 'puzzle'"
      :content="star.content"
    />
    <div v-else class="drawer-info">
      <h3 class="drawer-info-title">{{ star.content.title || star.type }}</h3>
      <p v-if="star.content.paragraph" class="drawer-info-text">{{ star.content.paragraph }}</p>
      <p v-if="star.content.url" class="drawer-info-text">
        <a :href="star.content.url" target="_blank" rel="noopener">Open content</a>
      </p>
    </div>
  </div>
</template>
