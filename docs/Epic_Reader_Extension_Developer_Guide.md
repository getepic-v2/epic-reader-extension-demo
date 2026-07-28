# Epic Reader Extension Developer Guide

> Version: 1.2.0  
> Last Updated: 2026-07-16

> **New partner?** Please read the [Onboarding Guide](./Onboarding_Guide.md) first to request your repository, API credentials, and test account.

---

## 1. Overview

### 1.1 What is Reader Extension

Epic Reader Extension is an extension mechanism provided by the Epic Reader that allows third-party teams to develop interactive features for books (such as star interactions, games, quizzes, etc.).

Extensions run within the real reader environment and interact with the reader through a Context API provided by the host.

### 1.2 Design Philosophy

Inspired by the VS Code Extension design pattern:
- The **host** (reader) provides platform capabilities: rendering containers, data interfaces, commands, and events
- The **extension** (third-party) is responsible for feature implementation and UI
- Both interact through a stable API contract, independent of each other's internal implementation

### 1.3 Technology Stack

**No framework restrictions.** You can use Vue, React, Svelte, vanilla JavaScript, or any technology that compiles to JS.

The final deliverable is a **single JS file** in IIFE format.

---

## 2. Core Concepts

### 2.1 Extension Lifecycle

```
Host loads extension JS file
    │
    ▼
Host calls extension.activate(context)
    │
    ├── Extension gets rendering containers via context.slots
    ├── Extension reads book and interaction data via context.data
    ├── Extension listens to page-turn and RTM setting events via context.events
    ├── Extension executes actions like opening a drawer or modal via context.commands
    ├── Extension takes over host controls (e.g. RTM play button) via context.delegations
    │
    ▼
User reads and interacts
    │
    ▼
Host calls cleanup() (the function returned by activate)
    │
    └── Extension cleans up DOM, unsubscribes, destroys instances
```

### 2.2 ShadowDOM Isolation

Extension UI is rendered inside a ShadowDOM container:
- Your CSS **will not affect** the host page
- The host CSS **will not affect** your UI
- You can freely use generic class names like `.title`, `.button`

**Note: ShadowDOM only isolates CSS, not JS.** Do not directly manipulate the host DOM.

### 2.3 Rendering Containers (Slots)

The host provides three rendering areas:

| Slot | Description | Purpose |
|------|-------------|---------|
| `reading-area` | Transparent overlay on top of book pages | Render interactive entry points (e.g., star buttons) |
| `drawer` | Side drawer content area | Render interactive content (e.g., quizzes, flashcards) |
| `modal` | Centered modal content area | Render full-screen interactive content (e.g., games, videos) |

`reading-area` is available immediately after extension activation. `drawer` becomes available after executing the `openDrawer` command. `modal` becomes available after executing the `openModal` command.

---

## 3. Quick Start

### 3.1 Minimal Example

Create a `{globalName}-main.js` (e.g., `AcmeQuizExtension-main.js`):

```javascript
(function() {
  window.AcmeQuizExtension = {
    activate: function(context) {
      // 1. Get rendering container
      var root = context.slots.get('reading-area');

      // 2. Inject styles
      var style = document.createElement('style');
      style.textContent = '.hello-btn { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); padding:12px 24px; font-size:16px; cursor:pointer; pointer-events:auto; }';
      root.appendChild(style);

      // 3. Render UI
      var button = document.createElement('button');
      button.className = 'hello-btn';
      button.textContent = 'Hello Extension!';
      button.onclick = function() {
        alert('Book ID: ' + context.data.getBookId() + ', Page: ' + context.data.getCurrentPage());
      };
      root.appendChild(button);

      // 4. Return cleanup function
      return function() {
        style.remove();
        button.remove();
      };
    }
  };
})();
```

### 3.2 Running in the Reader

**Step 1: Start a local HTTP server**

```bash
# Option 1: Using npx
npx serve . --cors -l 8080

# Option 2: Using Python
python3 -m http.server 8080
```

Verify that `http://localhost:8080/{globalName}-main.js` is accessible (e.g., `http://localhost:8080/AcmeQuizExtension-main.js`).

**Step 2: Register the extension URL**

Open the test environment reader page and log in with the provided account:

```
https://webqa-new.getepic.dev/app/read/{bookId}
```

> **Test Account:** We will provide each team with a dedicated development account that has book subscription access. Please keep it secure and do not share with unauthorized persons.

