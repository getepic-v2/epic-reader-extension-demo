# Epic Reader Extension Example: Star Interaction Extension

This example walks through building a full star-interaction extension, including:

- Rendering interactive stars on book pages by coordinates
- Listening for page changes to update stars
- Opening the side drawer on star tap and rendering content (quizzes, flashcards, puzzles)
- Opening a modal for game-type interactions
- A complete cleanup implementation

---

## 1. Project structure

```
thinkacademy-star-extension/
├── src/
│   └── extension/
│       ├── index.ts               ← Extension entry
│       ├── types.ts               ← TypeScript types
│       ├── utils/
│       │   ├── styles.ts          ← Shadow DOM style injection helpers
│       │   └── parse-labs-xml.ts  ← Interactive data XML parser
│       └── components/
│           ├── StarOverlay.vue    ← Star overlay component
│           ├── DrawerPanel.vue    ← Drawer content router
│           ├── MultipleChoice.vue ← Multiple-choice interaction
│           ├── Flashcard.vue      ← Flashcard flip component
│           ├── Puzzle.vue         ← Puzzle game component
│           └── GameContent.vue    ← Game content component (rendered inside host modal)
├── scripts/
│   └── dev-server.mjs             ← Local dev server
├── manifest.json
├── vite.config.ts
└── package.json
```

---

## 2. manifest.json

```json
{
  "id": "thinkacademy-star-extension",
  "name": "ThinkAcademy Star Extension",
  "version": "1.0.0",
  "globalName": "EpicLabsStarExtension",
  "entry": "EpicLabsStarExtension-main.js"
}
```

---

## 3. Core code

### 3.1 Extension entry (plain JavaScript)

Below is a framework-free JavaScript implementation:

```javascript
(function() {

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Inject styles into ShadowRoot (idempotent; won’t inject twice)
   */
  function injectStyles(shadowRoot, css, id) {
    if (shadowRoot.querySelector('#' + id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    shadowRoot.prepend(style);
  }

  /**
   * Offset of the flip book relative to the slot’s parent container.
   * Used to position interactive elements precisely on the page.
   */
  function getFlipBookOffset(context) {
    var rect = context.data.getFlipBookRect();
    if (!rect) return null;
    var parent = document.getElementById('read-container');
    if (!parent) return { top: 0, left: 0, width: rect.width, height: rect.height };
    var parentRect = parent.getBoundingClientRect();
    return {
      top: rect.y - parentRect.y,
      left: rect.x - parentRect.x,
      width: rect.width,
      height: rect.height,
    };
  }

  // ==========================================
  // Data parsing (implement for your own format)
  // ==========================================

  /**
   * Parse interactive data and return interaction points for the current page.
   * @param {*} labsData - Raw data from context.data.getLabsData()
   * @param {number} currentPage - Current page number
   * @returns {Array} List of interaction points
   *
   * Each point shape:
   * {
   *   type: 'multiple-choice',           // interaction type
   *   coordinates: { x: 0.45, y: 0.60 }, // position on page (0–1)
   *   content: { ... }                   // payload (varies by type)
   * }
   */
  function getStarsForPage(labsData, currentPage) {
    // Example only; replace with your real data shape.
    if (!labsData || !labsData.pages) return [];
    var page = labsData.pages.find(function(p) {
      return p.pageNumber === currentPage;
    });
    return page ? page.stars || [] : [];
  }

  // ==========================================
  // Styles
  // ==========================================

  var STAR_CSS = [
    // Star overlay (aligned with the book page)
    '.star-overlay {',
    '  position: relative;',
    '  width: 100%;',
    '  height: 100%;',
    '}',

    // Star buttons
    '.star-btn {',
    '  position: absolute;',
    '  pointer-events: auto;',
    '  width: 10%;',
    '  height: 10%;',
    '  padding: 0;',
    '  cursor: pointer;',
    '  border: none;',
    '  background: transparent;',
    '  box-shadow: none;',
    '  transform: translate(-50%, -100%);',
    '  font-size: 28px;',
    '  z-index: 1;',
    '  transition: transform 0.2s ease;',
    '}',
    '.star-btn:hover {',
    '  transform: translate(-50%, -100%) scale(1.15);',
    '}',

    // Breathing animation
    '.star-btn--animated {',
    '  animation: star-breathe 2.6s ease-in-out infinite;',
    '}',
    '@keyframes star-breathe {',
    '  0%, 100% { transform: translate(-50%, -100%) scale(0.9); }',
    '  50% { transform: translate(-50%, -100%) scale(1); }',
    '}',
  ].join('\n');

  var DRAWER_CSS = [
    '.drawer-content {',
    '  padding: 24px;',
    '  font-family: Arial, sans-serif;',
    '  height: 100%;',
    '  box-sizing: border-box;',
    '  overflow-y: auto;',
    '}',
    '.drawer-title {',
    '  margin: 0 0 16px;',
    '  font-size: 20px;',
    '  font-weight: 700;',
    '  color: #17324d;',
    '}',
    '.drawer-type {',
    '  display: inline-block;',
    '  padding: 4px 12px;',
    '  border-radius: 12px;',
    '  background: #e8f4fd;',
    '  color: #0a96e6;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  margin-bottom: 16px;',
    '}',
    '.drawer-text {',
    '  margin: 0 0 12px;',
    '  font-size: 14px;',
    '  line-height: 1.6;',
    '  color: #4c5f75;',
    '}',
  ].join('\n');

  // ==========================================
  // Extension body
  // ==========================================

  window.EpicLabsStarExtension = {
    activate: function(context) {

      // --- Mount container ---
      var readingRoot = context.slots.get('reading-area');
      injectStyles(readingRoot, STAR_CSS, 'star-styles');

      var container = document.createElement('div');
      container.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      readingRoot.appendChild(container);

      var selectedStar = null;

      // --- Render stars ---
      function renderStars() {
        container.innerHTML = '';

        var labsData = context.data.getLabsData();
        var currentPage = context.data.getCurrentPage();
        var stars = getStarsForPage(labsData, currentPage);

        if (stars.length === 0) return;

        var offset = getFlipBookOffset(context);
        if (!offset) return;

        // Overlay aligned to the flip book
        var overlay = document.createElement('div');
        overlay.className = 'star-overlay';
        overlay.style.cssText =
          'position:absolute;' +
          'top:' + offset.top + 'px;' +
          'left:' + offset.left + 'px;' +
          'width:' + offset.width + 'px;' +
          'height:' + offset.height + 'px;' +
          'pointer-events:none;';

        stars.forEach(function(star, index) {
          var btn = document.createElement('button');
          btn.className = 'star-btn star-btn--animated';
          btn.style.left = (star.coordinates.x * 100) + '%';
          btn.style.top = (star.coordinates.y * 100) + '%';
          btn.textContent = star.type === 'game' ? '🎮' : '⭐';
          btn.setAttribute('aria-label', 'Interactive ' + star.type + ' content');

          btn.onclick = function() {
            selectedStar = star;
            if (star.type === 'game') {
              // Game stars open a modal instead of the drawer
              context.commands.execute('openModal', { width: 960, height: 640 });
            } else {
              context.commands.execute('openDrawer', {
                star: star,
                starIndex: index,
              });
            }
          };

          overlay.appendChild(btn);
        });

        container.appendChild(overlay);
      }

      // First paint
      renderStars();

      // --- Events ---

      // After page change: refresh stars
      var unsubPage = context.events.on('pageChange', function(payload) {
        // payload.pageIndex   — new page index
        // payload.source      — 'arrow' | 'slider' | 'rtm' | 'programmatic'
        // payload.direction   — 1 (forward) | -1 (backward) | 0 (same page)
        selectedStar = null;
        renderStars();
      });

      // Page turn animation start: clear stars immediately (avoid leftovers)
      var unsubTurn = context.events.on('pageTurnStart', function() {
        container.innerHTML = '';
      });

      // Drawer open/close: render or clear drawer content
      var unsubDrawer = context.events.on('drawerStateChange', function(payload) {
        if (payload && payload.mounted && selectedStar) {
          var drawerRoot = context.slots.get('drawer');
          injectStyles(drawerRoot, DRAWER_CSS, 'drawer-styles');

          var content = document.createElement('div');
          content.className = 'drawer-content';

          var title = document.createElement('h3');
          title.className = 'drawer-title';
          title.textContent = 'Interactive Content';

          var typeBadge = document.createElement('span');
          typeBadge.className = 'drawer-type';
          typeBadge.textContent = selectedStar.type;

          var desc = document.createElement('p');
          desc.className = 'drawer-text';
          desc.textContent = 'This content is rendered by a third-party extension. The extension has full control over the drawer UI.';

          var pageInfo = document.createElement('p');
          pageInfo.className = 'drawer-text';
          pageInfo.textContent = 'Book: ' + context.data.getBookId() + ' | Page: ' + context.data.getCurrentPage();

          content.appendChild(title);
          content.appendChild(typeBadge);
          content.appendChild(desc);
          content.appendChild(pageInfo);
          drawerRoot.appendChild(content);
        }
      });

      // Modal open/close: render or clear game content
      var unsubModal = context.events.on('modalStateChange', function(payload) {
        if (payload && payload.mounted && selectedStar) {
          var modalRoot = context.slots.get('modal');

          var iframe = document.createElement('iframe');
          iframe.src = selectedStar.content.url || '';
          iframe.style.cssText = 'width:100%;height:100%;border:none;';
          iframe.setAttribute('allowfullscreen', '');
          modalRoot.appendChild(iframe);
        }
      });

      // --- Cleanup ---
      return function() {
        unsubPage();
        unsubTurn();
        unsubDrawer();
        unsubModal();
        container.remove();
      };
    }
  };

})();
```

