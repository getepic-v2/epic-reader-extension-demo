import { createApp, reactive } from 'vue'
import StarOverlay from './components/StarOverlay.vue'
import DrawerPanel from './components/DrawerPanel.vue'
import GameContent from './components/GameContent.vue'
import KeyGemOverlay, { type KeyGemOverlayApi } from './components/KeyGemOverlay.vue'
import VideoModal from './components/VideoModal.vue'
import GuideModal from './components/GuideModal.vue'
import BookRatingModal from './components/BookRatingModal.vue'
import { injectStyles } from './utils/styles'
import type {
  ExtensionContext,
  Star,
  ClickVideo,
  EpicReaderBookData,
  VideoModalData,
  VideoModalResult,
  EpicLabsGuideModalResult,
  BookRatingDialogData,
} from './types'
import { parseLabsXml } from './utils/parse-labs-xml'
import { createDrawerStore } from './composables/useDrawerStore'
import { createAnalytics } from './composables/useAnalytics'
import { createTreasureService } from './composables/useTreasureService'
import type { TreasurePersistence } from './composables/useTreasureService'
import { createBookInteractiveInfoStore } from './composables/useBookInteractiveInfo'
import type { EpicLabsInteractiveInfo } from './composables/useBookInteractiveInfo'
import { createInteractionMemory } from './composables/useInteractionMemory'
import { createMotionActiveOverlay } from './composables/useMotionActiveOverlay'
import { loadJSON, loadFlag, saveFlag, STORAGE_KEYS } from './utils/storage'
import {
  EPIC_LABS_STAR_CLICK,
  EPIC_LABS_PAGE_EXPOSURE,
  EPIC_LABS_GUIDE_CLOSE,
  EPIC_LABS_CLOSE_STAR,
  EPIC_LABS_PAGE_CLOSE,
  EPIC_LABS_GAME_CLOSE,
  EPIC_LABS_COMPLETE_GAME,
  EPIC_LABS_CLICK_READ_BUTTON,
  EPIC_LABS_CLICK_COMPLETE_BUTTON,
  EPIC_LABS_EXIT_READING,
  EPIC_LABS_FINISH_READING,
} from './constants/analytics-events'

let parsedLabsData: EpicReaderBookData | null = null

function getLabsData(context: ExtensionContext): EpicReaderBookData | null {
  if (parsedLabsData) return parsedLabsData
  const raw = context.data.getLabsData()
  if (!raw || typeof raw !== 'string') return null
  try {
    parsedLabsData = parseLabsXml(raw)
  } catch (e) {
    console.warn('Failed to parse labsData XML:', e)
  }
  return parsedLabsData
}

function getCurrentPage(context: ExtensionContext) {
  return getLabsData(context)?.pages.find(
    (p) => p.pageNumber === context.data.getCurrentPage(),
  )
}

function getCurrentPageStars(context: ExtensionContext): Star[] {
  return getCurrentPage(context)?.stars || []
}

function getCurrentPageClickVideos(context: ExtensionContext): ClickVideo[] {
  return getCurrentPage(context)?.clickVideos || []
}

const STAR_CSS = `
.star-overlay {
  pointer-events: none;
  z-index: 1;
}
.star-container {
  position: relative;
  width: 100%;
  height: 100%;
}
.star-button {
  position: absolute;
  pointer-events: auto;
  width: 10%;
  height: 10%;
  padding: 0;
  cursor: pointer;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: translate(-50%, -100%);
  line-height: 0;
  z-index: 0;
}
.star-lottie {
  display: block;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
  transform-origin: 50% 70%;
  animation: star-breathe 2.6s ease-in-out infinite;
}
.game-lottie {
  display: block;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
  transform: scale(0.7);
  transform-origin: 50% 50%;
}
.star-button--star .star-lottie {
  transform-origin: 50% 70%;
}
@keyframes star-breathe {
  0%, 100% { transform: scale(0.5); }
  50% { transform: scale(0.54); }
}
`