In the browser Developer Tools Console, execute:

```javascript
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/AcmeQuizExtension-main.js')
```

> This setting persists and only needs to be set once. To clear: `localStorage.removeItem('epic_debug_plugin')`
> **Note:** The filename must follow the `{globalName}-main.js` format. The host automatically extracts the globalName from the URL.

**Step 3: Refresh the page**

Refresh the reader page, open a book, and your extension will load and run.

---

## 4. Context API Reference

The `context` object in `activate(context)` provides the following interfaces:

### 4.1 context.version — API Version

```javascript
console.log(context.version);  // "1.0.0"
```

Current API version is `1.0.0`. The version number will be updated when the API changes. Extensions can use this for compatibility checks.

### 4.2 context.analytics — Event Tracking

```javascript
// Event name only
context.analytics.log('event_name');

// Event name + custom parameters
context.analytics.log('event_name', { key1: 'value1', key2: 'value2' });
```

Data is reported through the host's unified data pipeline. Extensions do not need to integrate their own tracking service. Specific event names and parameter specifications will be agreed upon separately.

### 4.3 context.slots — Rendering Containers

```javascript
// Get the book page overlay container (returns ShadowRoot)
var readingArea = context.slots.get('reading-area');

// Get the drawer content container (requires openDrawer command first)
var drawer = context.slots.get('drawer');

// Get the modal content container (requires openModal command first)
var modal = context.slots.get('modal');
```

**Style Injection:**

Due to ShadowDOM isolation, external CSS files and styles in `document.head` will not take effect. Styles must be injected directly into the ShadowRoot via `<style>` elements:

```javascript
var style = document.createElement('style');
style.textContent = '.my-class { color: red; }';
root.appendChild(style);
```

> If using Vue/React or similar frameworks, the framework injects CSS into `document.head` by default. You'll need to handle injecting styles into the ShadowRoot manually.

### 4.4 context.data — Data Access

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getBookId()` | `number \| undefined` | Current book ID |
| `getBookData()` | `object` | Full book object (see field details below) |
| `getBookCoverUrl()` | `string` | Current book cover image CDN URL (empty string if no book; see note below) |
| `getCurrentPage()` | `number` | Current page number (starts from 0) |
| `getLabsData()` | `string \| null` | Interactive data bound to the book (raw format, parsed by the extension) |
| `getFlipBookRect()` | `object \| null` | Exact position and dimensions of the book page on screen |
| `getPageAudioUrl(pageIndex)` | `string` | Audio CDN URL for the specified page (empty string if no audio) |
| `getWordTimingData(pageIndex)` | `Promise<object \| null>` | Word timing data for the specified page (async) |
| `getRtmVolume()` | `number` | Current volume level (0–100) |
| `getRtmSpeed()` | `number` | Current playback speed (0.5–2.0) |
| `getRtmHighlight()` | `boolean` | Whether word highlighting is currently enabled |

**getBookData() common fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Book ID |
| `title` | `string` | Book title |
| `type` | `number` | Book type (1=Standard, 2=Audiobook, 3=Article, 4=Video) |
| `author` | `string` | Author |
| `numPages` | `number` | Total pages |
| `labData` | `string` | Interactive data (same as `getLabsData()` return value) |
| `aspectRatio` | `number` | Page aspect ratio |
| `coverColorR/G/B` | `number` | Cover color RGB values |
| `language` | `number` | Language code |
| `bookDescription` | `string` | Book description |

> These are commonly used fields. The actual object contains more properties. Use `console.log(context.data.getBookData())` to inspect the full structure.

**getBookCoverUrl() note:**

Returns the CDN URL of the current book's cover image (absolute, unsigned), matching the cover shown on the host bookshelf and book cover page. Can be used directly in `<img src>` or for cover preloading. Returns an empty string `''` when no book is active.

```javascript
var coverUrl = context.data.getBookCoverUrl();
// e.g. https://cdn-gcp-media.getepic.com/drm/3/1234563/cover.jpg
```

> The CDN domain differs in development (e.g. `content.getepic.dev`); do not hardcode the domain in the extension — always obtain it via this method.

**getFlipBookRect() return value:**

```javascript
{
  x: 15.5,      // Book page top-left X coordinate (relative to viewport)
  y: 82,        // Book page top-left Y coordinate (relative to viewport)
  width: 1138,  // Book page width (pixels)
  height: 567   // Book page height (pixels)
}
```

> Used for precisely positioning interactive elements on the book page.

**getLabsData() note:**

Returns the raw interactive data bound to the book. The data format is defined by the third-party team in coordination with our backend. The host only passes through the data without parsing or processing. Extensions parse the data internally.

> To query or upload interactive data (labData), use the Open API. See [Open API - Book Data Interface](./open-api-book.md).

**getPageAudioUrl(pageIndex) note:**

Returns the Read to Me audio CDN URL for the specified page. Use the page index from `getCurrentPage()`. Only available for books with Read to Me enabled; returns an empty string otherwise.

```javascript
var audioUrl = context.data.getPageAudioUrl(context.data.getCurrentPage());
if (audioUrl) {
  // Use the audio URL for playback
}
```

**getWordTimingData(pageIndex) note:**

Asynchronously returns word timing data for the specified page. Use the page index from `getCurrentPage()`. Returns a Promise that resolves to the word data object, or `null` if unavailable.

```javascript
var wordData = await context.data.getWordTimingData(context.data.getCurrentPage());
// wordData.word_data = [{ text, time, duration, bbox, coords, ... }, ...]
```

Word data fields:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Word text |
| `time` | `string` | Start time in audio (seconds) |
| `duration` | `string` | Duration of pronunciation (seconds) |
| `bbox` | `object` | Bounding box (percentage coordinates): `{ x1, y1, x2, y2, width, height }` |
| `coords` | `number[]` | Pixel coordinates: `[x1, y1, x2, y2]` |

> Use case: Extensions implementing read-aloud highlighting, follow-along reading, or similar features.

**getRtmVolume() / getRtmSpeed() / getRtmHighlight() notes:**

These three methods are used by extensions that implement Read to Me functionality, to read the user's current toolbar settings as initial values. When settings change, the extension is notified via events (see `rtmVolumeChange`, `rtmSpeedChange`, `rtmHighlightChange`).

```javascript
// Read initial values
var volume    = context.data.getRtmVolume();      // e.g. 80
var speed     = context.data.getRtmSpeed();       // e.g. 1.0
var highlight = context.data.getRtmHighlight();   // e.g. true

