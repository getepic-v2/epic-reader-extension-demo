<script setup lang="ts">
import { ref } from 'vue'
import type { StarContent } from '../types'

const props = defineProps<{
  content: StarContent
}>()

const isRevealed = ref(false)

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
]

const gradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)]

function reveal() {
  if (isRevealed.value) return
  isRevealed.value = true
}
</script>

<template>
  <div class="flashcard-container" :class="{ revealed: isRevealed }">
    <div class="flashcard-flip">
      <div class="flashcard-face flashcard-front" :style="{ background: gradient }">
        <p class="flashcard-text">{{ content.front }}</p>
        <button class="flashcard-btn" :disabled="isRevealed" @click="reveal">
          Reveal the Answer
        </button>
      </div>
      <div class="flashcard-face flashcard-back" :style="{ background: gradient }">
        <p class="flashcard-text">{{ content.back }}</p>
      </div>
    </div>
  </div>
</template>
