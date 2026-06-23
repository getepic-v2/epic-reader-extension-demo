import { createApp, reactive } from 'vue'
import StarOverlay from './components/StarOverlay.vue'
import DrawerPanel from './components/DrawerPanel.vue'
import GameContent from './components/GameContent.vue'
import { injectStyles } from './utils/styles'
import type { ExtensionContext, Star, ClickVideo, EpicReaderBookData } from './types'
import { parseLabsXml } from './utils/parse-labs-xml'
import { createDrawerStore } from './composables/useDrawerStore'
import { createAnalytics } from './composables/useAnalytics'
import { EPIC_LABS_STAR_CLICK, EPIC_LABS_PAGE_EXPOSURE } from './constants/analytics-events'

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
`

declare const __EXTENSION_GLOBAL_NAME__: string
;(window as any)[__EXTENSION_GLOBAL_NAME__] = {
  activate(context: ExtensionContext) {
    // --- Shared services ---
    const drawerStore = createDrawerStore()
    const analytics = createAnalytics(context)

    // --- State ---
    const state = reactive({
      page: context.data.getCurrentPage(),
      bookId: context.data.getBookId(),
      stars: getCurrentPageStars(context),
      clickVideos: getCurrentPageClickVideos(context),
      selectedStar: null as Star | null,
    })

    // page exposure analytics on first load
    analytics.log(EPIC_LABS_PAGE_EXPOSURE, {
      bookId: state.bookId,
      page: state.page,
    })

    // --- Reading area: render stars + interaction layers ---
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
    })
    starApp.mount(starContainer)

    // --- Events ---
    const unsubPage = context.events.on('pageChange', (payload: any) => {
      state.page = payload?.pageIndex ?? context.data.getCurrentPage()
      state.stars = getCurrentPageStars(context)
      state.clickVideos = getCurrentPageClickVideos(context)
      state.selectedStar = null
      drawerStore.resetDrawerState()
      analytics.log(EPIC_LABS_PAGE_EXPOSURE, {
        bookId: state.bookId,
        page: state.page,
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

          drawerApp = createApp(DrawerPanel, { store: drawerStore, star: state.selectedStar })
          drawerApp.mount(drawerContainer)
        } catch {
          // drawer slot not ready
        }
      } else {
        drawerApp?.unmount()
        drawerContainer?.remove()
        drawerApp = null
        drawerContainer = null
      }
    })

    // --- Modal (for game stars) ---
    let modalApp: ReturnType<typeof createApp> | null = null
    let modalContainer: HTMLElement | null = null

    const unsubModal = context.events.on('modalStateChange', (payload: any) => {
      if (payload?.mounted) {
        try {
          const modalRoot = context.slots.get('modal')
          injectStyles(modalRoot, MODAL_CSS, 'epic-modal-styles')

          modalContainer = document.createElement('div')
          modalContainer.style.cssText = 'width:100%;height:100%;'
          modalRoot.appendChild(modalContainer)

          modalApp = createApp(GameContent, { content: state.selectedStar?.content })
          modalApp.mount(modalContainer)
        } catch {
          // modal slot not ready
        }
      } else {
        modalApp?.unmount()
        modalContainer?.remove()
        modalApp = null
        modalContainer = null
      }
    })

    // --- Intercept openDrawer to handle game stars + sync store ---
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
        analytics.log(EPIC_LABS_STAR_CLICK, {
          bookId: state.bookId,
          page: state.page,
          starType: star.type,
        })

        if (star.type === 'game') {
          originalExecute('openModal', { width: 960, height: 640 })
          return
        }
      }
      originalExecute(command, payload)
    }

    // --- Cleanup ---
    return () => {
      unsubPage()
      unsubDrawer()
      unsubModal()
      modalApp?.unmount()
      modalContainer?.remove()
      drawerApp?.unmount()
      drawerContainer?.remove()
      starApp.unmount()
      starContainer.remove()
      drawerStore.dispose()
    }
  },
}
