<script setup lang="ts">
import type { ExtensionContext } from '../types'

const props = defineProps<{
  context: ExtensionContext
  state: { page: number; bookId: number | undefined }
}>()
</script>

<template>
  <div class="drawer-content">
    <h3 class="drawer-title">Vue 3 Extension Drawer</h3>
    <p class="drawer-meta">Book {{ state.bookId ?? 'unknown' }} · Page {{ state.page }}</p>
    <div class="drawer-body">
      <p>This drawer content is rendered by a <strong>Vue 3</strong> extension.</p>
      <p>The third-party team has full control over this UI.</p>
      <p>They can use any Vue components, composables, or libraries.</p>
    </div>
  </div>
</template>

<style>
:host {
  all: initial;
}

.drawer-content {
  font-family: Arial, sans-serif;
  color: #17324d;
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.drawer-meta {
  margin: 0 0 16px;
  font-size: 13px;
  color: #4c5f75;
}

.drawer-body {
  font-size: 14px;
  line-height: 1.6;
  flex: 1;
}

.drawer-body p {
  margin: 0 0 12px;
}
</style>
