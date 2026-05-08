<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { StarContent } from '../types'

const props = defineProps<{
  content: StarContent
}>()

const isLoading = ref(true)
const hasError = ref(false)

function onIframeLoad() {
  if (!hasError.value) {
    isLoading.value = false
  }
}

function onIframeError() {
  hasError.value = true
  isLoading.value = false
}

onMounted(() => {
  if (!props.content.url) {
    hasError.value = true
    isLoading.value = false
  }
})
</script>

<template>
  <div class="game-content">
    <div v-if="content.title" class="game-content-header">
      <h2>{{ content.title }}</h2>
    </div>

    <div v-if="isLoading || hasError" class="game-content-state">
      <template v-if="isLoading && !hasError">
        <div class="game-content-loader">Loading...</div>
      </template>
      <template v-if="hasError">
        <div class="game-content-state-title">Unable to load this game.</div>
        <div class="game-content-state-text">Please try again later.</div>
      </template>
    </div>

    <iframe
      v-if="content.url && !hasError"
      class="game-iframe"
      :src="content.url"
      frameborder="0"
      allowfullscreen
      @load="onIframeLoad"
      @error="onIframeError"
    />
  </div>
</template>
