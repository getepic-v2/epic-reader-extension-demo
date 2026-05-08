<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { StarContent } from '../types'

const props = defineProps<{
  content: StarContent
}>()

const GRID_SIZE = 3
const TOTAL_PIECES = GRID_SIZE * GRID_SIZE

const isComplete = ref(false)
const showPreview = ref(true)
const previewCountdown = ref(3)
const imageLoaded = ref(false)

// Generate shuffled piece order
function shuffle(arr: number[]): number[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const correctOrder = Array.from({ length: TOTAL_PIECES }, (_, i) => i)
const pieces = ref<number[]>(shuffle(correctOrder))
const dragIndex = ref<number | null>(null)

function onDragStart(index: number) {
  dragIndex.value = index
}

function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return
  const arr = [...pieces.value]
  ;[arr[dragIndex.value], arr[index]] = [arr[index], arr[dragIndex.value]]
  pieces.value = arr
  dragIndex.value = null
  checkComplete()
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function checkComplete() {
  isComplete.value = pieces.value.every((v, i) => v === i)
}

function playAgain() {
  pieces.value = shuffle(correctOrder)
  isComplete.value = false
}

function startPuzzle() {
  showPreview.value = false
}

onMounted(() => {
  if (!props.content.imageUrl) return
  const img = new Image()
  img.onload = () => {
    imageLoaded.value = true
    // Auto countdown
    const timer = setInterval(() => {
      previewCountdown.value--
      if (previewCountdown.value <= 0) {
        clearInterval(timer)
        showPreview.value = false
      }
    }, 1000)
  }
  img.src = props.content.imageUrl
})

function getPieceStyle(pieceId: number) {
  const row = Math.floor(pieceId / GRID_SIZE)
  const col = pieceId % GRID_SIZE
  const pct = 100 / GRID_SIZE
  return {
    backgroundImage: `url(${props.content.imageUrl})`,
    backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
    backgroundPosition: `${col * pct}% ${row * pct}%`,
  }
}
</script>

<template>
  <div class="puzzle-container">
    <!-- Preview -->
    <div v-if="showPreview && imageLoaded" class="puzzle-preview">
      <h3 class="puzzle-preview-title">Remember this image and start the puzzle challenge!</h3>
      <img :src="content.imageUrl" alt="Puzzle preview" class="puzzle-preview-img" />
      <button class="puzzle-btn" @click="startPuzzle">
        Begin in... {{ previewCountdown }}
      </button>
    </div>

    <!-- Puzzle Grid -->
    <div v-else-if="imageLoaded" class="puzzle-grid">
      <div
        v-for="(pieceId, index) in pieces"
        :key="index"
        class="puzzle-piece"
        :class="{ 'puzzle-piece--correct': isComplete }"
        :style="getPieceStyle(pieceId)"
        :draggable="!isComplete"
        @dragstart="onDragStart(index)"
        @drop="onDrop(index)"
        @dragover="onDragOver"
      />

      <!-- Complete overlay -->
      <div v-if="isComplete" class="puzzle-complete">
        <h3 class="puzzle-complete-title">Congratulations!</h3>
        <button class="puzzle-btn" @click="playAgain">Play Again!</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-else class="puzzle-loading">
      <p>Loading puzzle...</p>
    </div>
  </div>
</template>