---

## 4. Vue 3 version

If you build with Vue 3, the extension entry looks like this:

```typescript
// src/extension/index.ts
import { createApp, reactive } from ‘vue’
import StarOverlay from ‘./components/StarOverlay.vue’
import DrawerPanel from ‘./components/DrawerPanel.vue’
import GameContent from ‘./components/GameContent.vue’
import { injectStyles } from ‘./utils/styles’
import { parseLabsXml } from ‘./utils/parse-labs-xml’
import type { ExtensionContext, Star, EpicReaderBookData } from ‘./types’

let parsedData: EpicReaderBookData | null = null

function getLabsData(context: ExtensionContext): EpicReaderBookData | null {
  if (parsedData) return parsedData
  const raw = context.data.getLabsData()
  if (!raw || typeof raw !== ‘string’) return null
  try { parsedData = parseLabsXml(raw) } catch { /* parse failed */ }
  return parsedData
}

function getPageStars(context: ExtensionContext): Star[] {
  const data = getLabsData(context)
  if (!data?.pages) return []
  const page = data.pages.find(p => p.pageNumber === context.data.getCurrentPage())
  return page?.stars || []
}

;(window as any).EpicLabsStarExtension = {
  activate(context: ExtensionContext) {
    const root = context.slots.get(‘reading-area’)
    injectStyles(root, STAR_CSS, ‘star-styles’)

    const container = document.createElement(‘div’)
    container.style.cssText = ‘position:absolute;inset:0;pointer-events:none;’
    root.appendChild(container)

    // Reactive state
    const state = reactive({
      page: context.data.getCurrentPage(),
      stars: getPageStars(context),
      selectedStar: null as Star | null,
    })

    // Mount Vue into ShadowRoot
    const app = createApp(StarOverlay, { context, state })
    app.mount(container)

    // Page changes
    // payload: { pageIndex, source: ‘arrow’|’slider’|’rtm’|’programmatic’, direction: 1|-1|0 }
    const unsubPage = context.events.on(‘pageChange’, (payload: any) => {
      state.page = payload?.pageIndex ?? context.data.getCurrentPage()
      state.stars = getPageStars(context)
      state.selectedStar = null
    })

    // Drawer (for quizzes, flashcards, puzzles)
    let drawerApp: ReturnType<typeof createApp> | null = null
    let drawerContainer: HTMLElement | null = null

    const unsubDrawer = context.events.on(‘drawerStateChange’, (payload: any) => {
      if (payload?.mounted && state.selectedStar) {
        const drawerRoot = context.slots.get(‘drawer’)
        injectStyles(drawerRoot, DRAWER_CSS, ‘drawer-styles’)
        drawerContainer = document.createElement(‘div’)
        drawerContainer.style.cssText = ‘width:100%;height:100%;’
        drawerRoot.appendChild(drawerContainer)
        drawerApp = createApp(DrawerPanel, { star: state.selectedStar })
        drawerApp.mount(drawerContainer)
      } else {
        drawerApp?.unmount()
        drawerContainer?.remove()
        drawerApp = null
        drawerContainer = null
      }
    })

    // Modal (for game stars)
    let modalApp: ReturnType<typeof createApp> | null = null
    let modalContainer: HTMLElement | null = null

    const unsubModal = context.events.on(‘modalStateChange’, (payload: any) => {
      if (payload?.mounted && state.selectedStar) {
        const modalRoot = context.slots.get(‘modal’)
        injectStyles(modalRoot, MODAL_CSS, ‘modal-styles’)
        modalContainer = document.createElement(‘div’)
        modalContainer.style.cssText = ‘width:100%;height:100%;’
        modalRoot.appendChild(modalContainer)
        modalApp = createApp(GameContent, { content: state.selectedStar.content })
        modalApp.mount(modalContainer)
      } else {
        modalApp?.unmount()
        modalContainer?.remove()
        modalApp = null
        modalContainer = null
      }
    })

    // Intercept openDrawer: route game stars to modal
    const originalExecute = context.commands.execute.bind(context.commands)
    context.commands.execute = (command: string, payload?: any) => {
      if (command === ‘openDrawer’ && payload?.star) {
        if (payload.star.type === ‘game’) {
          state.selectedStar = payload.star
          originalExecute(‘openModal’, { width: 960, height: 640 })
          return
        }
        state.selectedStar = payload.star
      }
      originalExecute(command, payload)
    }

    // Cleanup
    return () => {
      unsubPage()
      unsubDrawer()
      unsubModal()
      modalApp?.unmount()
      modalContainer?.remove()
      drawerApp?.unmount()
      drawerContainer?.remove()
      app.unmount()
      container.remove()
    }
  }
}
```

