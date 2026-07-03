import { createApp, reactive } from 'vue'
import StarOverlay from './components/StarOverlay.vue'
import DrawerPanel from './components/DrawerPanel.vue'
import GameContent from './components/GameContent.vue'
import KeyGemOverlay, { type KeyGemOverlayApi } from './components/KeyGemOverlay.vue'
import VideoModal from './components/VideoModal.vue'
import GuideModal from './components/GuideModal.vue'
import BookRatingModal from './components/BookRatingModal.vue'
import { injectStyles } from './utils/styles'
import { appendCacheBuster } from './utils/url'
import type {
  ExtensionContext,
  Star,
  ClickVideo,
  Shot,
  EpicReaderBookData,
  VideoModalData,
  VideoModalResult,
  EpicLabsGuideModalResult,
  BookRatingDialogData,
  DrawerCompleteEvent,
} from './types'
import { parseLabsXml } from './utils/parse-labs-xml'
import { ShotPlayer } from './shot-player'
import { createShotPreloadQueue } from './composables/useShotPreloadQueue'
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

function getCurrentPageShots(context: ExtensionContext): Shot[] {
  return getCurrentPage(context)?.shots || []
}

function getCurrentPageMotionUrl(context: ExtensionContext): string | undefined {
  return getCurrentPage(context)?.motionUrl || undefined
}

/**
 * Shots for the NEXT page, found by pages-array index (NOT pageNumber+1 —
 * pageNumber is non-contiguous: 2, 4, 6, 8...). Used for cross-page preload.
 */
function getNextPageShots(context: ExtensionContext): Shot[] {
  const pages = getLabsData(context)?.pages
  if (!pages) return []
  const currentNum = context.data.getCurrentPage()
  const i = pages.findIndex((p) => p.pageNumber === currentNum)
  if (i < 0 || i + 1 >= pages.length) return []
  const nextPage = pages[i + 1]
  return nextPage ? nextPage.shots || [] : []
}


function getVideoModalSize(): { width: number; height: number } {
  const maxFrameWidth = Math.min(
    1060,
    Math.max(320, window.innerWidth - 200),
    Math.max(320, (window.innerHeight - 200) * 16 / 9),
  )

  return {
    width: Math.round(maxFrameWidth),
    height: Math.round(maxFrameWidth * 9 / 16),
  }
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
  /* Stars are visible by default on every page — StarOverlay renders the
     star buttons + drag-fill zones, which are page interaction content
     independent of any <shots> video. Only on pages that HAVE shots does
     ShotPlayer take over: it hides .star-overlay during preload/audible
     playback and fades it in 1s after a loop=0 background shot starts (in
     sync with the subtitle SVG). Pages without shots never create a
     ShotPlayer, so stars stay visible here. */
  opacity: 1;
  transition: opacity 0.4s ease;
  will-change: opacity;
}
.star-overlay--hidden {
  opacity: 0;
}
/* Shot video overlay (reading-area) — below star-overlay (z-index:0), above page */
.shot-overlay-root {
  pointer-events: none;
  overflow: hidden;
}
.shot-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* White backing: a <video> paints nothing until its first frame loads, so
     the book page would bleed through during that gap. Opaque white hides
     everything underneath until the video covers it. */
  background: #fff;
}
/* Two ping-pong layers; the visible one is opacity:1. Hidden layer stays in
   the render tree (not display:none) so its <video preload="auto"> keeps
   buffering the next shot. No transition on the layer itself — the video
   swap must be a hard cut, not a fade. */
.shot-layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}
.shot-layer--visible {
  opacity: 1;
}
.shot-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
.shot-subtitle {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  /* CSS-animation fade-in (NOT a transition): the <img> is remounted via :key
     whenever its src changes, so the animation restarts cleanly each shot and
     is immune to the reflow/decode that happens when a new SVG loads. The 1s
     delay keeps the subtitle hidden until the video has been playing a beat,
     then it fades in over 0.4s. animation-fill-mode: both holds opacity:0
     through the delay so nothing flashes before the fade. */
  opacity: 0;
  animation: shot-subtitle-fade-in 0.4s ease 1s both;
  will-change: opacity;
}
@keyframes shot-subtitle-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* Loading indicator shown while shots preload (before all reach
   canplaythrough). Matches EpicWeb's global dot-loader: 3 blue bouncing
   dots. Removed once playback begins. */
