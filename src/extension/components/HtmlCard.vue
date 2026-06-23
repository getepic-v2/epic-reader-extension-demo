<script setup lang="ts">
import { computed } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'

const props = defineProps<{
  content?: StarContent
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const safeUrl = computed(() => props.content?.h5TemplateUrl || '')

function onIframeLoad() {
  emit('complete', { type: 'html-card', data: { isComplete: true } })
}
</script>

<template>
  <div class="html-card-container">
    <h3 v-if="content?.title" class="html-card-title">{{ content.title }}</h3>

    <div v-if="safeUrl" class="html-card-frame-wrap">
      <iframe
        class="html-card-frame"
        :src="safeUrl"
        frameborder="0"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-forms"
        @load="onIframeLoad"
      ></iframe>
    </div>

    <div v-else class="html-card-empty">
      <p>No content available.</p>
    </div>
  </div>
</template>
