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
import * as V from './styles/variables'
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

function appendCacheBuster(url: string, cacheWindowMs = 3 * 60 * 60 * 1000): string {
  if (!url) return url
  const stamp =
    cacheWindowMs > 0
      ? Math.floor(Date.now() / cacheWindowMs) * cacheWindowMs
      : Date.now()
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${stamp}`
}

/**
 * @font-face for the fonts the ported components reference ('Roboto',
 * 'Mikado'). Absolute URLs to the production asset domain so the fonts load
 * regardless of which environment (webqa/prod) the extension runs in.
 *
 * IMPORTANT: @font-face is subject to shadow DOM encapsulation — a declaration
 * in the main document is NOT visible to elements inside a shadow root. So
 * this string is prepended to every slot's injected CSS (reading-area, drawer,
 * modal), making the fonts available inside each shadow root that uses them.
 */
const FONT_FACE = `
@font-face {
  font-family: 'Roboto';
  src: url(https://www.getepic.com/assets/fonts/Roboto/Roboto-Regular-subset.woff2) format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Roboto';
  src: url(https://www.getepic.com/assets/fonts/Roboto/updated-fonts/Roboto-Bold-subset.woff2) format('woff2');
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: 'Mikado';
  src: url(https://www.getepic.com/assets/fonts/Mikado/MikadoWeb-Bold-subset.woff2) format('woff2');
  font-weight: 700;
  font-display: swap;
}
`

const STAR_CSS = `
.star-container-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.star-overlay {
  pointer-events: none;
  z-index: 1;
}
.star-container {
  position: relative;
  width: 100%;
  height: 100%;
  container-type: size;
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
  position: relative;
  z-index: 1;
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
  animation: star-icon-breathe 2.6s ease-in-out infinite;
}
.drag-fill-drop-zone {
  position: absolute;
  pointer-events: auto;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.drag-fill-drop-zone__btn {
  display: flex;
  align-items: center;
  height: 5.8cqh;
  pointer-events: none;
  transition: transform 0.15s ease;
  transform-origin: center center;
}
.drag-fill-drop-zone:hover .drag-fill-drop-zone__btn {
  transform: scale(1.15);
}
.drag-fill-drop-zone__plus {
  width: 5.8cqh;
  height: 5.8cqh;
  border-radius: 50%;
  background: ${V.C_EXCLAIM_BLUE};
  color: white;
  font-family: ${V.FONT_PRIMARY};
  font-size: 3.8cqh;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.drag-fill-drop-zone__label {
  background: white;
  border: 2px solid ${V.C_EXCLAIM_BLUE};
  border-radius: 9999px;
  margin-left: -5.8cqh;
  padding: 0 1.8cqh 0 7.6cqh;
  height: 5.8cqh;
  display: flex;
  align-items: center;
  font-family: ${V.FONT_SECONDARY};
  font-size: 2.5cqh;
  font-weight: 700;
  color: ${V.C_DARK_SILVER};
  white-space: nowrap;
  letter-spacing: 0.025em;
}
.drag-fill-drop-zone--placed {
  pointer-events: none;
}
.drag-fill-drop-zone--placed .drag-fill-drop-zone__btn {
  display: none;
}
.drag-fill-placed-item {
  position: absolute;
  object-fit: contain;
  pointer-events: none;
}
.hotspot-region {
  position: absolute;
  pointer-events: auto;
  background: transparent;
  border: 5px solid #ccecff;
  padding: 0;
  cursor: pointer;
  border-radius: 38px;
  box-sizing: border-box;
  overflow: visible;
  transition: border-color 0.15s ease;
}
.hotspot-region--correct:active {
  background: rgba(204, 236, 255, 0.18);
}
.hotspot-region--wrong:active {
  background: rgba(204, 236, 255, 0.12);
}
.hotspot-region--tapped {
  cursor: default;
  pointer-events: none;
}
.hotspot-region--tapped .hotspot-region__cursor,
.hotspot-region--tapped-correct .hotspot-region__cursor,
.hotspot-region--tapped-wrong .hotspot-region__cursor {
  display: none;
}
.hotspot-region--tapped-correct {
  border-color: #b2d338;
}
.hotspot-region--tapped-wrong {
  border-color: #e2195d;
}
.hotspot-region__cursor {
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 48px;
  pointer-events: none;
  background-color: #ccecff;
  mask: url('/assets/epic-labs/drawer/hotspot-tap-icon.svg') no-repeat center / contain;
  -webkit-mask: url('/assets/epic-labs/drawer/hotspot-tap-icon.svg') no-repeat center / contain;
  animation: hotspot-cursor-breathe 2s ease-in-out infinite;
  transition: background-color 0.15s ease;
}
.click-video-button {
  position: absolute;
  pointer-events: auto;
  width: 8%;
  height: 8%;
  padding: 0;
  cursor: pointer;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: translate(-36%, -32%);
  line-height: 0;
  z-index: 0;
}
.click-video-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 1;
  transform-origin: 50% 70%;
  animation: click-video-breathe 2.6s ease-in-out infinite;
}

/* Key/gem/portal overlay (reading-area) */
.key-gem-overlay {
  display: contents;
}
.key-overlay {
  position: absolute;
  right: 5%;
  top: 5%;
  height: 13cqh;
  aspect-ratio: 1;
  pointer-events: auto;
  cursor: default;
  opacity: 0.4;
  transition: opacity 0.2s ease;
}
.key-overlay:hover,
.key-overlay--animating {
  opacity: 1;
}
.key-overlay__base {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: white;
  box-shadow: ${V.SHADOW_DISTANT};
  z-index: 0;
}
.key-overlay__base::before {
  content: '';
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  background: #c9f6f9;
}
.key-overlay__key-wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 82%;
  aspect-ratio: 179 / 260;
  z-index: 1;
}
.key-overlay__img {
  width: 100%;
  height: auto;
  display: block;
  position: relative;
  z-index: 1;
}
.key-overlay__img--no-shadow {
  filter: none;
}
.key-overlay__img--lottie {
  position: absolute;
  inset: 0;
  transform: scale(1.4) translateY(-3%);
  transform-origin: center;
}
.key-overlay__gem {
  position: absolute;
  transform: translate(-50%, -50%) rotate(var(--gem-rotate, 0deg));
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: 2;
}
.key-overlay__gem--0 {
  left: 21%;
  top: 30%;
  width: 18%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
  --gem-rotate: -18deg;
}
.key-overlay__gem--1 {
  left: 49.5%;
  top: 30%;
  width: 23%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
}
.key-overlay__gem--2 {
  left: 81.5%;
  top: 31%;
  width: 19%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
  --gem-rotate: 20deg;
}
.key-overlay__gem--visible {
  opacity: 1;
}
.key-overlay__gem img {
  width: 100%;
  height: auto;
  display: block;
  transform: scale(var(--gem-scale, 1)) translate(var(--gem-offset-x, 0px), var(--gem-offset-y, 0px));
}
.portal-overlay {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 20%;
  pointer-events: none;
  z-index: 5;
}
.portal-tooltip {
  position: absolute;
  bottom: 94%;
  left: 50%;
  transform: translateX(-50%);
  width: 230px;
  pointer-events: none;
  z-index: 1;
}
.portal-tooltip__bubble {
  background-image: url('/assets/epic-labs/speech-bubble.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  padding: 12px 10px;
  padding-bottom: 16%;
}
.portal-tooltip__inner {
  padding: 0;
}
.portal-tooltip__text {
  font-family: ${V.FONT_SECONDARY};
  font-weight: 700;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
}
.portal-tooltip__text b {
  color: ${V.C_EXCLAIM_BLUE};
}
.portal-anims {
  position: relative;
  width: 100%;
}
.portal-anim {
  width: 100%;
  height: auto;
  pointer-events: none;
  display: block;
  opacity: 0;
}
.portal-anim--active {
  opacity: 1;
}
.portal-anim--stack {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
.portal-click-zone {
  position: absolute;
  top: 15%;
  left: 25%;
  width: 50%;
  height: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2;
}
@keyframes click-video-breathe {
  0%, 100% { transform: scale(0.85); }
  50% { transform: scale(1); }
}
@keyframes hotspot-cursor-breathe {
  0%, 100% { transform: translate(-50%, -50%) scale(0.85); }
  50% { transform: translate(-50%, -50%) scale(1.15); }
}
@keyframes star-icon-breathe {
  0% { transform: scale(0.5); }
  50% { transform: scale(0.54); }
  100% { transform: scale(0.5); }
}
`

const EPIC_BUTTON_CSS = `
button {
  font-family: ${V.FONT_PRIMARY};
}
.epic-btn {
  color: ${V.BTN_COLOR};
  font-family: ${V.BTN_FONT};
  font-weight: ${V.BTN_WEIGHT};
  background-color: ${V.BTN_BG};
  box-sizing: border-box;
  border: none;
  border-radius: ${V.BTN_RADIUS};
  outline: none;
  cursor: pointer;
  transition: all 0.1s ease-in-out;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: ${V.BTN_M_FONT_SIZE};
  line-height: ${V.BTN_M_LINE_HEIGHT};
  padding: ${V.BTN_M_PAD};
}
.epic-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(0, 95, 204);
}
.epic-btn:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}
.epic-btn:not([disabled]):hover {
  color: ${V.BTN_COLOR};
  background-color: ${V.BTN_BG_HOVER};
}
.epic-btn:disabled {
  color: ${V.BTN_COLOR};
  background-color: ${V.BTN_DISABLED_BG};
}
.epic-btn--l {
  font-family: ${V.FONT_SECONDARY};
  font-weight: 400;
  font-size: ${V.BTN_L_FONT_SIZE};
  line-height: ${V.BTN_L_LINE_HEIGHT};
  padding: ${V.BTN_L_PAD};
}
`

const DRAWER_CSS = `
.drawer-panel,
.drawer-panel * {
  box-sizing: border-box;
}
.drawer-panel {
  width: 100%;
  height: 100%;
  font-family: ${V.FONT_PRIMARY};
  overflow: hidden;
}

/* Multiple Choice */
.multiple-choice-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 16px;
  background: var(--mc-bg-color, ${V.C_WHITE});
}
.multiple-choice-container .question-text {
  font-size: 28px;
  font-weight: 700;
  line-height: 32px;
  color: var(--mc-question-color, ${V.C_EXCLAIM_BLUE});
  text-align: center;
  margin: 0;
}
.multiple-choice-container .options-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.multiple-choice-container .option-button {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  font-weight: 700;
  line-height: 22px;
  letter-spacing: 0.25px;
  color: ${V.C_DARK_SILVER};
  background: #f9fafd;
  border: 4px solid transparent;
  border-radius: ${V.R_M};
  box-shadow: ${V.SHADOW_SUBTLE};
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
}
.multiple-choice-container .option-button:hover:not(:disabled) {
  background: var(--mc-option-selected-bg-color, #f2faff);
  border-color: var(--mc-question-color, ${V.C_EXCLAIM_BLUE});
}
.multiple-choice-container .option-button:disabled {
  cursor: not-allowed;
  background: #f9fafd;
  box-shadow: none;
  color: #bbcbe4;
}
.multiple-choice-container .option-button.selected {
  background: var(--mc-option-selected-bg-color, #f2faff);
  border-color: var(--mc-question-color, ${V.C_EXCLAIM_BLUE});
  box-shadow: none;
}
.multiple-choice-container .option-button.correct {
  background: #edfcb4;
  border-color: #008845;
  box-shadow: none;
  color: #008845;
}
.multiple-choice-container .option-button.incorrect {
  background: #ffe8f0;
  border-color: #e2195d;
  box-shadow: none;
  color: #e2195d;
}
.multiple-choice-container .option-text {
  flex: 1;
}
.multiple-choice-container .drawer-action {
  width: 100%;
  background: var(--mc-question-color, ${V.C_EXCLAIM_BLUE});
  color: var(--mc-action-text-color, ${V.C_WHITE});
}
.multiple-choice-container .drawer-action.drawer-action--success {
  background: #47b334;
  border: none;
  color: ${V.C_WHITE};
}
.multiple-choice-container .drawer-action.epic-btn:disabled {
  background: var(--mc-action-disabled-bg-color, #ccecff);
  color: var(--mc-action-disabled-text-color, ${V.C_WHITE});
  cursor: not-allowed;
}

/* Flashcard */
.flashcard-container {
  width: 100%;
  height: 100%;
  position: relative;
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
  padding: 16px;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
}
.flashcard-back {
  transform: rotateY(180deg);
}
.flashcard-face p {
  margin: 0;
  color: var(--flashcard-text-color, ${V.C_EXCLAIM_BLUE});
  text-align: center;
  font-family: ${V.FONT_SECONDARY};
  font-size: 28px;
  font-style: normal;
  font-weight: 700;
  line-height: 32px;
  letter-spacing: 0.25px;
}
.flashcard-face .epic-btn {
  color: var(--flashcard-button-text-color, #ffffff);
  background-color: var(--flashcard-button-bg-color, ${V.C_EXCLAIM_BLUE});
  border-color: var(--flashcard-button-bg-color, ${V.C_EXCLAIM_BLUE});
}
.flashcard-face .epic-btn:not([disabled]):hover,
.flashcard-face .epic-btn:disabled {
  color: var(--flashcard-button-text-color, #ffffff);
  background-color: var(--flashcard-button-bg-color, ${V.C_EXCLAIM_BLUE});
  border-color: var(--flashcard-button-bg-color, ${V.C_EXCLAIM_BLUE});
}

/* Puzzle */
.puzzle-container {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.puzzle-container h2 {
  margin: 0;
}
.puzzle-container--complete {
  justify-content: center;
}
.puzzle-complete-title {
  position: absolute;
  color: ${V.C_EXCLAIM_BLUE};
  text-align: center;
}
.puzzle-canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transform: translateY(0);
  transition: transform 0.5s ease;
}
.puzzle-container--complete .puzzle-canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  transform: translateY(-25%);
}
.puzzle-preview {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
}
.puzzle-preview-content {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 16px;
}
.puzzle-preview-title {
  text-align: center;
}
.puzzle-preview img {
  width: min(100%, 360px);
  aspect-ratio: 1;
  height: auto;
  object-fit: contain;
  display: block;
  border-radius: 16px;
  background: #f9fafd;
}
.puzzle-container .puzzle-complete {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.5);
  color: #ffffff;
  padding: 6px 10px;
  border-radius: 6px;
}
.puzzle-container .puzzle-restart {
  border: none;
  background: #0a96e6;
  color: #ffffff;
  padding: 6px 10px;
  cursor: pointer;
}
.puzzle-empty {
  color: #666666;
  font-size: 14px;
}
.puzzle-complete-actions {
  position: absolute;
}
.puzzle-container .drawer-action {
  position: absolute;
  right: 12px;
  bottom: 12px;
  border: none;
  background: #0a96e6;
  color: #ffffff;
  padding: 8px 14px;
  cursor: pointer;
  border-radius: 4px;
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
  font-family: ${V.FONT_PRIMARY};
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
  font-family: ${V.FONT_PRIMARY};
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
/* Full-screen scrim + centered 720px card, mirroring source's
   .epic-labs-modal-overlay > .epic-labs-modal--guide structure. The host shell
   is sized to the viewport (see openModal call), so this overlay covers it;
   the card sits centered and the buddy can overflow (wrapper is
   overflow:visible, host shell only clips at the viewport edge). */
.guide-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${V.MODAL_BACKDROP};
  border-radius: 12px;
  font-family: ${V.FONT_PRIMARY};
}
.guide-modal-wrapper {
  position: relative;
  z-index: 1;
  width: 720px;
  max-width: calc(100vw - 48px);
  max-height: 90vh;
  overflow: visible;
  background: transparent;
}
.guide-modal-buddy {
  position: absolute;
  top: 20px;
  right: -290px;
  width: 425px;
  height: auto;
  z-index: 0;
  pointer-events: none;
  transform-origin: 50% 100%;
  transform: translateX(-100%) rotate(-45deg);
  opacity: 0;
  animation: guide-buddy-enter 500ms cubic-bezier(0.34, 1.15, 0.64, 1) 300ms
    forwards;
}
@keyframes guide-buddy-enter {
  to {
    transform: translateX(0) rotate(0deg);
    opacity: 1;
  }
}
.guide-modal-container {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 32px 32px;
  box-sizing: border-box;
  gap: 16px;
  background: ${V.C_WHITE};
  border-radius: ${V.R_M};
  box-shadow: ${V.SHADOW_DISTANT};
  transform: scale(0);
  opacity: 0;
  animation: guide-modal-pop-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes guide-modal-pop-in {
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.guide-modal-container h2 {
  margin: 0;
  /* Source sets only margin:0 — inherits body (Roboto, $epic-dark-silver). */
  color: ${V.C_DARK_SILVER};
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
  color: ${V.C_DARK_SILVER};
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
  background: ${V.C_SILVER};
}
.guide-modal-close::before {
  transform: translate(-50%, -50%) rotate(45deg);
}
.guide-modal-close::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}
.epic-btn--secondary {
  color: ${V.C_EXCLAIM_BLUE};
  background-color: ${V.C_WHITE};
  border: 2px solid ${V.C_EXCLAIM_BLUE};
}
.guide-modal-container .epic-btn {
  width: 320px;
  max-width: 100%;
  animation: guide-breathe 2s ease-in-out infinite;
}
@keyframes guide-breathe {
  0%,
  100% {
    transform: scale(0.9);
  }
  50% {
    transform: scale(1.05);
  }
}
.guide-modal-text-button {
  margin-top: 24px;
  background: none;
  border: none;
  padding: 0;
  color: ${V.C_EXCLAIM_BLUE};
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.guide-modal-text-button:hover {
  color: ${V.C_DARK_BLUE};
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
  font-family: ${V.FONT_PRIMARY};
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
  background: ${V.C_SILVER};
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
  border-radius: ${V.R_L};
  box-shadow: ${V.SHADOW_DISTANT};
}
.book-rating-modal-container h2 {
  margin: 8px 0 0;
  font-size: 22px;
  color: ${V.C_DARK_SILVER};
}
.book-rating-modal-container .subtitle {
  margin: 0;
  font-size: 18px;
  color: ${V.C_DARK_SILVER};
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
  display: contents;
}
.key-overlay {
  position: absolute;
  right: 5%;
  top: 5%;
  height: 13cqh;
  aspect-ratio: 1;
  pointer-events: auto;
  cursor: default;
  opacity: 0.4;
  transition: opacity 0.2s ease;
}
.key-overlay:hover,
.key-overlay--animating {
  opacity: 1;
}
.key-overlay__base {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: white;
  box-shadow: ${V.SHADOW_DISTANT};
  z-index: 0;
}
.key-overlay__base::before {
  content: '';
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  background: #c9f6f9;
}
.key-overlay__key-wrap {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 82%;
  aspect-ratio: 179 / 260;
  z-index: 1;
}
.key-overlay__img {
  width: 100%;
  height: auto;
  display: block;
  position: relative;
  z-index: 1;
}
.key-overlay__img--no-shadow {
  filter: none;
}
.key-overlay__img--lottie {
  position: absolute;
  inset: 0;
  transform: scale(1.4) translateY(-3%);
  transform-origin: center;
}
.key-overlay__gem {
  position: absolute;
  transform: translate(-50%, -50%) rotate(var(--gem-rotate, 0deg));
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: 2;
}
.key-overlay__gem--0 {
  left: 21%;
  top: 30%;
  width: 18%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
  --gem-rotate: -18deg;
}
.key-overlay__gem--1 {
  left: 49.5%;
  top: 30%;
  width: 23%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
}
.key-overlay__gem--2 {
  left: 81.5%;
  top: 31%;
  width: 19%;
  --gem-scale: 1;
  --gem-offset-x: 0px;
  --gem-offset-y: 0px;
  --gem-rotate: 20deg;
}
.key-overlay__gem--visible {
  opacity: 1;
}
.key-overlay__gem img {
  width: 100%;
  height: auto;
  display: block;
  transform: scale(var(--gem-scale, 1)) translate(var(--gem-offset-x, 0px), var(--gem-offset-y, 0px));
}
.portal-overlay {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 20%;
  pointer-events: none;
  z-index: 5;
}
.portal-tooltip {
  position: absolute;
  bottom: 94%;
  left: 50%;
  transform: translateX(-50%);
  width: 230px;
  pointer-events: none;
  z-index: 1;
}
.portal-tooltip__bubble {
  background-image: url('/assets/epic-labs/speech-bubble.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  padding: 12px 10px;
  padding-bottom: 16%;
}
.portal-tooltip__inner {
  padding: 0;
}
.portal-tooltip__text {
  font-family: ${V.FONT_SECONDARY};
  font-weight: 700;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
}
.portal-tooltip__text b {
  color: ${V.C_EXCLAIM_BLUE};
}
.portal-anims {
  position: relative;
  width: 100%;
}
.portal-anim {
  width: 100%;
  height: auto;
  pointer-events: none;
  display: block;
  opacity: 0;
}
.portal-anim--active {
  opacity: 1;
}
.portal-anim--stack {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
.portal-click-zone {
  position: absolute;
  top: 15%;
  left: 25%;
  width: 50%;
  height: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2;
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
  font-family: ${V.FONT_PRIMARY};
}
.tm-scrim {
  position: absolute;
  inset: 0;
  background: ${V.MODAL_BACKDROP};
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
  font-family: ${V.FONT_SECONDARY};
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
  font-family: ${V.FONT_PRIMARY};
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
  background: ${V.C_EXCLAIM_BLUE};
  font-family: ${V.FONT_SECONDARY};
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
    const lastLabsPageNumber =
      bookData?.pages.reduce((max, page) => Math.max(max, page.pageNumber), 0) ?? 0
    let lastVideoResult: VideoModalResult | null = null
    let videoModalType: 'start' | 'end' | 'click' | null = null
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
    let previousPage = state.page

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
    injectStyles(readingRoot, FONT_FACE + STAR_CSS, 'epic-star-styles')

    const starContainer = document.createElement('div')
    starContainer.className = 'star-container-root'
    readingRoot.appendChild(starContainer)

    const starApp = createApp(StarOverlay, {
      context,
      state,
      store: drawerStore,
      clickVideos: state.clickVideos,
      // Wire click-video buttons to open the video modal.
      onVideoClick: (url: string) => {
        state.videoModalData = { videoUrl: url, skipLabel: 'Skip' }
        videoModalType = 'click'
        state.activeModal = 'video'
        context.commands.execute('openModal', { width: 720, height: 480 })
      },
    })
    starApp.mount(starContainer)

    // Key/gem/portal overlay — only when the book has a treasure config.
    let keyGemApp: ReturnType<typeof createApp> | null = null
    let keyGemContainer: HTMLElement | null = null
    let keyGemResizeObserver: ResizeObserver | null = null
    let keyGemResizeHandler: (() => void) | null = null
    let keyGemRafId: number | null = null
    const updateKeyGemPosition = () => {
      if (!keyGemContainer) return
      if (keyGemRafId !== null) cancelAnimationFrame(keyGemRafId)
      keyGemRafId = requestAnimationFrame(() => {
        keyGemRafId = null
        const rect = context.data.getFlipBookRect()
        if (!rect || !keyGemContainer) return
        const hostRect = (readingRoot as ShadowRoot).host.getBoundingClientRect()
        keyGemContainer.style.cssText = [
          'position:absolute',
          `top:${rect.y - hostRect.y}px`,
          `left:${rect.x - hostRect.x}px`,
          `width:${rect.width}px`,
          `height:${rect.height}px`,
          'pointer-events:none',
          'container-type:size',
        ].join(';')
      })
    }
    if (bookData?.treasureConfig) {
      keyGemContainer = document.createElement('div')
      starContainer.appendChild(keyGemContainer)
      updateKeyGemPosition()
      keyGemResizeObserver = new ResizeObserver(updateKeyGemPosition)
      keyGemResizeObserver.observe((readingRoot as ShadowRoot).host)
      keyGemResizeHandler = updateKeyGemPosition
      window.addEventListener('resize', keyGemResizeHandler)

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

    const openVideoModal = (type: 'start' | 'end') => {
      const rawVideoUrl =
        type === 'start' ? bookData?.startVideo?.url : bookData?.endVideo?.url
      if (!rawVideoUrl) return
      state.videoModalData = {
        videoUrl: appendCacheBuster(rawVideoUrl),
        skipLabel: type === 'start' ? 'Let’s Read!' : 'Complete',
      }
      videoModalType = type
      state.activeModal = 'video'
      context.commands.execute('openModal', { width: 720, height: 480 })
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
      updateKeyGemPosition()
      state.page = payload?.pageIndex ?? context.data.getCurrentPage()
      state.stars = getCurrentPageStars(context)
      state.clickVideos = getCurrentPageClickVideos(context)
      state.selectedStar = null
      drawerStore.resetDrawerState()
      keyGemOverlayRef?.resetPortalVisualState()
      currentPageOpenedAt = Date.now()
      exposureStarCount += state.stars.filter((s: Star) => s.type !== 'game').length
      if (!readingHistory.includes(state.page)) readingHistory.push(state.page)

      if (state.page === 2 && previousPage === 0) {
        openVideoModal('start')
      }

      const isTurn2LastPageByHandler = previousPage === state.page - 2
      if (
        lastLabsPageNumber > 0 &&
        state.page === lastLabsPageNumber &&
        isTurn2LastPageByHandler &&
        bookData?.endVideo?.url
      ) {
        openVideoModal('end')
      }

      previousPage = state.page
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
          injectStyles(drawerRoot, FONT_FACE + EPIC_BUTTON_CSS + DRAWER_CSS, 'epic-drawer-styles')

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
        injectStyles(modalRoot, FONT_FACE + EPIC_BUTTON_CSS + MODAL_CSS, 'epic-modal-styles')

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
        if (videoModalType === 'start') {
          analytics.log(EPIC_LABS_CLICK_READ_BUTTON, {
            book_id: state.bookId,
            is_finish: lastVideoResult.isFinish,
            duration: lastVideoResult.duration,
          })
        } else if (videoModalType === 'end') {
          analytics.log(EPIC_LABS_CLICK_COMPLETE_BUTTON, {
            book_id: state.bookId,
            is_finish: lastVideoResult.isFinish,
            duration: lastVideoResult.duration,
          })
        }
        lastVideoResult = null
        videoModalType = null
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
          // Full-viewport shell: the guide renders its own full-screen scrim
          // + centered 720px card internally (matching source's
          // .epic-labs-modal-overlay structure), and the buddy image needs to
          // overflow the card — only possible when the host shell doesn't
          // clip it. A viewport-sized shell lets the buddy spill out of the
          // card without being cut off.
          context.commands.execute('openModal', {
            width: window.innerWidth,
            height: window.innerHeight,
          })
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
      keyGemResizeObserver?.disconnect()
      if (keyGemResizeHandler) window.removeEventListener('resize', keyGemResizeHandler)
      if (keyGemRafId !== null) cancelAnimationFrame(keyGemRafId)
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