**Notes:**

- `createApp().mount()` can mount to any node inside a ShadowRoot.
- Use `reactive()` so UI updates when state changes.
- CSS must be injected as strings into the ShadowRoot; Vue `<style>` blocks go to `document.head` and won’t apply inside the shadow tree by default.
- Game stars use `openModal` instead of `openDrawer`. The host provides the modal shell (backdrop, close button, ESC handling); the extension only renders content into the `modal` slot.

---

## 5. Vite build config

```typescript
// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'))
const globalName: string = manifest.globalName

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ...(mode === 'extension' ? {
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('./src/extension/index.ts', import.meta.url)),
        name: globalName,
        formats: ['iife'] as const,
        fileName: () => `${globalName}-main.js`,
      },
      cssCodeSplit: false,
      outDir: 'dist-extension',
      emptyOutDir: true,
    },
  } : {}),
}))
```

**Scripts:**

```bash
# Development (watch)
npm run dev:extension    # vite build --mode extension --watch

# Production
npm run build:extension  # vite build --mode extension
```

---

## 6. Debugging workflow

```bash
# Terminal 1: continuous build
npm run dev:extension

# Terminal 2: local static server
npm run dev:serve

# Browser: open the QA reader
# https://webqa-new.getepic.dev/app/read/{bookId}

# DevTools console (one-time):
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/EpicLabsStarExtension-main.js')

# Reload; the extension loads from your dev server.
# Edit code → auto rebuild → refresh → see changes
```