const DRAWER_CSS = `
.drawer-panel {
  width: 100%;
  height: 100%;
  font-family: Arial, sans-serif;
  overflow: hidden;
}

/* Multiple Choice */
.mc-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px;
  background: #3F1E56;
  box-sizing: border-box;
}
.mc-question {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  color: #FD5533;
  text-align: center;
  margin: 0;
}
.mc-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.mc-option {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  color: #3c4b62;
  background: #f9fafd;
  border: 3px solid transparent;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(60, 75, 98, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font-family: inherit;
}
.mc-option:hover:not(:disabled) {
  background: #f2faff;
  border-color: #FD5533;
}
.mc-option:disabled {
  cursor: not-allowed;
  box-shadow: none;
  color: #bbcbe4;
}
.mc-option.selected {
  background: #f2faff;
  border-color: #FD5533;
  box-shadow: none;
}
.mc-option.correct {
  background: #edfcb4;
  border-color: #008845;
  color: #008845;
  box-shadow: none;
}
.mc-option.incorrect {
  background: #ffe8f0;
  border-color: #e2195d;
  color: #e2195d;
  box-shadow: none;
}
.mc-action {
  width: 100%;
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: #FD5533;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}
.mc-action:disabled {
  background: #FF9670;
  cursor: not-allowed;
}
.mc-action--success {
  background: #47b334;
}
.mc-action--fail {
  background: #FF9670;
}

/* Flashcard */
.flashcard-container {
  width: 100%;
  height: 100%;
  perspective: 1000px;
}
.flashcard-container.revealed .flashcard-flip {
  transform: rotateY(180deg);
}
.flashcard-flip {
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.4s ease;
  position: relative;
}
.flashcard-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 24px;
  border-radius: 0;
}
.flashcard-back {
  transform: rotateY(180deg);
}
.flashcard-text {
  margin: 0;
  color: #fff;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.flashcard-btn {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 700;
  color: #667eea;
  background: #fff;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  transition: transform 0.2s ease;
  font-family: inherit;
}
.flashcard-btn:hover:not(:disabled) {
  transform: scale(1.02);
}
.flashcard-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Puzzle */
.puzzle-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
}
.puzzle-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.puzzle-preview-title {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: #17324d;
  margin: 0;
}
.puzzle-preview-img {
  width: min(100%, 280px);
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 16px;
  background: #f9fafd;
}
.puzzle-btn {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: #0a96e6;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-family: inherit;
}
.puzzle-grid {
  width: 100%;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 2px;
  position: relative;
  max-width: 320px;
  aspect-ratio: 1;
  margin: 0 auto;
}
.puzzle-piece {
  background-size: 300% 300%;
  border-radius: 4px;
  cursor: grab;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.puzzle-piece:active {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  z-index: 1;
}
.puzzle-piece--correct {
  cursor: default;
  border-radius: 0;
  gap: 0;
}
.puzzle-complete {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(255,255,255,0.85);
  border-radius: 8px;
}
.puzzle-complete-title {
  font-size: 24px;
  font-weight: 700;
  color: #0a96e6;
  margin: 0;
}
.puzzle-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6f8196;
}

/* Info fallback */
.drawer-info {
  padding: 24px;
  height: 100%;
}
.drawer-info-title {
  font-size: 18px;
  font-weight: 700;
  color: #17324d;
  margin: 0 0 12px;
}
.drawer-info-text {
  font-size: 14px;
  line-height: 1.6;
  color: #4c5f75;
  margin: 0 0 8px;
}
.drawer-info-text a {
  color: #0a96e6;
}
`