audio.volume = volume / 100;
audio.playbackRate = speed;
```

> These three methods are only needed when the extension implements Read to Me functionality.

### 4.5 context.commands — Execute Commands

```javascript
// Open the side drawer
context.commands.execute('openDrawer', payload);

// Close the side drawer
context.commands.execute('closeDrawer');

// Open a centered modal
context.commands.execute('openModal', { width: 900, height: 600 });

// Close the modal
context.commands.execute('closeModal');

// Go to previous page
context.commands.execute('previousPage');

// Go to next page
context.commands.execute('nextPage');

// Go to a specific page
context.commands.execute('goToPage', 4);

// Look up a word definition
context.commands.execute('lookup_word', 'apple');
```

**openDrawer behavior:**

When called, the host will:
1. Calculate drawer dimensions (matching book page height, 9:16 aspect ratio)
2. Scale down the book page to make room for the drawer
3. Display a blue border indicator
4. Create the `drawer` slot container
5. Emit a `drawerStateChange` event (`mounted: true`)

The extension renders drawer content in the `drawerStateChange` event callback.

**openModal behavior:**

When called, the host will:
1. Display a backdrop overlay
2. Create a centered modal container with the specified `width` and `height` (defaults: 800×600)
3. Create the `modal` slot container
4. Emit a `modalStateChange` event (`mounted: true`)

The host provides the close button (top-right ✕), backdrop click-to-close, and ESC key handling. The modal closes immediately without animation. The extension only needs to render content into the `modal` slot.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `800` | Modal width in pixels |
| `height` | `number` | `600` | Modal height in pixels |

**goToPage behavior:**

Navigates the reader to a specific page.

```javascript
context.commands.execute('goToPage', 4);
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| payload | `number` | Yes | Target page index (0-based, even number) |

> Boundary handling: the value is automatically aligned to an even number (rounded down) and clamped to the valid range [0, max page index]. Non-numeric values are silently ignored.

**lookup_word behavior:**

When called, the host displays a word definition dialog showing the meaning of the specified word.

