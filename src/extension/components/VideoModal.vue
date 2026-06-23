<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import type { VideoModalData, VideoModalResult } from '../types'

/**
 * Video player modal. Ported 1:1 from EpicWeb VideoModalComponent.
 *
 * A native <video> autoplays; the user can skip. On close we report whether the
 * video was watched to the end (isFinish) and how many seconds were viewed.
 */
const props = defineProps<{
  data: VideoModalData
}>()
const emit = defineEmits<{
  (e: 'closed', result: VideoModalResult): void
}>()

const videoPlayer = ref<HTMLVideoElement>()
const hasEnded = ref(false)

const buttonText = computed(() => props.data.skipLabel || '')

function buildResult(): VideoModalResult {
  const player = videoPlayer.value
  const currentTime = player?.currentTime || 0
  const totalDuration = player?.duration || 0
  const isFinish =
    hasEnded.value ||
    (Number.isFinite(totalDuration) &&
      totalDuration > 0 &&
      currentTime >= totalDuration - 0.1)
      ? 1
      : 0

  return {
    isFinish,
    duration: Math.max(0, Math.round(currentTime * 100) / 100),
  }
}

function skip() {
  emit('closed', buildResult())
}

function onVideoEnded() {
  hasEnded.value = true
}

onBeforeUnmount(() => {
  // Pause to release the media resource when the modal is torn down.
  videoPlayer.value?.pause()
})
</script>

<template>
  <div class="video-modal-container">
    <div class="video-modal-frame">
      <video
        ref="videoPlayer"
        class="video-player"
        :src="data.videoUrl"
        autoplay
        controls
        @ended="onVideoEnded"
      ></video>
    </div>

    <button class="epic-btn video-modal-skip" @click="skip()">
      {{ buttonText }}
    </button>
  </div>
</template>