const MODAL_CSS = `
.game-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: Arial, sans-serif;
}
.game-content-header {
  padding: 16px;
  background: #fff;
  color: #3c4b62;
  text-align: center;
  border-bottom: 1px solid #e8ecf1;
}
.game-content-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}
.game-content-state {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: #3c4b62;
  background: rgba(249, 250, 253, 0.96);
}
.game-content-state-title {
  font-size: 18px;
  font-weight: 600;
}
.game-content-state-text {
  font-size: 14px;
  opacity: 0.85;
}
.game-content-loader {
  color: #0a96e6;
  font-size: 16px;
}
.game-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

/* Video modal — ported from video-modal.component.scss. The host's white
   shell already frames the modal; the video itself is a centered 16:9 black
   frame with the skip button hanging below it (bottom:-54px, as in source). */
.video-modal-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  font-family: Arial, sans-serif;
  overflow: visible;
}
.video-modal-frame {
  position: relative;
  width: min(100%, calc((100% - 0px) * 16 / 9));
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}
.video-player {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.video-modal-skip {
  position: absolute;
  bottom: -54px;
  left: 50%;
  transform: translateX(-50%);
  width: 180px;
  height: 40px;
  padding: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0a96e6;
  background: #fff;
  border: 1px solid #fff;
  border-radius: 20px;
  cursor: pointer;
  font-family: inherit;
}
.video-modal-skip:hover {
  background: #f2faff;
}

/* Guide modal — sits inside the host's white modal shell, so no own scrim.
   Ported from guide-modal.component.scss: wrapper is position:relative (the
   host already provides the backdrop + white rounded container). */
.guide-modal-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  font-family: Arial, sans-serif;
  overflow: hidden;
}
.guide-modal-buddy {
  position: absolute;
  top: 20px;
  right: -290px;
  width: 425px;
  height: auto;
  z-index: 0;
  pointer-events: none;
}
.guide-modal-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 32px 32px;
  box-sizing: border-box;
  gap: 16px;
  height: 100%;
  justify-content: center;
}
.guide-modal-container h2 {
  margin: 0;
  font-size: 26px;
  color: #17324d;
}
.guide-modal-lottie {
  position: relative;
  width: 532px;
  max-width: 100%;
  height: 266px;
  margin-top: 16px;
  overflow: hidden;
}
.guide-modal-lottie__bg {
  position: absolute;
  left: 0;
  right: 0;
  top: 4%;
  height: 205px;
  width: 100%;
  object-fit: fill;
  border-radius: 13px;
  transform: scale(1.2);
  transform-origin: center top;
}
.guide-modal-lottie__anim {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform: scale(1.3);
  transform-origin: center top;
}
.guide-modal-lottie__appear,
.guide-modal-lottie__loop {
  position: absolute;
  inset: 0;
}
.guide-modal-lottie__appear--hidden {
  visibility: hidden;
}
.guide-modal-lottie__loop {
  visibility: hidden;
}
.guide-modal-lottie__loop--visible {
  visibility: visible;
}
.guide-description {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
  letter-spacing: 0.25px;
  color: #6f8196;
}
.guide-modal-star {
  display: inline-block;
  height: 32px;
  width: auto;
  vertical-align: bottom;
  margin-left: 4px;
  user-select: none;
}
.guide-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
}
.guide-modal-close::before,
.guide-modal-close::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 2px;
  background: #9aa7b8;
}
.guide-modal-close::before {
  transform: translate(-50%, -50%) rotate(45deg);
}
.guide-modal-close::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}
.epic-btn {
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: #fd5533;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-family: inherit;
}
.epic-btn--l {
  padding: 16px 40px;
  font-size: 18px;
}
.guide-modal-container .epic-btn {
  width: 320px;
  max-width: 100%;
}
.guide-modal-text-button {
  margin-top: 24px;
  background: none;
  border: none;
  padding: 0;
  color: #0a96e6;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.guide-modal-text-button:hover {
  color: #17324d;
}

/* Book rating modal — ported from book-rating-modal.component.scss. Sits in
   the host's white shell, so no own background; just padding + centered col. */
.book-rating-modal-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 32px 32px;
  box-sizing: border-box;
  font-family: Arial, sans-serif;
  gap: 12px;
}
.mat-dialog-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  z-index: 2;
}
.mat-dialog-close::before,
.mat-dialog-close::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 2px;
  background: #9aa7b8;
}
.mat-dialog-close::before {
  transform: translate(-50%, -50%) rotate(45deg);
}
.mat-dialog-close::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}
.book-cover {
  width: 256px;
  height: 322px;
  max-width: 100%;
  max-height: 45%;
  object-fit: cover;
  border-radius: 24px;
  box-shadow: 0 2px 14px 0 rgba(60, 75, 98, 0.2);
}
.book-rating-modal-container h2 {
  margin: 8px 0 0;
  font-size: 22px;
  color: #17324d;
}
.book-rating-modal-container .subtitle {
  margin: 0;
  font-size: 18px;
  color: #6f8196;
}
.stars-container {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 24px 0;
}
.star-button {
  width: 64px;
  height: 64px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.star-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.star-icon {
  width: 64px;
  height: 64px;
  display: block;
}
.submit-button {
  width: 100%;
  max-width: 320px;
  margin-top: 8px;
}
.submit-button--success {
  background: #47b334;
  border: none;
  color: #fff;
}

/* Key/gem/portal overlay (reading-area) */
.key-gem-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.key-overlay {
  position: absolute;
  left: 50%;
  bottom: 8%;
  transform: translateX(-50%);
  width: 220px;
  height: 120px;
  pointer-events: none;
}
.key-overlay__wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.key-overlay__base,
.key-overlay__key {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.key-overlay__key {
  width: 70%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
.key-overlay__key--shine {
  filter: drop-shadow(0 0 8px rgba(255, 220, 100, 0.8));
}
.key-overlay__shine {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 70%;
  height: 70%;
}
.key-overlay__gem {
  position: absolute;
  top: 30%;
  width: 24px;
  height: 24px;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.key-overlay__gem--0 {
  left: 21%;
}
.key-overlay__gem--1 {
  left: 49.5%;
}
.key-overlay__gem--2 {
  left: 81.5%;
}
.key-overlay__gem.--visible {
  opacity: 1;
}
.key-overlay__gem img {
  width: 100%;
  height: 100%;
}
.portal-overlay {
  position: absolute;
  pointer-events: auto;
  width: 18%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
}
.portal-tooltip {
  position: absolute;
  bottom: 105%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(23, 50, 77, 0.92);
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.portal-anims {
  position: relative;
  width: 100%;
  height: 100%;
}
.portal-anim {
  position: absolute;
  inset: 0;
}
.portal-click-zone {
  position: absolute;
  inset: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

/* Treasure modal (key-ready celebration) — ported from treasure-modal.component.scss.
   Source renders its own full-screen overlay (not a Material Dialog), so we keep
   position:fixed + scrim to cover the viewport. Content has no white card — the
   ribbon/key/text sit directly on the scrim, as in source. */
.tm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  font-family: Arial, sans-serif;
}
.tm-scrim {
  position: absolute;
  inset: 0;
  background: rgba(60, 75, 98, 0.9);
}
.tm-content {
  position: relative;
  z-index: 1;
  width: 545px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  text-align: center;
  opacity: 0;
  transform: scale(0);
  transition: opacity 0.35s ease;
}
.tm-content--visible {
  opacity: 1;
  transform: scale(1);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
}
.tm-title-wrap {
  position: relative;
  width: 100%;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tm-ribbon {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.tm-title {
  position: relative;
  font-family: 'Mikado', Arial, sans-serif;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  line-height: 40px;
  letter-spacing: 0.01em;
  text-align: center;
  margin-top: 10px;
}
.tm-key-anim {
  width: 408px;
  height: 370px;
  max-width: 80vw;
  margin-top: -20px;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}
.tm-body-row {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  margin-top: 24px;
}
.tm-key-sm {
  width: 67px;
  height: 65px;
  object-fit: contain;
  flex-shrink: 0;
}
.tm-body {
  font-family: 'Roboto', Arial, sans-serif;
  font-size: 20px;
  font-weight: 400;
  color: #fff;
  line-height: 28px;
  letter-spacing: 0.01em;
  margin: 0;
}
.tm-btn {
  margin-top: 24px;
  width: 320px;
  max-width: 100%;
  height: 56px;
  border-radius: 9999px;
  border: none;
  background: #0a96e6;
  font-family: 'Mikado', Arial, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.01em;
  cursor: pointer;
  flex-shrink: 0;
}
`