```javascript
context.commands.execute('lookup_word', 'apple');
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| payload | `string` | Yes | The word to look up |

> Use case: when extension content contains vocabulary words, this allows users to tap a word to see its definition. If an empty string or no argument is passed, the command does nothing.

### 4.6 context.events — Event Listening

```javascript
// Subscribe to an event, returns an unsubscribe function
var unsubscribe = context.events.on('pageChange', function(payload) {
  console.log('Turned to page', payload.pageIndex);
  console.log('Source:', payload.source);    // 'arrow' | 'slider' | 'rtm' | 'programmatic'
  console.log('Direction:', payload.direction); // 1 (forward) | -1 (backward) | 0 (same page)
});

// Unsubscribe
unsubscribe();
```

**Available events:**

| Event Name | Payload | Trigger | Recommended Action |
|------------|---------|---------|-------------------|
| `pageChange` | `{ pageIndex: number, source: PageChangeSource, direction: 1 \| -1 \| 0 }` | Page turn completed | Update interactive content |
| `pageTurnStart` | none | Page turn animation started | Immediately clear current page UI |
| `drawerStateChange` | `{ mounted: boolean }` | Drawer opened/closed | Render drawer content when `mounted: true` |
| `modalStateChange` | `{ mounted: boolean }` | Modal opened/closed | Render modal content when `mounted: true` |
| `rtmVolumeChange` | `number` | User adjusts the volume slider | Update `audio.volume` |
| `rtmSpeedChange` | `number` | User changes the playback speed | Update `audio.playbackRate` |
| `rtmHighlightChange` | `boolean` | User toggles the word highlight switch | Enable/disable word highlighting |
| `wordDefinitionClose` | none | Word definition overlay closed | Resume audio playback etc. |

**`pageChange` payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `pageIndex` | `number` | Page index after the turn |
| `source` | `'arrow' \| 'slider' \| 'rtm' \| 'programmatic'` | What triggered the page turn: arrow button, progress bar scrub, RTM auto-turn, or programmatic call |
| `direction` | `1 \| -1 \| 0` | Turn direction: `1` forward, `-1` backward, `0` same-page jump |

> The `source` field lets you apply different strategies per navigation type. For example, skip heavy animations during rapid slider scrubbing and only play the full transition on the final settled page.

### 4.7 context.delegations — Taking Over Host Controls

The delegation mechanism allows an extension to claim ownership of a host UI control. Once taken over, clicks on that control are routed to the extension; the host's native behavior is bypassed.

Currently supported controls:

| ID | Description |
|----|-------------|
| `'rtm-playback'` | The Read to Me play/pause button in the toolbar |

**takeOver(id, config) — claim a control**

```javascript
var state = { playing: false };