.shot-loader {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.shot-loader__dots {
  display: flex;
  justify-content: center;
  align-items: center;
}
.shot-loader__dot {
  background-color: rgb(10, 150, 230);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  animation: shot-bouncedelay 1.4s infinite ease-in-out;
  animation-fill-mode: both;
}
.shot-loader__dot--1 { animation-delay: -0.32s; }
.shot-loader__dot--2 { animation-delay: -0.16s; }
.shot-loader__dot--3 { animation-delay: 0s; }
@keyframes shot-bouncedelay {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
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
  z-index: 1;
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
.drag-fill-temp-page {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  /* sits above the original book page, below drop zones / placed items */
  z-index: 0;
}
.drag-fill-placed-item {
  position: absolute;
  object-fit: contain;
  pointer-events: none;
  z-index: 1;
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
/* Global heading defaults — mirror EpicWeb app.scss h2/h3 epic-h-text mixin,
   but WITHOUT color: each title class sets its own color (qc-cover__title is
   purple, puzzle-preview-title blue, etc.). Setting a global color here would
   outrank those per-class colors (.drawer-panel h2 has higher specificity than
   a bare .qc-cover__title) and override them. Only font/size is shared. */
.drawer-panel h2 {
  font-family: ${V.FONT_SECONDARY};
  font-weight: 400;
  font-size: 32px;
  line-height: 40px;
  margin: 0;
}
.drawer-panel h3 {
  font-family: ${V.FONT_SECONDARY};
  font-weight: 400;
  font-size: 22px;
  line-height: 28px;
  margin: 0;
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
  box-shadow: 0 1px 3px 0 rgba(60, 75, 98, 0.15);
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
  /* h2 default (above) supplies Mikado/32px/40lh; color is NOT in the global
     rule, so set it here — matches the original global h2 epic-h-text(2) blue. */
  color: ${V.C_EXCLAIM_BLUE};
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

/* Hotspot (drawer-hotspot) — ported from drawer-hotspot.component.scss.
   Colors inlined from the source's local SCSS vars. */
.hs-root {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

/* ── Question phase ── */
.hs-question {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 24px 32px;
  position: relative;
  overflow: hidden;
}
.hs-question__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Original is an <img src="/assets/epic-labs/flashcard/front-8.png"
     object-fit:cover>; here it's a <div>, so use background-image with cover. */
  background-image: url('/assets/epic-labs/flashcard/front-8.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  pointer-events: none;
  z-index: 0;
}
.hs-question__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
  animation: hs-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
}
.hs-question__text {
  font-family: 'Mikado', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #0a96e6;
  line-height: 32px;
  letter-spacing: 0.25px;
  margin: 0;
}
.hs-question--shake {
  animation: hs-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes hs-enter-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes hs-shake {
  10%, 90% { transform: translateX(-3px); }
  20%, 80% { transform: translateX(5px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
  100% { transform: translateX(0); }
}

/* Quiz compare (MINI CLASH) — ported from drawer-quiz-compare.component.scss.
   Local SCSS vars inlined: $green #47b334, $yellow-green #b2d338, $purple #3f1e56,
   $timer-bg #d3ddec, $text-dark #3c4b62, card-default bg #faffe7 / border #b2d338,
   card-correct bg #edfcb4 / border #47b334, card-wrong bg #ffe8f0 / border #e2195d. */
.qc-root {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

/* ── Cover ── */
.qc-cover {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  position: relative;
  background:
    url('/assets/epic-labs/drawer/mini-clash-start-bg.png') center / cover no-repeat,
    #b2d338;
  overflow: hidden;
}
.qc-cover--exiting {
  animation: qc-exit-fade-up 0.28s ease-in forwards;
  pointer-events: none;
}
.qc-cover__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  position: relative;
  z-index: 1;
}
.qc-cover__title {
  font-family: 'Mikado', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #3f1e56;
  text-align: center;
  line-height: 32px;
  letter-spacing: 0.25px;
  text-transform: uppercase;
  margin: 0;
  animation: qc-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
}
.qc-cover__prompt {
  font-family: 'Mikado', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #3f1e56;
  text-align: center;
  line-height: 28px;
  letter-spacing: 0.25px;
  margin: 0;
  animation: qc-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.38s both;
}
.qc-cover__btn {
  width: 180px;
  height: 56px;
  border-radius: 9999px;
  border: 1px solid #3f1e56;
  background: #3f1e56;
  font-family: 'Mikado', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.25px;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s;
  animation: qc-enter-up-far 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.46s both;
}
.qc-cover__btn:active {
  transform: scale(0.97);
}

/* ── Shared START / Again button ── */
.qc-btn {
  width: 100%;
  height: 56px;
  border-radius: 28px;
  border: none;
  background: white;
  box-shadow: 0 4px 0 #47b334;
  font-family: 'Mikado', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #47b334;
  letter-spacing: 0.0125em;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s, box-shadow 0.1s;
}
.qc-btn:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 1px 0 #47b334;
}
.qc-btn:disabled {
  background: linear-gradient(180deg, #d6dde6 0%, #b8c4d4 100%);
  box-shadow: 0 4px 0 #7f8ca1;
  cursor: default;
}

/* ── Game ── */
.qc-game {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 16px 20px;
  background: #ffffff;
  overflow: hidden;
}
.qc-game--exiting {
  animation: qc-exit-fade-up 0.28s ease-in forwards;
  pointer-events: none;
}
.qc-game__top {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.qc-game__bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}
.qc-subjects {
  display: flex;
  gap: 8px;
}
.qc-timer-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-bottom: 18px;
}
.qc-timer-secs {
  font-family: 'Mikado', sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: #b2d338;
  letter-spacing: 0.25px;
  line-height: 1;
}
.qc-timer-bar {
  width: 100%;
  height: 14px;
  border-radius: 8px;
  background: #d3ddec;
  overflow: hidden;
}
.qc-timer-fill {
  height: 100%;
  border-radius: 7px;
  background: #b2d338;
  transition: width 0.1s linear;
}
.qc-question {
  font-family: 'Mikado', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #3c4b62;
  line-height: 32px;
  letter-spacing: 0.25px;
  text-align: center;
  margin: 0;
}
.qc-question--exiting {
  animation: qc-exit-fade-up 0.3s ease-in forwards;
  pointer-events: none;
}
.qc-question--entering {
  animation: qc-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ── Subject cards ── */
.qc-subject {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 14px;
  border-radius: 16px;
  border: 4px solid #b2d338;
  background: #faffe7;
  cursor: pointer;
  transition: transform 0.1s;
  animation: qc-enter-up-far 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.qc-subject:nth-child(2) { animation-delay: 0.07s; }
.qc-subject:nth-child(3) { animation-delay: 0.14s; }
.qc-subject:nth-child(4) { animation-delay: 0.21s; }
.qc-subject:not(:disabled):active {
  transform: translateY(3px);
}
.qc-subject:disabled {
  cursor: default;
}
.qc-subject--correct {
  border-color: #47b334 !important;
  background: #edfcb4 !important;
}
.qc-subject--wrong {
  border-color: #e2195d !important;
  background: #ffe8f0 !important;
}
.qc-subject__img {
  flex: 1;
  width: 100%;
  object-fit: contain;
  min-height: 0;
  filter: grayscale(1);
  -webkit-user-drag: none;
}
.qc-subject--correct .qc-subject__img { filter: none; }
.qc-subject--wrong .qc-subject__img { filter: none; }
.qc-subject__label {
  font-family: 'Roboto', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #b2d338;
  text-align: center;
  line-height: 22px;
  letter-spacing: 0.016em;
  flex-shrink: 0;
  min-height: 44px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.qc-subject--correct .qc-subject__label { color: #47b334; }
.qc-subject--wrong .qc-subject__label { color: #e2195d; }

/* ── Progress dots ── */
.qc-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2.5px;
  flex-shrink: 0;
}
.qc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(178, 211, 56, 0.5);
  transition: width 0.2s, height 0.2s, background 0.2s;
}
.qc-dot--active {
  width: 15px;
  height: 15px;
  background: #b2d338;
}

/* ── Done ── */
.qc-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 16px;
  position: relative;
  background:
    url('/assets/epic-labs/drawer/mini-clash-again-bg.png') center / cover no-repeat,
    #b2d338;
  overflow: hidden;
}
.qc-done--try-again {
  background:
    url('/assets/epic-labs/flashcard/front-12.png') center / cover no-repeat,
    #ffffff;
}
.qc-done__content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.qc-done__title {
  position: relative;
  z-index: 1;
  font-family: 'Mikado', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #02613b;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  line-height: 32px;
  margin: 0;
  animation: qc-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
}
.qc-done__score {
  position: relative;
  z-index: 1;
  font-family: 'Mikado', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #02613b;
  letter-spacing: 0.25px;
  line-height: 28px;
  text-align: center;
  margin: 0;
  animation: qc-enter-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.38s both;
}
.qc-done .qc-btn {
  width: 180px;
  border-radius: 9999px;
  background: #02613b;
  box-shadow: none;
  color: white;
  position: relative;
  z-index: 1;
  transition: transform 0.1s;
  animation: qc-enter-up-far 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.46s both;
}
.qc-done .qc-btn:active:not(:disabled) {
  transform: scale(0.97);
  box-shadow: none;
}

@keyframes qc-enter-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes qc-enter-up-far {
  from { transform: translateY(60px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes qc-exit-fade-up {
  to { transform: translateY(-28px); opacity: 0; }
}

/* Infographic (h5-info-card) — ported from drawer-infographic.component.scss. */
.ig-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f5f5f5;
}
.ig-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}
/* ── Loading spinner ── */
.ig-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  z-index: 1;
}
.ig-spinner {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 5px solid ${V.C_LIGHT_SILVER};
  border-top-color: ${V.C_EXCLAIM_BLUE};
  animation: ig-spin 0.9s linear infinite;
}
.ig-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7c99;
  font-size: 14px;
}
@keyframes ig-spin {
  to { transform: rotate(360deg); }
}

/* Quiz single (race-lab) — ported from drawer-quiz-single.component.scss. */
.quiz-single-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px 16px;
}
.quiz-single-container .quiz-title {
  font-size: 24px;
  font-weight: 700;
  color: ${V.C_EXCLAIM_BLUE};
  text-align: center;
  margin: 0;
}
.quiz-single-container .quiz-start-btn,
.quiz-single-container .quiz-done-btn {
  width: 100%;
  background: ${V.C_EXCLAIM_BLUE};
  color: ${V.C_WHITE};
}
.quiz-single-container .quiz-progress {
  font-size: 14px;
  font-weight: 600;
  color: #6b7a99;
  align-self: flex-end;
}
.quiz-single-container .quiz-question {
  font-size: 20px;
  font-weight: 700;
  color: ${V.C_EXCLAIM_BLUE};
  text-align: center;
  margin: 0;
}
.quiz-single-container .quiz-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.quiz-single-container .option-btn {
  width: 100%;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 600;
  color: #3c4b62;
  background: #f9fafd;
  border: 3px solid transparent;
  border-radius: ${V.R_M};
  box-shadow: 0 1px 3px rgba(60, 75, 98, 0.15);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  text-align: left;
}
.quiz-single-container .option-btn:hover:not(:disabled) {
  border-color: ${V.C_EXCLAIM_BLUE};
  background: #f0f7ff;
}
.quiz-single-container .option-btn:disabled {
  cursor: default;
}
.quiz-single-container .option-btn.selected {
  border-color: ${V.C_EXCLAIM_BLUE};
  background: #f0f7ff;
}
.quiz-single-container .option-btn.correct {
  border-color: #008845;
  background: #edfcb4;
  color: #008845;
}
.quiz-single-container .option-btn.incorrect {
  border-color: #e2195d;
  background: #ffe8f0;
  color: #e2195d;
}
.quiz-single-container .quiz-result {
  text-align: center;
}
.quiz-single-container .quiz-result .result-score {
  font-size: 48px;
  font-weight: 800;
  color: ${V.C_EXCLAIM_BLUE};
  margin: 0;
}
.quiz-single-container .quiz-result .result-label {
  font-size: 18px;
  font-weight: 600;
  color: #3c4b62;
  margin: 8px 0 0;
}

/* Flip match (flip-card) — ported from drawer-flip-match.component.scss. */
.flip-match-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 22px 15px 15px;
  background: #ccecff;
  gap: 38px;
  box-sizing: border-box;
}
.flip-match-container .flip-title {
  font-family: 'Mikado', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #3c4b62;
  line-height: 28px;
  margin: 0 7px;
}
.flip-match-container .cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.flip-match-container .flip-card {
  aspect-ratio: 1;
  border-radius: 15px;
  border: none;
  background: transparent;
  cursor: pointer;
  position: relative;
  padding: 0;
  perspective: 600px;
  -webkit-tap-highlight-color: transparent;
}
.flip-match-container .flip-card:disabled {
  cursor: default;
}
.flip-match-container .flip-card__inner {
  position: absolute;
  inset: 0;
  border-radius: 15px;
  transform-style: preserve-3d;
  transition: transform 0.4s ease;
}
.flip-match-container .flip-card__back {
  position: absolute;
  inset: 0;
  border-radius: 15px;
  background: #63c5fd;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.flip-match-container .flip-card__back::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 2px solid rgba(10, 150, 230, 0.6);
  border-radius: 8px;
  pointer-events: none;
}
.flip-match-container .flip-card__question {
  font-family: 'Mikado', sans-serif;
  font-size: 48px;
  font-weight: 700;
  color: white;
  line-height: 1;
  letter-spacing: 0.25px;
  text-align: center;
}
.flip-match-container .flip-card__front {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 15px;
  overflow: hidden;
  transform: rotateY(180deg);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  padding: 0;
}
.flip-match-container .flip-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.flip-match-container .flip-card__text {
  font-family: 'Mikado', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #0a96e6;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  padding: 8px;
}
.flip-match-container .flip-card__check {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease 0.4s;
}
.flip-match-container .flip-card--open .flip-card__inner {
  transform: rotateY(180deg);
}
.flip-match-container .flip-card--matched .flip-card__inner {
  transform: rotateY(180deg);
}
.flip-match-container .flip-card--matched .flip-card__front {
  transition: outline 0s 0.4s;
}
.flip-match-container .flip-card--matched .flip-card__check {
  opacity: 1;
}
.flip-match-container .flip-card--wrong .flip-card__inner {
  transform: rotateY(180deg);
}

/* Drag fill — ported from drawer-drag-fill.component.scss. */
.df-root {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #ccecff;
  padding: 16px 22px 20px;
  overflow: hidden;
  container-type: size;
}
.df-timer-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-bottom: 18px;
  flex-shrink: 0;
}
.df-timer-secs {
  font-family: 'Mikado', sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: #0d9ce7;
  letter-spacing: 0.25px;
  line-height: 1;
}
.df-timer-bar {
  width: 100%;
  height: 14px;
  border-radius: 8px;
  background: #d3ddec;
  overflow: hidden;
}
.df-timer-fill {
  height: 100%;
  border-radius: 7px;
  background: #0d9ce7;
  transition: width 0.1s linear;
}
.df-instruction {
  font-family: 'Mikado', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #3c4b62;
  line-height: 28px;
  letter-spacing: 0.25px;
  margin: 0;
  flex-shrink: 0;
}
.df-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 13px;
  justify-content: center;
  padding: 12px 0;
}
.df-item {
  width: 100%;
  aspect-ratio: 255 / 162;
  border-radius: 16px;
  border: 4px solid #63c5fd;
  background: white;
  overflow: hidden;
  transition: opacity 0.25s;
  flex-shrink: 0;
}
.df-item--dragging {
  opacity: 0.4;
  border-color: #d1d8e2;
}
.df-item--placed {
  opacity: 0.4;
  border-color: #d1d8e2;
}
.df-item--draggable {
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.df-item__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

/* Tap match (match-characters) — ported from drawer-tap-match.component.scss. */
.tap-match-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 12px;
}
.tap-match-container .tap-match-title {
  font-size: 20px;
  font-weight: 700;
  color: ${V.C_EXCLAIM_BLUE};
  text-align: center;
  margin: 0;
}
.tap-match-container .tap-match-question {
  background: #f0f5ff;
  border-radius: ${V.R_M};
  padding: 14px 16px;
  width: 100%;
  text-align: center;
}
.tap-match-container .tap-match-question__text {
  font-size: 16px;
  font-weight: 700;
  color: #2a3a54;
  margin: 0 0 6px;
}
.tap-match-container .tap-match-question__progress {
  font-size: 12px;
  color: #6b7c99;
  margin: 0;
}
.tap-match-container .tap-match-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  width: 100%;
}
.tap-match-container .tap-match-char {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 80px;
  background: ${V.C_WHITE};
  border: 2px solid #d0d7e8;
  border-radius: ${V.R_M};
  padding: 8px 4px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.1s;
}
.tap-match-container .tap-match-char:hover:not(:disabled) {
  border-color: ${V.C_EXCLAIM_BLUE};
  transform: scale(1.04);
}
.tap-match-container .tap-match-char:disabled {
  cursor: default;
}
.tap-match-container .tap-match-char--matched {
  border-color: #008845;
  background: #edfcb4;
}
.tap-match-container .tap-match-char__img {
  width: 52px;
  height: 52px;
  object-fit: contain;
}
.tap-match-container .tap-match-char__name {
  font-size: 11px;
  font-weight: 600;
  color: #3c4b62;
  text-align: center;
  line-height: 1.2;
}
.tap-match-container .tap-match-char__check {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 14px;
  color: #008845;
}
.tap-match-container .tap-match-result {
  font-size: 18px;
  font-weight: 700;
  color: #008845;
  text-align: center;
}

/* Html card (h5-info-card / egg-html) — ported from drawer-html-card.component.scss. */
.html-card-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 12px;
}
.html-card-container .html-card-title {
  font-size: 20px;
  font-weight: 700;
  color: ${V.C_EXCLAIM_BLUE};
  text-align: center;
  margin: 0;
  flex-shrink: 0;
}
.html-card-container .html-card-frame-wrap {
  flex: 1;
  border-radius: ${V.R_M};
  overflow: hidden;
  border: 2px solid #d0d7e8;
}
.html-card-container .html-card-frame {
  width: 100%;
  height: 100%;
  display: block;
}
.html-card-container .html-card-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7c99;
  font-size: 14px;
}