declare const __EXTENSION_GLOBAL_NAME__: string
;(window as any)[__EXTENSION_GLOBAL_NAME__] = {
  activate(context: ExtensionContext) {
    // --- Shared services ---
    const drawerStore = createDrawerStore()
    const analytics = createAnalytics(context)
    const interactiveInfoStore = createBookInteractiveInfoStore()
    const interactionMemory = createInteractionMemory()
    // Treasure persistence routes through the book-interactive-info store so
    // collected ids live under `info.gems.collectedIds` — the same shape the
    // backend API expects, ready to swap in later. Load is synchronous (restore
    // happens on mount); save is fire-and-forget.
    const treasurePersistence: TreasurePersistence = {
      loadCollectedIds: (bookId) => {
        const info = loadJSON<EpicLabsInteractiveInfo | null>(
          STORAGE_KEYS.INTERACTION_INFO,
          null,
          bookId,
        )
        return info?.gems?.collectedIds ?? []
      },
      saveCollectedIds: (bookId, ids) => {
        void interactiveInfoStore.setCollectedIds(bookId, ids)
      },
    }
    const treasureService = createTreasureService(treasurePersistence)
    const motionOverlay = createMotionActiveOverlay(
      () => ({ drawerWidth: 480, drawerHeight: 640 }),
    )

    const bookData = getLabsData(context)

    // --- Session-level accumulators for reading-flow analytics ---
    // Mirrors the counters epic-labs.component tracks across the reading
    // session (exposure/click counts, page/session timestamps, game state).
    // These feed PAGE_CLOSE, CLOSE_STAR, GAME_CLOSE, EXIT_READING, etc.
    const sessionStart = Date.now()
    let currentPageOpenedAt = Date.now()
    let exposureStarCount = 0
    let clickedStarCount = 0
    let clickedGameCount = 0
    let preUnlockClickCount = 0
    let gameStartedAt: number | null = null
    let gameReplayCount = 0
    let hasGameSuccess = false
    let readingHistory: number[] = []
    const bookTotalPages = bookData?.pages.length ?? 0
    let lastVideoResult: VideoModalResult | null = null
    let guideOpenedAt: number | null = null
    let keyGemOverlayRef: KeyGemOverlayApi | null = null

    // --- State ---
    const state = reactive({
      page: context.data.getCurrentPage(),
      bookId: context.data.getBookId(),
      stars: getCurrentPageStars(context),
      clickVideos: getCurrentPageClickVideos(context),
      selectedStar: null as Star | null,
      /** Which modal is currently active in the modal slot. */
      activeModal: null as
        | 'game'
        | 'video'
        | 'guide'
        | 'bookRating'
        | null,
      videoModalData: null as VideoModalData | null,
      bookRatingData: null as BookRatingDialogData | null,
    })

    // Stash ids so the KeyGemOverlay can restore them once mounted (below).
    let pendingRestoreIds: string[] | null = null

    // Restore previously collected keys for this book (no animation).
    if (bookData?.treasureConfig && state.bookId !== undefined) {
      const collected = treasureService.loadPersisted(state.bookId)
      if (collected.length) {
        pendingRestoreIds = collected
      }
      treasureService.persist(state.bookId)
    }

    // page exposure analytics on first load
    exposureStarCount += state.stars.filter((s: Star) => s.type !== 'game').length
    readingHistory = [state.page]
    analytics.log(EPIC_LABS_PAGE_EXPOSURE, {
      book_id: state.bookId,
      page_index: state.page,
      star_num: state.stars.filter((s: Star) => s.type !== 'game').length,
      star_click_num: clickedStarCount,
      game_num: state.stars.filter((s: Star) => s.type === 'game').length,
      game_click_num: clickedGameCount,
    })

    // --- Reading area: render stars + interaction layers + key/gem overlay ---
    const readingRoot = context.slots.get('reading-area')
    injectStyles(readingRoot, STAR_CSS, 'epic-star-styles')

    const starContainer = document.createElement('div')
    starContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    readingRoot.appendChild(starContainer)

    const starApp = createApp(StarOverlay, {
      context,
      state,
      store: drawerStore,
      clickVideos: state.clickVideos,
      // Wire click-video buttons to open the video modal.
      onVideoClick: (url: string) => {
        state.videoModalData = { videoUrl: url, skipLabel: 'Skip' }
        state.activeModal = 'video'
        context.commands.execute('openModal', { width: 720, height: 480 })
      },
    })
    starApp.mount(starContainer)

    // Key/gem/portal overlay — only when the book has a treasure config.
    let keyGemApp: ReturnType<typeof createApp> | null = null
    let keyGemContainer: HTMLElement | null = null
    if (bookData?.treasureConfig) {
      keyGemContainer = document.createElement('div')
      keyGemContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
      readingRoot.appendChild(keyGemContainer)

      keyGemApp = createApp(KeyGemOverlay, {
        epicLabsBookData: bookData,
        currentPage: state.page,
        bookId: state.bookId,
        drawerDimensions: { drawerWidth: 480, drawerHeight: 640 },
        treasureService,
        store: drawerStore,
        analytics,
        onReady: (api: any) => {
          keyGemOverlayRef = api
          if (pendingRestoreIds) {
            keyGemOverlayRef?.restoreGems(pendingRestoreIds)
            pendingRestoreIds = null
          }
        },
        onPreUnlockGameClick: () => {
          preUnlockClickCount += 1
        },
      })
      keyGemApp.mount(keyGemContainer)
    }

    // --- Events ---
    const unsubPage = context.events.on('pageChange', (payload: any) => {
      // Fire PAGE_CLOSE for the page we're leaving, using its accumulated stats.
      const prevPage = state.page
      const prevStars = state.stars
      const stayDuration = Date.now() - currentPageOpenedAt
      const metrics = drawerStore.getCloseMetrics()
      analytics.log(EPIC_LABS_PAGE_CLOSE, {
        has_star: prevStars.length > 0,
        page_index: prevPage,
        star_type: metrics?.starType,
        star_index: metrics?.starIndex,
        has_treasure: metrics?.hasTreasure ? 1 : 0,
        stay_duration: stayDuration,
        star_clicked: clickedStarCount > 0 ? 1 : 0,
        click_count: clickedStarCount,
      })
      drawerStore.clearCloseMetrics()

      // Advance to the new page.
      state.page = payload?.pageIndex ?? context.data.getCurrentPage()
      state.stars = getCurrentPageStars(context)
      state.clickVideos = getCurrentPageClickVideos(context)
      state.selectedStar = null
      drawerStore.resetDrawerState()
      keyGemOverlayRef?.resetPortalVisualState()
      currentPageOpenedAt = Date.now()
      exposureStarCount += state.stars.filter((s: Star) => s.type !== 'game').length
      if (!readingHistory.includes(state.page)) readingHistory.push(state.page)
      analytics.log(EPIC_LABS_PAGE_EXPOSURE, {
        book_id: state.bookId,
        page_index: state.page,
        star_num: state.stars.filter((s: Star) => s.type !== 'game').length,
        star_click_num: clickedStarCount,
        game_num: state.stars.filter((s: Star) => s.type === 'game').length,
        game_click_num: clickedGameCount,
      })
    })

    // --- Drawer ---
    let drawerApp: ReturnType<typeof createApp> | null = null
    let drawerContainer: HTMLElement | null = null

    const unsubDrawer = context.events.on('drawerStateChange', (payload: any) => {
      if (payload?.mounted) {
        try {
          const drawerRoot = context.slots.get('drawer')
          injectStyles(drawerRoot, DRAWER_CSS, 'epic-drawer-styles')

          drawerContainer = document.createElement('div')
          drawerContainer.style.cssText = 'width:100%;height:100%;'
          drawerRoot.appendChild(drawerContainer)

          drawerApp = createApp(DrawerPanel, {
            store: drawerStore,
            star: state.selectedStar,
            analytics,
            bookId: state.bookId,
            onTreasureCollect: (interactionId: string, starIndex: number, starType?: string) => {
              keyGemOverlayRef?.collect(interactionId, starIndex, starType)
            },
          })
          drawerApp.mount(drawerContainer)
        } catch {
          // drawer slot not ready
        }
      } else {
        // Drawer closing — fire CLOSE_STAR with the accumulated metrics.
        const metrics = drawerStore.getCloseMetrics()
        if (metrics) {
          analytics.log(EPIC_LABS_CLOSE_STAR, {
            star_index: metrics.starIndex,
            star_type: metrics.starType,
            stay_duration: drawerStore.getStayDuration(),
            has_animation: 0,
            has_treasure: metrics.hasTreasure ? 1 : 0,
            is_star_completed: metrics.isStarComplete ? 1 : 0,
            count: 0,
            is_correct: metrics.isCorrect ? 1 : 0,
          })
        }
        drawerApp?.unmount()
        drawerContainer?.remove()
        drawerApp = null
        drawerContainer = null
        drawerStore.clearCloseMetrics()
      }
    })

    // --- Modal slot: dispatch by activeModal type ---
    let modalApp: ReturnType<typeof createApp> | null = null
    let modalContainer: HTMLElement | null = null

    function mountModal() {
      if (!state.activeModal) return
      try {
        const modalRoot = context.slots.get('modal')
        injectStyles(modalRoot, MODAL_CSS, 'epic-modal-styles')

        modalContainer = document.createElement('div')
        modalContainer.style.cssText = 'width:100%;height:100%;'
        modalRoot.appendChild(modalContainer)

        if (state.activeModal === 'game') {
          modalApp = createApp(GameContent, { content: state.selectedStar?.content })
        } else if (state.activeModal === 'video' && state.videoModalData) {
          modalApp = createApp(VideoModal, {
            data: state.videoModalData,
            onClosed: (result: VideoModalResult) => {
              lastVideoResult = result
              context.commands.execute('closeModal')
            },
          })
        } else if (state.activeModal === 'guide') {
          modalApp = createApp(GuideModal, {
            onClosed: (result: EpicLabsGuideModalResult) => {
              if (result === 'dont-show') {
                saveFlag(STORAGE_KEYS.GUIDE_DISMISSED, true)
              }
              analytics.log(EPIC_LABS_GUIDE_CLOSE, {
                result,
                duration: guideOpenedAt ? Date.now() - guideOpenedAt : 0,
              })
              context.commands.execute('closeModal')
            },
          })
        } else if (state.activeModal === 'bookRating') {
          modalApp = createApp(BookRatingModal, {
            data: state.bookRatingData ?? undefined,
            analytics,
            onClosed: () => {
              if (state.bookId !== undefined) {
                saveFlag(STORAGE_KEYS.BOOK_RATING_SHOWN, true, state.bookId)
              }
              context.commands.execute('closeModal')
            },
          })
        } else {
          modalApp = createApp(GameContent, { content: state.selectedStar?.content })
        }
        modalApp.mount(modalContainer)
      } catch {
        // modal slot not ready
      }
    }

    function unmountModal() {
      // Fire close analytics for the modal that's being torn down.
      const closingModal = state.activeModal
      if (closingModal === 'game') {
        const gameDuration = gameStartedAt ? Date.now() - gameStartedAt : 0
        analytics.log(EPIC_LABS_GAME_CLOSE, {
          game_id: state.selectedStar?.content?.url,
          total_play_count: gameReplayCount + 1,
          total_game_duration: gameDuration,
          is_level_completed: hasGameSuccess ? 1 : 0,
        })
        analytics.log(EPIC_LABS_COMPLETE_GAME, {
          book_id: state.bookId,
          page_index: state.page,
          star_index: drawerStore.state.starIndex,
          is_game_complete: hasGameSuccess ? 1 : 0,
          is_game_success: hasGameSuccess ? 1 : 0,
          game_duration: gameDuration,
          game_replay_num: gameReplayCount,
        })
        gameStartedAt = null
      } else if (closingModal === 'video' && lastVideoResult) {
        analytics.log(EPIC_LABS_CLICK_COMPLETE_BUTTON, {
          book_id: state.bookId,
          is_finish: lastVideoResult.isFinish,
          duration: lastVideoResult.duration,
        })
        lastVideoResult = null
      }
      modalApp?.unmount()
      modalContainer?.remove()
      modalApp = null
      modalContainer = null
      // Clear the active modal after close analytics have fired.
      state.activeModal = null
      state.videoModalData = null
      state.bookRatingData = null
    }

    const unsubModal = context.events.on('modalStateChange', (payload: any) => {
      if (payload?.mounted) {
        mountModal()
      } else {
        unmountModal()
      }
    })

    // First-visit onboarding guide (once per browser, unless dismissed).
    if (!loadFlag(STORAGE_KEYS.GUIDE_DISMISSED)) {
      state.activeModal = 'guide'
      guideOpenedAt = Date.now()
      // Defer so the host has a chance to mount the modal slot.
      setTimeout(() => {
        if (state.activeModal === 'guide') {
          context.commands.execute('openModal', { width: 720, height: 560 })
        }
      }, 300)
    }

    // --- Intercept openDrawer to handle game stars + sync store + treasure ---
    const originalExecute = context.commands.execute.bind(context.commands)
    context.commands.execute = (command: string, payload?: any) => {
      if (command === 'openDrawer' && payload?.star) {
        const star = payload.star as Star
        state.selectedStar = star
        // sync shared store so drawer panel + reading area agree on the
        // active star and book/page/star indices
        drawerStore.updateDrawerState({
          selectedContent: star,
          bookId: state.bookId,
          pageIndex: state.page,
          starIndex: payload.starIndex ?? null,
        })
        drawerStore.startCloseMetrics({
          starIndex: payload.starIndex ?? null,
          starType: (star.type as any) ?? 'quiz',
          isStarComplete: false,
        })
        if (star.type === 'game') {
          clickedGameCount += 1
          gameStartedAt = Date.now()
          gameReplayCount = 0
          hasGameSuccess = false
          analytics.log(EPIC_LABS_STAR_CLICK, {
            page_index: state.page,
            star_index: payload.starIndex,
            book_id: state.bookId,
            star_type: star.type,
            count: clickedGameCount,
          })
          state.activeModal = 'game'
          originalExecute('openModal', { width: 960, height: 640 })
          return
        }

        clickedStarCount += 1
        analytics.log(EPIC_LABS_STAR_CLICK, {
          page_index: state.page,
          star_index: payload.starIndex,
          book_id: state.bookId,
          star_type: star.type,
          count: clickedStarCount,
        })
      }
      originalExecute(command, payload)
    }

    // Expose the KeyGemOverlay's imperative API once mounted. Vue mounts
    // synchronously above, so we read the component instance ref here.

    // --- Cleanup ---
    return () => {
      // Reading session ending — fire the final page-close and exit events.
      const finalStayDuration = Date.now() - currentPageOpenedAt
      analytics.log(EPIC_LABS_PAGE_CLOSE, {
        has_star: state.stars.length > 0,
        page_index: state.page,
        star_type: drawerStore.getCloseMetrics()?.starType,
        star_index: drawerStore.getCloseMetrics()?.starIndex,
        has_treasure: drawerStore.getCloseMetrics()?.hasTreasure ? 1 : 0,
        stay_duration: finalStayDuration,
        star_clicked: clickedStarCount > 0 ? 1 : 0,
        click_count: clickedStarCount,
      })
      const readingDuration = Date.now() - sessionStart
      analytics.log(EPIC_LABS_EXIT_READING, {
        treasure_collected_count: treasureService.getCollectedCount(),
        treasure_total_count: treasureService.getTotalCount(),
        is_treasure_box_opened: 0,
        reading_duration: readingDuration,
        exposed_star_count: exposureStarCount,
        clicked_star_count: clickedStarCount,
        pre_unlock_game_click_count: preUnlockClickCount,
      })
      const isFinish = bookTotalPages > 0 && readingHistory.length >= bookTotalPages
      analytics.log(EPIC_LABS_FINISH_READING, {
        book_id: state.bookId,
        is_finish: isFinish ? 1 : 0,
        reading_duration: readingDuration,
        reading_history: readingHistory,
        reading_total_pages: bookTotalPages,
      })

      unsubPage()
      unsubDrawer()
      unsubModal()
      unmountModal()
      drawerApp?.unmount()
      drawerContainer?.remove()
      keyGemApp?.unmount()
      keyGemContainer?.remove()
      starApp.unmount()
      starContainer.remove()
      interactionMemory.reset()
      drawerStore.dispose()
      treasureService.dispose()
      motionOverlay.dispose()
    }
  },
}
