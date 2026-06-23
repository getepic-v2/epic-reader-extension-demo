<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StarContent, DrawerCompleteEvent } from '../types'

const props = defineProps<{
  content?: StarContent
}>()
const emit = defineEmits<{
  (e: 'complete', event: DrawerCompleteEvent): void
}>()

const loading = ref(true)
const safeUrl = computed(() => props.content?.h5TemplateUrl || '')

function onLoad() {
  loading.value = false
  emit('complete', { type: 'infographic', data: { isComplete: true } })
}
</script>

<template>
  <div class="ig-root">
    <div v-if="loading" class="ig-loading">
      <div class="ig-spinner"></div>
    </div>
    <iframe
      v-if="safeUrl"
      class="ig-frame"
      :src="safeUrl"
      frameborder="0"
      allowfullscreen
      sandbox="allow-scripts allow-same-origin allow-forms"
      @load="onLoad"
    ></iframe>
    <div v-else class="ig-empty">
      <p>No content available.</p>
    </div>
  </div>
</template>
