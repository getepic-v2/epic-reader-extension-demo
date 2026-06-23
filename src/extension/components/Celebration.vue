<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

// CSS-based celebration overlay. The Angular epic-labs used canvas-confetti;
// this avoids adding a dependency while still giving a completion cue.
// Swap to canvas-confetti later if the exact effect is required.

const show = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  timer = setTimeout(() => {
    show.value = true
  }, 500)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="dc-root" :class="{ 'dc-root--show': show }">
    <span class="dc-emoji dc-emoji--1">🎉</span>
    <span class="dc-emoji dc-emoji--2">⭐</span>
    <span class="dc-emoji dc-emoji--3">✨</span>
    <span class="dc-emoji dc-emoji--4">🎊</span>
  </div>
</template>