/* Flashcard — fill in the missing face/back rules. The container/flip/face
   + .flashcard-face p + .flashcard-face .epic-btn already exist above in
   DRAWER_CSS; the source's .flashcard-back (rotateY) was missing. */
.flashcard-back {
  transform: rotateY(180deg);
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
  font-family: ${V.FONT_PRIMARY};
  overflow: visible;
}
.video-modal-frame {
  position: relative;
  width: min(1060px, calc(100vw - 200px), calc((100vh - 200px) * 16 / 9));
  max-height: calc(100vh - 200px);
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

    // --- Motion reward video (ported from EpicWeb inject/preload/showMotionContent) ---
    // A page with a `motion_url` plays a reward video over the book page once the
    // page's interaction is completed (comets lottie → motion video → collect gem).
    // - Pages with NO gating stars (or already-unlocked motion) play immediately on entry.
    // - Pages with stars inject the video hidden so the browser buffers while the
    //   user answers; it's revealed+played on completion.
    let currentMotionUrl: string | null = null
    const motionUnlockedPages = new Set<number>()
    const motionVideoEls: HTMLVideoElement[] = []
    let motionContainer: HTMLElement | null = null
    let motionResizeRafId: number | null = null

    function updateMotionPosition() {
      if (!motionContainer) return
      if (motionResizeRafId !== null) cancelAnimationFrame(motionResizeRafId)
      motionResizeRafId = requestAnimationFrame(() => {
        motionResizeRafId = null
        const rect = context.data.getFlipBookRect()
        if (!rect || !motionContainer) return
        const hostRect = (readingRoot as ShadowRoot).host.getBoundingClientRect()
        motionContainer.style.cssText = [
          'position:absolute',
          `top:${rect.y - hostRect.y}px`,
          `left:${rect.x - hostRect.x}px`,
          `width:${rect.width}px`,
          `height:${rect.height}px`,
          'pointer-events:none',
          // Above the book page, below star-overlay (z-index:1) so stars/drop
          // zones stay tappable; above shot overlay (z-index:0).
          'z-index:0',
        ].join(';')
      })
    }

    function clearMotionContent() {
      for (const video of motionVideoEls) video.remove()
      motionVideoEls.length = 0
    }

    function ensureMotionContainer() {
      if (motionContainer) return motionContainer
      motionContainer = document.createElement('div')
      motionContainer.className = 'motion-overlay-root'
      starContainer.appendChild(motionContainer)
      updateMotionPosition()
      return motionContainer
    }

    /** Inject motion video(s) covering the whole book page. `hidden` preloads
     *  without playing (used while the user is answering gated stars). */
    function injectMotionContent(hidden: boolean) {
      clearMotionContent()
      if (!currentMotionUrl) return
      ensureMotionContainer()
      const url = currentMotionUrl
      // A single video covers the full 2-page spread (the SDK reading-area slot
      // host IS the spread). EpicWeb injected two width:200% videos across two
      // page slots; one width:100% video is equivalent here.
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.loop = false
      video.setAttribute('playsinline', '')
      video.preload = hidden ? 'auto' : 'auto'
      video.autoplay = !hidden
      video.addEventListener('ended', () => video.pause())
      video.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;pointer-events:none;${hidden ? 'display:none;' : ''}`
      motionContainer!.appendChild(video)
      motionVideoEls.push(video)
    }

    function showMotionContent() {
      if (motionVideoEls.length === 0) {
        // Not preloaded — inject + play now.
        injectMotionContent(false)
        return
      }
      for (const video of motionVideoEls) {
        video.style.display = ''
        video.play().catch(() => {})
      }
    }

    /** Play the motion reward video to completion (resolves on 'ended'). */
    function playMotionVideoAndWait(): Promise<void> {
      return new Promise((resolve) => {
        showMotionContent()
        const video = motionVideoEls[0]
        if (!video) {
          resolve()
          return
        }
        const handler = () => {
          video.removeEventListener('ended', handler)
          resolve()
        }
        video.addEventListener('ended', handler)
        // Safety: if the video has no decodable stream it never fires 'ended'.
        // Resolve anyway after a generous timeout so the gem still collects.
        const safety = setTimeout(() => {
          video.removeEventListener('ended', handler)
          resolve()
        }, 30000)
        video.addEventListener('ended', () => clearTimeout(safety))
      })
    }

    /**
     * Play all completion animations in sequence (comets lottie → motion video),
     * mirroring EpicWeb playCompletionAnimations. Returns a Promise that resolves
     * when done (or null if nothing to play). launchComets needs the mark layer
     * (the reading-area slot host) to compute comet landing points.
     */
    function playCompletionAnimations(star: Star | null | undefined): Promise<void> | null {
      const activationPoints = star?.content?.flipMatchActivationPoints
      const hasComets = !!activationPoints?.length
      const hasMotionVideo = !!currentMotionUrl
      if (!hasComets && !hasMotionVideo) return null

      const markLayerEl = (context.slots.get('reading-area') as ShadowRoot | undefined)?.host as
        | HTMLElement
        | undefined
      let chain: Promise<void> = Promise.resolve()

      if (hasComets) {
        const cometsDone = motionOverlay.launchComets(activationPoints!, markLayerEl)
        chain = chain.then(() => cometsDone)
      } else {
        // No activation_points → launch a single default-center comet.
        const defaultPoint = { id: 'default', xPercent: 50, yPercent: 50 }
        const cometsDone = motionOverlay.launchComets([defaultPoint], markLayerEl)
        chain = chain.then(() => cometsDone)
      }

      if (hasMotionVideo) {
        chain = chain.then(() => playMotionVideoAndWait())
      }
      return chain
    }

    /**
     * Called on entry to a page: sets currentMotionUrl and either plays the
     * motion reward immediately (no gating stars, or already unlocked) or
     * injects it hidden so the browser buffers while the user answers.
     * Mirrors EpicWeb onPageChange motion handling.
     */
    function setupPageMotion(pageStars: Star[]) {
      currentMotionUrl = getCurrentPageMotionUrl(context) ?? null
      const page = context.data.getCurrentPage()
      const hasGatingStars = pageStars.some((s) => s.type !== 'game')
      if (!hasGatingStars || motionUnlockedPages.has(page)) {
        // No gating, or already unlocked on a prior visit — play immediately.
        if (currentMotionUrl) injectMotionContent(false)
      } else {
        // Has stars: inject hidden so the browser buffers while user answers.
        if (currentMotionUrl) injectMotionContent(true)
      }
    }

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
      shots: getCurrentPageShots(context),
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
    // The reader's book data and current-page both hydrate asynchronously.
    // At activate() time either can be unresolved:
    //   - labData not yet a valid string → getLabsData() returns null
    //   - getCurrentPage() still 0 → matches no parsed pageNumber → stars empty
    // Both resolve lazily (parsedLabsData isn't cached on null; the reader
    // sets the real page once the book is open). If our initial state landed on
    // an invalid page (state.page not in any parsed page), poll until it
    // resolves to a valid one — then sync the reactive state so StarOverlay
    // renders without needing a manual page turn. Stops on success or timeout.
    const initialPageValid = !!bookData && state.page > 0
    if (!initialPageValid) {
      let syncTries = 0
      const syncTimer = setInterval(() => {
        syncTries += 1
        const data = getLabsData(context)
        const page = context.data.getCurrentPage()
        const pageValid = !!data && page > 0
        if (pageValid) {
          clearInterval(syncTimer)
          state.page = page
          state.stars = getCurrentPageStars(context)
          state.clickVideos = getCurrentPageClickVideos(context)
          state.shots = getCurrentPageShots(context)
          // Motion reward is set up after starContainer exists (see below).
          mountShotOverlay()
          // bookData resolved late — mount the KeyGemOverlay if this book has a
          // treasure config and it wasn't mounted at activate() time (guarded
          // internally so it only mounts once).
          if (data?.treasureConfig) {
            mountKeyGemOverlay(data)
          }
          // Prime the next-page preload now that we know the page layout.
          shotPreloadQueue.enqueuePage(
            getNextPageShots(context).map((s) => appendCacheBuster(s.url)),
          )
        } else if (syncTries >= 100) {
          // ~10s at 100ms; give up silently — empty labs / page 0 may be a
          // valid initial state for books with no interactive content.
          clearInterval(syncTimer)
        }
      }, 100)
    }

    // Stash ids so the KeyGemOverlay can restore them once mounted (below).
    // The restore + persist now live inside mountKeyGemOverlay() so they run
    // on both the immediate and deferred mount paths.
    let pendingRestoreIds: string[] | null = null


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
      memory: interactionMemory,
      clickVideos: state.clickVideos,
      // Wire click-video buttons to open the video modal.
      onVideoClick: (url: string) => {
        state.videoModalData = { videoUrl: url, skipLabel: 'Skip' }
        videoModalType = 'click'
        state.activeModal = 'video'
        context.commands.execute('openModal', getVideoModalSize())
      },
    })
    starApp.mount(starContainer)

    // Set up the initial page's motion reward now that starContainer exists.
    // (setupPageMotion is also called on every pageChange below.)
    setupPageMotion(state.stars)

    // --- Shot video overlay — per-page <shots> sequence, below star-overlay ---
    const shotPreloadQueue = createShotPreloadQueue()
    let shotPlayer: ShotPlayer | null = null
    let shotContainer: HTMLElement | null = null
    let shotResizeObserver: ResizeObserver | null = null
    let shotResizeHandler: (() => void) | null = null
    let shotRafId: number | null = null
    const updateShotPosition = () => {
      if (!shotContainer) return
      if (shotRafId !== null) cancelAnimationFrame(shotRafId)
      shotRafId = requestAnimationFrame(() => {
        shotRafId = null
        const rect = context.data.getFlipBookRect()
        if (!rect || !shotContainer) return
        const hostRect = (readingRoot as ShadowRoot).host.getBoundingClientRect()
        shotContainer.style.cssText = [
          'position:absolute',
          `top:${rect.y - hostRect.y}px`,
          `left:${rect.x - hostRect.x}px`,
          `width:${rect.width}px`,
          `height:${rect.height}px`,
          'pointer-events:none',
          'z-index:0', // below star-overlay (z-index:1), above the book page
        ].join(';')
      })
    }
    const mountShotOverlay = () => {
      // Tear down the previous mount (page turned, or re-mounting).
      if (shotPlayer) {
        shotPlayer.destroy()
        shotPlayer = null
      }
      if (shotContainer) {
        shotContainer.remove()
        shotContainer = null
      }
      // Page has no shots — leave nothing mounted.
      if (!state.shots.length) return

      shotContainer = document.createElement('div')
      shotContainer.className = 'shot-overlay-root'
      starContainer.appendChild(shotContainer)
      updateShotPosition()

      shotPlayer = new ShotPlayer({
        container: shotContainer,
        shots: state.shots,
        queue: shotPreloadQueue,
        // MarkLayer (star-overlay) appears in sync with the SVG subtitle:
        // hidden while any audible (loop>=1) shot plays, faded in 1s after a
        // loop=0 terminal background shot starts.
        onMarkLayer: (visible: boolean) => {
          // Toggle only the MarkLayer (star-overlay) element, NOT the root
          // container — the shot overlay lives inside the same root and must
          // stay visible while videos play. Semantics is inverted from the
          // default: .star-overlay is visible by default (stars show on
          // pages without shots); ShotPlayer hides it during preload/audible
          // playback and reveals it 1s into a loop=0 background shot.
          const markLayer = starContainer.querySelector('.star-overlay')
          if (!markLayer) return
          if (visible) markLayer.classList.remove('star-overlay--hidden')
          else markLayer.classList.add('star-overlay--hidden')
        },
        // Two-phase page turn: when the user taps next while resting on a
        // loop=0 background (and the page also has a loop>=1 audible shot),
        // the player replays the audible shot first, then asks us here to
        // perform the real page turn once it finishes. We must call the
        // ORIGINAL reader command — going through the hooked execute would
        // re-enter the interceptor and swallow it again.
        onRequestPageTurn: (direction: 'next' | 'prev') => {
          originalExecute(direction === 'next' ? 'nextPage' : 'previousPage')
        },
      })
    }
    mountShotOverlay()
    // Prime the next page's shots on initial mount (concurrency=1, queued
    // after the current page's front/back loads).
    shotPreloadQueue.enqueuePage(
      getNextPageShots(context).map((s) => appendCacheBuster(s.url)),
    )
    shotResizeObserver = new ResizeObserver(() => {
      updateShotPosition()
      updateMotionPosition()
    })
    shotResizeObserver.observe((readingRoot as ShadowRoot).host)
    shotResizeHandler = () => {
      updateShotPosition()
      updateMotionPosition()
    }
    window.addEventListener('resize', shotResizeHandler)

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
          // Above the shot overlay's white backing (.shot-overlay-root sits at
          // z-index:0 via shotContainer). Without this, the shot player's opaque
          // white .shot-overlay covers the key/gem/portal layer on pages that
          // have shots — only the key region faintly shows through at opacity
          // 0.4 (hover → 1). Matching star-overlay's z-index:1 keeps the key/gem
          // interaction layer above the video, same as the original EpicWeb
          // (which has no shot white-backing at all).
          'z-index:1',
          'container-type:size',
        ].join(';')
      })
    }
    // Lazily mount the KeyGemOverlay once bookData with a treasureConfig is
    // available. The reader's labData hydrates asynchronously — at activate()
    // time bookData may still be null (see the page-sync polling above). The
    // original EpicWeb KeyGemOverlay is template-driven (*ngIf on
    // treasureConfig) so it renders the moment data arrives; here we replicate
    // that by calling this both immediately (if bookData is ready) and from the
    // page-sync poller once bookData resolves. Guarded so it only mounts once.
    const mountKeyGemOverlay = (data: EpicReaderBookData) => {
      if (keyGemApp || !data.treasureConfig) return
      // Restore previously collected keys for this book (no animation) and
      // register persistence. Done here — not in activate's main body — so the
      // deferred mount path (data arriving late via the poller) also restores.
      if (state.bookId !== undefined) {
        const collected = treasureService.loadPersisted(state.bookId)
        if (collected.length) pendingRestoreIds = collected
        treasureService.persist(state.bookId)
      }
      keyGemContainer = document.createElement('div')
      starContainer.appendChild(keyGemContainer)
      updateKeyGemPosition()
      keyGemResizeObserver = new ResizeObserver(updateKeyGemPosition)
      keyGemResizeObserver.observe((readingRoot as ShadowRoot).host)
      keyGemResizeHandler = updateKeyGemPosition
      window.addEventListener('resize', keyGemResizeHandler)

      keyGemApp = createApp(KeyGemOverlay, {
        epicLabsBookData: data,
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
    if (bookData?.treasureConfig) {
      mountKeyGemOverlay(bookData)
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
      context.commands.execute('openModal', getVideoModalSize())
    }

    // --- Events ---
    const unsubPage = context.events.on('pageChange', (payload: any) => {
      // Fire PAGE_CLOSE for the page we're leaving, using its accumulated stats.
      const prevPage = state.page
      const prevStars = state.stars
      const stayDuration = Math.round((Date.now() - currentPageOpenedAt) / 1000)
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
      state.shots = getCurrentPageShots(context)
      // Clear the previous page's motion reward video before setting up the new one.
      clearMotionContent()
      setupPageMotion(state.stars)
      updateMotionPosition()
      state.selectedStar = null
      drawerStore.resetDrawerState()
      keyGemOverlayRef?.resetPortalVisualState()
      // Drain the old page's preload tasks (and cancel the in-flight pool
      // download) before the new page's ShotOverlay starts loading.
      shotPreloadQueue.drain()
      updateShotPosition()
      mountShotOverlay()
      // Preload the NEXT page's shots at low priority. ShotOverlay's own
      // front/back loads run at higher priority via the same queue
      // (concurrency=1, serialized).
      shotPreloadQueue.enqueuePage(
        getNextPageShots(context).map((s) => appendCacheBuster(s.url)),
      )
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
            stay_duration: Math.round(drawerStore.getStayDuration() / 1000),
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

    // --- Completion reward: comets lottie → motion video → collect gem ---
    // Ported from EpicWeb onInteractionComplete / playCompletionAnimations.
    // The drawer fires a complete event when an interaction finishes; here we
    // (1) unlock the page's motion reward, (2) play the comets + motion video
    // sequence, then (3) collect the gem after the animations finish.
    function isInteractionComplete(event: DrawerCompleteEvent): boolean {
      switch (event.type) {
        case 'multiple-choice':
          return !!(event.data as { hasAnswered?: boolean }).hasAnswered
        case 'flashcard':
          return !!(event.data as { isRevealed?: boolean }).isRevealed
        case 'hotspot':
          return true
        default:
          return !!(event.data as { isComplete?: boolean }).isComplete
      }
    }

    const unsubComplete = drawerStore.drawerComplete.on((event) => {
      if (!event || !isInteractionComplete(event)) return

      const pageIndex = drawerStore.state.pageIndex
      const starIndex = drawerStore.state.starIndex
      const star = state.selectedStar

      // Unlock this page's motion reward (page always added when eligible).
      if (pageIndex != null && currentMotionUrl) {
        motionUnlockedPages.add(pageIndex)
      }

      const shouldCollectGem =
        !!star?.content?.treasure && pageIndex != null && starIndex != null

      const collectGem = () => {
        if (!shouldCollectGem) return
        keyGemOverlayRef?.collect(`${pageIndex}_${starIndex}`, starIndex, star!.type)
      }

      const animDone = playCompletionAnimations(star)
      if (animDone) {
        animDone.then(() => collectGem())
      } else {
        collectGem()
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
      // Two-phase page turn: on pages that mix loop=0 (background) and loop>=1
      // (audible) shots, the first "next page" tap while resting on the loop=0
      // background does NOT advance the book — the ShotPlayer replays the
      // audible shot and later requests the real turn via onRequestPageTurn
      // (which calls originalExecute directly, bypassing this interceptor).
      // previousPage always passes through.
      if (command === 'nextPage' && shotPlayer) {
        const action = shotPlayer.consumePageTurn('next')
        if (action === 'swallow') return
      }
      originalExecute(command, payload)
    }

    // Expose the KeyGemOverlay's imperative API once mounted. Vue mounts
    // synchronously above, so we read the component instance ref here.

    // --- Cleanup ---
    return () => {
      // Reading session ending — fire the final page-close and exit events.
      const finalStayDuration = Math.round((Date.now() - currentPageOpenedAt) / 1000)
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
      // Durations are logged in seconds to match EpicWeb (it Math.round(ms/1000)
      // for both stay_duration and reading_duration — epic-labs.component.ts:1051,1541).
      const readingDuration = Math.round((Date.now() - sessionStart) / 1000)
      analytics.log(EPIC_LABS_EXIT_READING, {
        treasure_collected_count: treasureService.getCollectedCount(),
        treasure_total_count: treasureService.getTotalCount(),
        // Matches EpicWeb: "is_treasure_box_opened = game has been unlocked
        // (all treasures collected)" — epic-labs.component.ts:1533.
        is_treasure_box_opened: treasureService.isGameUnlocked() ? 1 : 0,
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
      unsubComplete()
      unsubModal()
      unmountModal()
      drawerApp?.unmount()
      drawerContainer?.remove()
      keyGemApp?.unmount()
      keyGemResizeObserver?.disconnect()
      if (keyGemResizeHandler) window.removeEventListener('resize', keyGemResizeHandler)
      if (keyGemRafId !== null) cancelAnimationFrame(keyGemRafId)
      keyGemContainer?.remove()
      shotPlayer?.destroy()
      shotResizeObserver?.disconnect()
      if (shotResizeHandler) window.removeEventListener('resize', shotResizeHandler)
      if (shotRafId !== null) cancelAnimationFrame(shotRafId)
      shotContainer?.remove()
      clearMotionContent()
      if (motionResizeRafId !== null) cancelAnimationFrame(motionResizeRafId)
      motionContainer?.remove()
      motionContainer = null
      motionUnlockedPages.clear()
      shotPreloadQueue.dispose()
      starApp.unmount()
      starContainer.remove()
      interactionMemory.reset()
      drawerStore.dispose()
      treasureService.dispose()
      motionOverlay.dispose()
    }
  },
}