var registration = context.delegations.takeOver('rtm-playback', {
  state: state,
  onToggle: function() {
    // Called when the user clicks the play/pause button
    if (state.playing) {
      audio.pause();
      registration.setState({ playing: false });
    } else {
      audio.play();
      registration.setState({ playing: true });
    }
  }
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Control ID. Currently only `'rtm-playback'` is supported |
| `config.state` | `object` | State object. The host reads `state.playing` to decide whether to show the play or pause icon |
| `config.onToggle` | `function` | Called when the button is clicked |

Returns a `DelegationRegistration`:

| Method | Description |
|--------|-------------|
| `setState(partial)` | Updates the state and triggers the host button to re-render. **Must use this method** — directly assigning `state.playing = true` will not update the button icon |
| `release()` | Releases the delegation; the host reverts to its native RTM behavior |

> The delegation is automatically cleared when the extension deactivates, but it is recommended to call `release()` explicitly in your cleanup function.

**Complete RTM extension implementation:**

```javascript
activate: function(context) {
  var audio = new Audio();

  // 1. Read initial toolbar settings
  audio.volume = context.data.getRtmVolume() / 100;
  audio.playbackRate = context.data.getRtmSpeed();
  var highlightEnabled = context.data.getRtmHighlight();

  // 2. Take over the play button
  var state = { playing: false };
  var reg = context.delegations.takeOver('rtm-playback', {
    state: state,
    onToggle: function() {
      if (state.playing) {
        audio.pause();
        reg.setState({ playing: false });
      } else {
        loadAndPlay(context.data.getCurrentPage());
      }
    }
  });

  async function loadAndPlay(pageIndex) {
    audio.src = context.data.getPageAudioUrl(pageIndex);
    var timingData = await context.data.getWordTimingData(pageIndex);
    // Use timingData to initialize word highlighting...
    audio.play();
    reg.setState({ playing: true });
  }

  audio.onended = function() {
    reg.setState({ playing: false });
  };

  // 3. Listen for toolbar setting changes
  var unsubVolume = context.events.on('rtmVolumeChange', function(v) {
    audio.volume = v / 100;
  });
  var unsubSpeed = context.events.on('rtmSpeedChange', function(v) {
    audio.playbackRate = v;
  });
  var unsubHighlight = context.events.on('rtmHighlightChange', function(v) {
    highlightEnabled = v;
    // Update highlight display...
  });

  // 4. Stop playback on page turn
  var unsubPage = context.events.on('pageChange', function() {
    audio.pause();
    audio.src = '';
    reg.setState({ playing: false });
  });

  // 5. Cleanup
  return function() {
    audio.pause();
    reg.release();
    unsubVolume();
    unsubSpeed();
    unsubHighlight();
    unsubPage();
  };
}
```

### 4.8 context.globalState — State Persistence

Persist extension state so it can be restored when the user reopens the same book (e.g., star-interaction collection progress, mini-game state, last viewed position).

| Method | Returns | Description |
|------|--------|------|
| `save(data)` | `Promise<void>` | Save the state object |
| `load()` | `Promise<object \| null>` | Read the previously saved state; returns `null` when nothing is stored |

```javascript
// Read previous state on activate; restore if present
var saved = await context.globalState.load()
if (saved) {
  restoreState(saved)  // resume from previous state
}

// Save at meaningful points (e.g., star collected, level cleared, setting toggled)
await context.globalState.save({
  collectedStars: [1, 3, 5],
  level: 2,
  muted: true
})
```

> - The `data` format is partner-defined (any JSON-serializable object); the host stores it opaquely and **does not parse the content**.
> - Authentication is handled internally by the host; the extension does not need to manage user identity.
> - Requires a backend-configured `extensionConfig.appKey`: state is actually persisted only when the book has an `appKey` configured. Without it (e.g., local debugging, unlaunched books), `save` silently no-ops and `load` returns `null` — no error is thrown.
> - State is scoped per book (`bookId`); it is restored only when the same book is reopened.

---

## 5. TypeScript Type Support

We provide an official TypeScript type definitions package containing the full Extension API types (`ExtensionContext`, `Extension`, `BookData`).

**Installation:**

Add a `.npmrc` file to your project root:

```
@getepic-v2:registry=https://npm.pkg.github.com
```

Then install:

```bash
npm install -D @getepic-v2/reader-extension-types
```

**Usage:**

```typescript
import type {
  ExtensionContext,
  Extension,
  DelegationRegistration,
  RtmPlaybackState,
} from '@getepic-v2/reader-extension-types'

const extension: Extension = {
  activate(context: ExtensionContext) {
    const root = context.slots.get('reading-area')
    const page = context.data.getCurrentPage()

    // RTM delegation example (with full type inference)
    const state: RtmPlaybackState = { playing: false }
    const reg: DelegationRegistration<RtmPlaybackState> =
      context.delegations.takeOver('rtm-playback', {
        state,
        onToggle: () => { /* ... */ },
      })

    return () => { reg.release() }
  }
}
```

> The types package only contains Extension API interface definitions. Interactive data (labData) types should be defined by each third-party team according to their own data format.

---

## 6. Development Environment Setup

### 6.1 Project Structure (Recommended)

```
my-extension/
├── src/
│   └── extension/
│       ├── index.ts           ← Extension entry (implements activate)
│       ├── types.ts           ← Context API TypeScript definitions (optional)
│       └── components/        ← UI components
├── scripts/
│   └── dev-server.mjs         ← Local development server
├── manifest.json              ← Extension metadata
├── vite.config.ts             ← Build config (or webpack / rollup)
└── package.json
```

### 6.2 Build Requirements

Output a **single JS file** in IIFE format that registers the extension object on `window`:

```javascript
(function() {
  // Your code...
  window.AcmeQuizExtension = {
    activate: function(context) {
      // ...
      return function cleanup() { /* ... */ };
    }
  };
})();
```

**Key requirements:**

| Item | Requirement |
|------|-------------|
| Format | IIFE (Immediately Invoked Function Expression) |
| Output | Single JS file, named `{globalName}-main.js` |
| Global Variable | Registered on `window`, must be globally unique |
| CSS | Bundled into JS (no separate CSS files) |
| Dependencies | All dependencies bundled in, no external imports |

### 6.3 Vite Build Configuration Example

```typescript
// vite.config.ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'  // If using Vue

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'))
const globalName: string = manifest.globalName

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__EXTENSION_GLOBAL_NAME__': JSON.stringify(globalName),
  },
  build: {
    lib: {
      entry: 'src/extension/index.ts',
      name: globalName,               // Read from manifest.json
      formats: ['iife'],
      fileName: () => `${globalName}-main.js`,
    },
    cssCodeSplit: false,               // Bundle CSS into JS
    outDir: 'dist-extension',
    emptyOutDir: true,
  },
})
```

> `globalName` and output filename are both read from `manifest.json` automatically.
> `__EXTENSION_GLOBAL_NAME__` is replaced at build time with the actual value, used for runtime global variable registration (see extension entry example below).
> The `process.env.NODE_ENV` define is required, otherwise Vue/React framework code will throw errors in the browser.

### 6.4 Local Development Server

```javascript
// scripts/dev-server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const port = 8080;
const distDir = 'dist-extension';

const server = http.createServer(async (req, res) => {
  const pathname = req.url?.split('?')[0];
  // Serve any {globalName}-main.js from dist-extension/
  if (pathname?.endsWith('-main.js')) {
    try {
      const bundle = await readFile(path.join(distDir, pathname.slice(1)), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(bundle);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(pathname.slice(1) + ' not found in ' + distDir + '. Run build first.');
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Extension dev server running on http://localhost:' + port);
});

server.listen(port, '0.0.0.0', () => {
  console.log('Dev server: http://localhost:' + port);
});
```

### 6.5 package.json scripts (Recommended)

```json
{
  "scripts": {
    "dev:extension": "vite build --mode extension --watch",
    "dev:serve": "node scripts/dev-server.mjs",
    "build:extension": "vite build --mode extension"
  }
}
```

### 6.6 Development Workflow

```
┌─ Terminal 1 ──────────────────────────────┐
│ npm run dev:extension                     │
│ → Vite watch mode, auto-rebuild on change │
└───────────────────────────────────────────┘

┌─ Terminal 2 ──────────────────────────────┐
│ npm run dev:serve                                    │
│ → HTTP server at localhost:8080/{globalName}-main.js  │
└──────────────────────────────────────────────────────┘

┌─ Browser ────────────────────────────────────────────────────┐
│ 1. Open the test environment reader                          │
│ 2. Run in console (once only):                               │
│    localStorage.setItem(                                     │
│      'epic_debug_plugin',                                    │
│      'http://localhost:8080/{globalName}-main.js'            │
│    )                                                         │
│ 3. Refresh → extension loads                                 │
│ 4. Edit code → auto-build → refresh                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Full Example

For a complete star interaction extension example, see: [Epic_Reader_Extension_星星互动示例.md](./Epic_Reader_Extension_星星互动示例.md)

The example demonstrates:
- Rendering interactive stars on book pages by coordinates
- Listening to page-turn events and updating stars
- Opening a side drawer on star click and rendering content (quizzes, flashcards, puzzles)
- Opening a modal for game-type interactions
- Complete cleanup function implementation

---

## 8. Important Notes

### 8.1 Style Isolation

| Rule | Description |
|------|-------------|
| CSS Isolation | ShadowDOM provides automatic isolation; no need for BEM prefixes or CSS Modules |
| Style Injection | Must inject via `<style>` elements into ShadowRoot; `<link>` tags and external CSS files won't work |
| Framework CSS | Vue/React inject to `document.head` by default; manual handling required (see below) |
| JS Not Isolated | ShadowDOM only isolates CSS; do not manipulate host DOM |

**Vue 3 Style Solution:**

Write CSS as string constants and inject into ShadowRoot via a utility function:

```javascript
function injectStyles(shadowRoot, css, id) {
  if (shadowRoot.querySelector('#' + id)) return;
  var style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  shadowRoot.prepend(style);
}
```

### 8.2 Cleanup Function

`activate` **must** return a cleanup function. It will be called when the extension is unloaded (e.g., switching books, page destruction):

```javascript
activate: function(context) {
  var unsub1 = context.events.on('pageChange', handler);
  var unsub2 = context.events.on('drawerStateChange', handler);
  var unsub3 = context.events.on('modalStateChange', handler);
  var container = document.createElement('div');
  root.appendChild(container);

  // Must return cleanup function
  return function() {
    unsub1();           // Unsubscribe events
    unsub2();
    unsub3();
    container.remove(); // Remove DOM
    // If using Vue: app.unmount()
    // If using React: root.unmount()
  };
}
```

### 8.3 Global Variable Naming

The variable name registered on `window` must be **globally unique**. Recommended format: `[CompanyName][ProductName]Extension`

```javascript
window.AcmeStarExtension = { activate: ... };    // acme-star-extension
window.BytedanceGameExtension = { activate: ... }; // bytedance-game-extension
```

This name must match the `globalName` field in `manifest.json`.

### 8.4 Book Page Positioning

When interactive elements need to be precisely positioned on book pages, use `context.data.getFlipBookRect()`:

```javascript
var rect = context.data.getFlipBookRect();
// rect = { x: 15.5, y: 82, width: 1138, height: 567 }

// Note: rect coordinates are relative to the viewport
// If the slot container is not at the viewport origin, calculate the offset
var parent = document.getElementById('read-container');
var parentRect = parent.getBoundingClientRect();
var offsetTop = rect.y - parentRect.y;
var offsetLeft = rect.x - parentRect.x;
```

### 8.5 Performance Recommendations

**JS Files:**

| Requirement | Description |
|-------------|-------------|
| Entry Size | Recommended < 200KB (gzipped) |
| Lazy Loading | Use dynamic `import()` to split heavy features (games, complex animations), load on user interaction |

**Image Assets:**

| Recommendation | Description |
|----------------|-------------|
| File Size | Recommended no more than 1MB per image |
| Resolution | Recommended no more than 2K (2560px); use 2x the actual display size |

**Runtime Performance:**

| Requirement | Description |
|-------------|-------------|
| No Blocking on Page Turn | Avoid synchronous heavy operations in `pageChange` callbacks |
| Clear Before Render | Listen to `pageTurnStart` to clear current page UI immediately, render new content on `pageChange` |
| Batch DOM Updates | Minimize frequent DOM reflows by batching operations |

### 8.6 Static Assets

All static assets (images, animations, fonts, etc.) are deployed as individual files to CDN, not inlined into JS. This keeps the JS bundle small, allows browser caching, and results in faster loading.

**CDN Directory Structure:**

We assign each team an independent directory on CDN, organized by version:

```
https://cdn.example.com/extensions/
├── {company}/
│   └── v{version}/
│       ├── {globalName}-main.js  ← Entry script
│       ├── assets/           ← Build output assets
│       │   ├── star.png
│       │   └── puzzle.jpg
│       └── images/           ← Other static assets
```

Example:
```
https://cdn.example.com/extensions/acme/v1.0.0/AcmeQuizExtension-main.js
https://cdn.example.com/extensions/acme/v1.0.0/assets/star.png
```

**Use relative paths during development** (e.g., `./images/star.png`). We inject the correct CDN base path via the `--base` flag during our build process. No action needed from third-party developers.

**Important: Do not set `base` in your Vite config.** We handle this during our build step:

```bash
vite build --base=https://cdn.example.com/extensions/acme/v1.0.0/
```

This ensures all static asset references in the build output point to the correct CDN location.

**Vite Build Configuration (third-party):**

```javascript
build: {
  assetsInlineLimit: 0,  // Output all assets as individual files, no base64 inlining
}
```

> **Note:** Do not set `base` in your `vite.config.ts` — leave it as default. We will inject the correct CDN path at build time.

---

## 9. Full Takeover Mode (Custom Page Content)

### 9.1 Overview

By default, extensions render UI as an overlay on top of the original book page images. If you want to **fully replace the book page content** (rendering your own illustrations, text, and interactive elements), you can enable "Full Takeover Mode".

When enabled, the reader will not render any original book page images, giving your extension a blank canvas to render on via the `reading-area` slot.

### 9.2 How to Enable

Full Takeover Mode is configured at the **plugin level** through the backend. Contact your Epic representative to enable it:

```json
{
  "extensionConfig": {
    "skipPageRender": true
  }
}
```

Once enabled, it applies to **all books** associated with the plugin. Users who are in the extension's rollout group will see blank pages (extension takes over rendering). Users not in the rollout group will still see the original book pages normally.

> **To enable this mode, inform your Epic contact during onboarding or at any point during development.**

### 9.3 Local Debugging

You can enable Full Takeover Mode locally without backend configuration:

```javascript
// Enable blank pages (use together with epic_debug_plugin)
localStorage.setItem('epic_debug_skip_page_render', '1')

// Disable
localStorage.removeItem('epic_debug_skip_page_render')
```

Recommended setup for local development:

```javascript
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/YourExtension-main.js')
localStorage.setItem('epic_debug_skip_page_render', '1')
```

Refresh the page to take effect.

### 9.4 Preserved System Pages

When Full Takeover Mode is enabled, the following pages are **not affected** and are still rendered by the reader:

| Page | Description |
|------|-------------|
| Book Intro Page | The reader's built-in intro page (book title, author, etc.) |
| Completion Page | The post-reading completion animation |
| Recommendations Page | Post-reading book recommendations |

All book content pages (including cover and last page) are taken over by the extension.

---

## 10. manifest.json Specification

Each extension must provide a `manifest.json` metadata file.

**Naming Convention: `company-product-extension`**

```json
{
  "id": "acme-quiz-extension",
  "name": "Acme Quiz Extension",
  "version": "1.0.0",
  "globalName": "AcmeQuizExtension",
  "entry": "AcmeQuizExtension-main.js"
}
```

More examples:
```
thinkacademy-star-extension      → ThinkacademyStarExtension
bytedance-game-extension         → BytedanceGameExtension
tencent-flashcard-extension      → TencentFlashcardExtension
```

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | string | Yes | Unique extension identifier (company-product-extension) | `acme-quiz-extension` |
| `name` | string | Yes | Extension display name | `Acme Quiz Extension` |
| `version` | string | Yes | Semantic version number | `1.0.0` |
| `globalName` | string | Yes | Global variable name on `window` (PascalCase, must match code) | `AcmeQuizExtension` |
| `entry` | string | Yes | Entry JS filename (`{globalName}-main.js`) | `AcmeQuizExtension-main.js` |

---

## 11. Delivery & Deployment

### 11.1 Deliverables Checklist

| Item | Required | Description |
|------|----------|-------------|
| Project Source Code | **Yes** | Complete project code; we handle compilation and build |
| `manifest.json` | **Yes** | Extension metadata |
| Static Assets | As needed | Large images, videos, etc. that need separate CDN deployment |

### 11.2 Deployment Process

```
Third-party submits source code
    │
    ▼
We review + compile + build
    │
    ▼
Build artifacts ({globalName}-main.js + assets) deployed to CDN
    │
    ▼
Backend configures the extension URL for the associated book
    │
    ▼
User opens book → Reader automatically loads extension
```

Third-party developers **do not need** to understand our deployment process. After source code submission, we handle compilation, deployment, and release.

### 11.3 Version Updates

Submit new version source code + update the `version` field in `manifest.json`. We recompile and redeploy. The process is transparent to users.

---

## 12. Source Code Collaboration

### 12.1 Repository Structure

We create an independent repository on GitHub for each team:

```
getepic-v2/
├── extension-acme-quiz              ← Acme team's quiz extension
├── extension-bytedance-game         ← Bytedance team's game extension
├── extension-tencent-flashcard      ← Tencent team's flashcard extension
└── ...
```

Repository naming convention: `extension-{company}-{product}`

### 12.2 Initial Repository Contents

The repository starts with only basic files, with no technology stack restrictions:

```
extension-acme-quiz/
├── README.md          ← Link to developer documentation
├── manifest.json      ← Pre-filled with id and globalName
└── .gitignore
```

Third-party teams fork the repo and initialize their own project (Vue / React / vanilla JS — any choice).

### 12.3 Collaboration Model (Fork + PR)

```
1. We create the repository with pre-filled manifest.json
       │
       ▼
2. Third-party forks to their own GitHub
       │
       ▼
3. Third-party develops in their fork (technology stack of their choice)
       │
       ▼
4. Development complete → Submit Pull Request to our repository
       │
       ▼
5. We Code Review → Merge → Compile & Build → Deploy to CDN
```

- Third-party does not need write access to our repository
- All changes go through PR review before merging
- Version updates follow the same PR process

### 12.4 Branch Convention (Recommended)

| Branch | Purpose |
|--------|---------|
| `main` | Stable version; we compile and deploy from this branch |
| `develop` | Third-party daily development branch |
| `feature/*` | Feature branches |

When submitting a PR, the target branch should be `main`.
