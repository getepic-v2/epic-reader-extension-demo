# Epic Interactive Book Extension — Third-Party Developer Guide

> Version: 1.0.0
> Updated: 2026-06-23

> **New here?** Please read the [Onboarding Guide](./Onboarding_Guide.md) first to set up your repository, API credentials, and test account.

---

## 1. Overview

### 1.1 What is an Interactive Book?

Epic Interactive Book is an interactive-book extension mechanism provided by the Epic reader. It allows third-party teams to build complete interactive book applications (such as level-based games, puzzles, interactive narratives, etc.).

Unlike a regular Reader Extension, an Interactive Book **has no concept of page-turning**. Content is entirely driven by user actions, and the third party is fully responsible for content rendering and interaction logic.

### 1.2 Design Philosophy

- The **host** (reader) provides a full-screen render container, book data, a progress interface, and an analytics channel.
- The **extension** (third party) is responsible for the full application rendering and interaction logic.
- The two interact through a stable Context API and do not depend on each other's internal implementation.

### 1.3 Tech Stack Requirements

**No framework restriction.** You can use Vue, React, Svelte, vanilla JavaScript, or any stack that compiles to JS.

The final deliverable is a single IIFE-format JS file (`main.js`); heavy dependencies are loaded on demand via dynamic `import()`.

---

## 2. Core Concepts

### 2.1 Extension Lifecycle

```
Host loads the extension JS file (main.js)
    │
    ▼
Host calls extension.activate(context)
    │
    ├── Extension gets the full-screen container via context.slots.get('interactive-stage')
    ├── Extension reads book info and interaction data via context.data (optional)
    ├── Extension builds media URLs via context.config.assetBaseUrl
    ├── Extension reports progress and completion via context.progress
    ├── Extension listens to host events via context.events (e.g. exit notification)
    ├── Extension reports analytics events via context.analytics
    │
    ▼
User plays and interacts
    │
    ▼
Host calls cleanup() (the cleanup function returned by activate)
    │
    └── Extension cleans up DOM, unsubscribes, destroys instances
```

### 2.2 ShadowDOM Isolation

The extension's UI is rendered inside a ShadowDOM container:
- Your CSS **does not affect** the host page.
- The host's CSS **does not affect** your UI.
- You can freely use any class names.

**Note: ShadowDOM only isolates CSS, not JS.** Do not directly manipulate the host DOM.

### 2.3 Render Container

The host provides a single full-screen render container:

| Slot | Description |
|------|------|
| `interactive-stage` | Full-screen container, available immediately after activation; the third party fully takes over rendering. |

```javascript
var container = context.slots.get('interactive-stage')
// container is a ShadowRoot — mount your app directly into it
```

### 2.4 Media Assets

All media assets (images, video, audio, etc.) are deployed on the Epic CDN. The host provides the CDN base path via `context.config.assetBaseUrl`; the third party builds the full URL:

```javascript
var assetBaseUrl = context.config.assetBaseUrl
// e.g. https://cdn.getepic.com/extensions/penguin/v1.0/

function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return assetBaseUrl.replace(/\/$/, '') + path
}

resolveUrl('/pictures/bg.jpg')
// → https://cdn.getepic.com/extensions/penguin/v1.0/pictures/bg.jpg
```

---

## 3. Quick Start

### 3.1 Minimal Example

```javascript
(function() {
  window.MyInteractiveBook = {
    activate: function(context) {
      // 1. Get the render container
      var container = context.slots.get('interactive-stage')

      // 2. Inject styles
      var style = document.createElement('style')
      style.textContent = '.app { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#1e160d; color:#fff; font-size:24px; }'
      container.appendChild(style)

      // 3. Render the UI
      var div = document.createElement('div')
      div.className = 'app'
      div.textContent = 'Hello Interactive Book! Book ID: ' + context.data.getBookId()
      container.appendChild(div)

      // 4. Return the cleanup function
      return function() {
        style.remove()
        div.remove()
      }
    }
  }
})()
```

### 3.2 Local Debugging

**Step 1: Build the extension**

```bash
npm run build   # outputs dist/main.js
npm run serve   # starts a local HTTP server on localhost:8080
```

Confirm `http://localhost:8080/main.js` is reachable.

**Step 2: Register the debug URL**

Open the test-environment reader and run the following in the browser console:

```javascript
localStorage.setItem('epic_debug_interactive_plugin', 'http://localhost:8080/main.js')
```

> This setting persists; you only need to run it once.

**Step 3: Open the interactive book**

Visit the debug entry page:

```
https://webqa-new.getepic.dev/app/interactive-debug
```

The page lists the currently registered debug URL. Click the **"Launch Interactive Book"** button to jump into the reader and load your extension.

> The debug page is only available in the test environment (`webqa-new.getepic.dev`, `docker.getepic.dev`, `localhost`) and requires `epic_debug_interactive_plugin` to be set first.

**Clear the debug setting:**

```javascript
localStorage.removeItem('epic_debug_interactive_plugin')
```

---

## 4. Context API Reference

The `context` object passed to `activate(context)` exposes the following interfaces:

### 4.1 context.version — API Version

```javascript
console.log(context.version)  // "1.0.0"
```

### 4.2 context.config — Configuration

| Property | Type | Description |
|------|------|------|
| `assetBaseUrl` | `string` | CDN base path, used to build full URLs for media assets. |

```javascript
var baseUrl = context.config.assetBaseUrl
// https://cdn.getepic.com/extensions/penguin/v1.0/
```

### 4.3 context.slots — Render Container

```javascript
// Get the full-screen render container (returns a ShadowRoot)
var container = context.slots.get('interactive-stage')
```

**Style injection:**

Because of ShadowDOM isolation, styles must be injected directly into the ShadowRoot via a `<style>` element:

```javascript
var style = document.createElement('style')
style.textContent = '.my-class { color: red; }'
container.appendChild(style)
```

### 4.4 context.data — Data Access

| Method | Returns | Description |
|------|--------|------|
| `getBookId()` | `number` | Current book ID. |
| `getBookData()` | `object` | Book metadata (title, author, etc.). |
| `getLabsData()` | `string \| null` | Level/interaction data for the book (third-party-defined format, passed through by the host). Interactive books that need no external data can ignore this. |

```javascript
var bookId = context.data.getBookId()
var labsData = context.data.getLabsData()
var parsedData = JSON.parse(labsData)  // parsed by the third party
```

### 4.5 context.progress — Progress & Completion

| Method | Description |
|------|------|
| `save(data)` | Save the user's current progress so it can be restored next time the book is opened. |
| `load()` | Read the user's previously saved progress; returns `Promise<object \| null>`. |
| `start(data?)` | **Notify the host that the user has entered the experience.** The host reports the "book opened" event from this. |
| `pageChange(pageIndex, data?)` | **Notify the host that the user entered a new "page"** (level / scene / screen). The host derives per-node dwell time and the reading path from this. |
| `checkpoint(name, data?)` | Report a key milestone, used for progress stats and read-through rate. |
| `complete(data?)` | **Notify the host that the user has finished.** The host reports the "book finished" event from this. |

```javascript
// Call once when the user actually enters the experience
// (assets ready, first screen visible)
context.progress.start()

// Call every time the user enters a new "page" (level / scene / screen)
context.progress.pageChange(0)   // entered the first scene
context.progress.pageChange(1)   // entered the second scene

// Save progress (call at key moments; restored on next open)
await context.progress.save({ chapter: 2, score: 650 })

// Load previous progress (call during activate)
var saved = await context.progress.load()
if (saved) {
  resumeFrom(saved)  // resume from where the user left off
}

// Report key milestones (call on chapter completion, major events, etc.)
context.progress.checkpoint('chapter_1_done', { score: 300 })
context.progress.checkpoint('chapter_2_done', { score: 650 })

// Notify completion
context.progress.complete({ finalScore: 1200 })
```

> The `data` parameter format for all of these is defined by the third party. The host only passes it through and stores it; it does not parse the content. Authentication is handled internally by the host, so the third party does not need to worry about user identity.

#### When to call start() / complete() (important)

These two methods drive the host's content analytics and directly determine the open count and completion rate for your interactive book. **Both are required.**

**`start()`** — call once when the user has **actually entered the experience**, not at the top of `activate()`. The bar is: the first screen is visible and the user can start interacting. The host cannot determine this moment on its own (only your extension knows when its own asset loading and boot sequence have finished), so the extension owns the timing.

```javascript
activate: function(context) {
  var container = context.slots.get('interactive-stage')

  // ❌ Not here — assets aren't loaded, the user sees nothing yet
  // context.progress.start()

  return preloadAssets().then(function() {
    renderFirstScreen(container)
    context.progress.start()   // ✅ First screen visible, user can play
    return cleanup
  })
}
```

**`complete()`** — call when the user finishes the whole experience (clears the last level, reaches an ending, etc.). Do not call it on intermediate chapter completions; that is what `checkpoint()` is for.

**Both are idempotent**: the host de-duplicates internally, so a repeated call will not double-report. Don't rely on that as a shortcut, though — semantically each should be called exactly once.

**The optional `data` parameter** is merged into the reported event as extra dimensions. Only number, string, and boolean values are supported (booleans become `1`/`0`); nested objects and arrays are dropped — `JSON.stringify()` them yourself if you need to report structured data.

```javascript
context.progress.start({ resumed: !!saved })
context.progress.complete({ finalScore: 1200, ending: 'survived' })
```

#### Using pageChange()

Interactive books have no host-side page-turn concept, so node-level data — where the user is, how long they stayed, what path they took — depends entirely on the extension reporting it. **Call it every time the user enters a new "page."** How you segment pages is up to you (levels, scenes, chapter screens all work), as long as:

- `pageIndex` is a number, and the same "page" always uses the same index
- you call it on **entering** a new page (the host computes the previous page's dwell time)
- the first screen counts as a page: call `pageChange(0)` right after `start()`

```javascript
function enterScene(sceneIndex) {
  renderScene(sceneIndex)
  context.progress.pageChange(sceneIndex)
}

// Optional: attach custom dimensions (same constraints as the data
// parameter of start/complete)
context.progress.pageChange(3, { scene_name: 'iceberg' })
```

Notes:

- Repeated calls with the same index are no-ops and will not double-count
- When the user navigates back to an earlier page, **call it as usual** — the host records the full visit path, repeats included
- The dwell time of the final page is flushed automatically by the host on exit; no handling needed in your teardown logic
- Skipping `pageChange` does not affect `start()` / `complete()` reporting, but the book's node-level data (drop-off points, per-level dwell time) will be entirely missing — please integrate it

#### What the host reports from these calls (reference)

All of the reporting below is done automatically by the host; the extension only needs to call `start()` / `pageChange()` / `complete()` at the right moments. It is listed here so you understand what each call means for the data — these feed the book's core metrics: open count, completion rate, and per-node dwell time.

| Moment | What the host reports |
|------|------|
| First `start()` call | The "book opened" event + the content open log (everything after it is correlated into one session through this log) |
| Throughout the session (after successful activation) | A heartbeat snapshot every 10 s: current page (from `pageChange`), idle or not, finished or not. Drives effective dwell time and mid-session drop-off analysis |
| `pageChange()` page transitions | A close event for the page being left: page index + dwell seconds |
| First `complete()` call | The "book finished" event (with total duration and pages flipped) + the finish log. Completion rate is computed from this |
| Exit (close / refresh / navigate away) | Final page dwell flush + the content closed log + a session summary (total duration, pages flipped, full reading path) |

**Idle detection**: 5 consecutive minutes with no click, no key press, and no `pageChange` call marks the interval as idle in the heartbeat, and it is excluded from effective dwell time. You normally don't need to care — real user interaction resets the timer naturally.

This is why timing matters: calling `start()` too early (before the first screen renders) inflates opens and drags down the completion rate; never calling `complete()` pins the book's completion rate at zero; skipping `pageChange()` leaves drop-off analysis with no data.

### 4.6 context.commands — Commands

| Method | Description |
|------|------|
| `close()` | Close the interactive book and exit the reader page. |

```javascript
// Actively close after the user finishes the interactive content
context.commands.close()
```

When called, the host will:
1. Emit the `beforeExit` event (the extension can save progress here).
2. Close the reader page and return to the previous page.

> Use cases: an "Exit" button inside the extension, auto-close after the completion flow, etc. The user can also exit by pressing ESC.

### 4.7 context.events — Event Subscription

```javascript
// Subscribe to an event; returns an unsubscribe function
var unsubscribe = context.events.on('beforeExit', function() {
  // The user is about to leave — save current progress
  context.progress.save(currentState)
})

// Unsubscribe (call in your cleanup function)
unsubscribe()
```

**Available events:**

| Event | When it fires | Suggested action |
|--------|---------|---------|
| `beforeExit` | Before the user exits the interactive book | Call `context.progress.save()` to save current progress. |

### 4.8 context.analytics — Analytics Reporting

```javascript
// Event names start with ib_; the rest of the name and any params are defined by the third party
context.analytics.log('ib_chapter_start')
context.analytics.log('ib_game_over', { score: 850, chapter: 3 })
```

Data is reported through the host's unified data channel; the third party does not need to integrate its own analytics service. Event names start with `ib_`; the rest of the name and the params are defined by the third party.

> Session duration is tracked automatically by the host; the third party does not need to report it.

---

## 5. TypeScript Support

We provide an official TypeScript type-definition package that includes the complete types for the Interactive Book Extension API.

**Install:**

Create an `.npmrc` file in the project root:

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
  InteractiveBookContext,
  InteractiveExtension,
} from '@getepic-v2/reader-extension-types'

const extension: InteractiveExtension = {
  activate(context: InteractiveBookContext) {
    const container = context.slots.get('interactive-stage')
    const bookId = context.data.getBookId()

    // render your app...

    return () => {
      // cleanup
    }
  }
}
```

> The types package contains type definitions for both the Reader Extension API and the Interactive Book Extension API; import as needed.

> `context.progress.start()` and `context.progress.pageChange()` are recent additions. If TypeScript reports that they do not exist on `progress`, upgrade the types package to the latest version (`npm install -D @getepic-v2/reader-extension-types@latest`).

---

## 6. Build Configuration

### 6.1 Build Requirements

| Item | Requirement |
|------|------|
| Format | IIFE (self-executing function) |
| Output | A single JS file named `main.js` |
| Global variable | Registered on `window`, globally unique name |
| CSS | Bundled into the JS (no standalone CSS files) |
| Dependencies | All bundled in or dynamically loaded; no external imports |
| Heavy dependencies | Loaded on demand via dynamic `import()` to keep the main file small |
| Asset paths | Use relative paths; the `--base` CDN path is injected by us at build time |

### 6.2 Vite Build Config Example

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'  // if using Vue

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/extension/index.ts',
      name: 'MyInteractiveBook',       // global variable name on window
      formats: ['iife'],
      fileName: () => 'main.js',
    },
    cssCodeSplit: false,               // CSS bundled into JS
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,             // emit all assets as separate files; no base64 inlining
  },
})
```

### 6.3 Lazy-Loading Heavy Dependencies

```javascript
// Do NOT statically import heavy libraries
// import * as THREE from 'three'  ← would be bundled into main.js

// Use dynamic import instead — load when needed
async function loadGlobe() {
  const { GlobeGame } = await import('./globe-game.js')  // separate chunk
  return new GlobeGame()
}
```

---

## 7. Important Notes

### 7.1 Asset Paths

String-form asset paths in code **must not be relative**. The extension JS is loaded dynamically by the host page, so relative paths resolve against the host page and point to the wrong location:

```javascript
// ❌ Wrong — relative paths resolve against the host page
img.src = './pictures/bg.jpg'
// → https://webqa-new.getepic.dev/app/read/pictures/bg.jpg  (wrong)

// ✅ Correct — build an absolute URL with assetBaseUrl
img.src = context.config.assetBaseUrl.replace(/\/$/, '') + '/pictures/bg.jpg'
// → https://cdn.getepic.com/extensions/penguin/v1.0/pictures/bg.jpg  (correct)
```

> Assets referenced via static `import` (e.g. `import img from './pictures/bg.jpg'`) are not affected; Vite handles their paths at build time.

### 7.2 Style Isolation

| Rule | Description |
|------|------|
| CSS isolation | ShadowDOM isolates automatically; no BEM prefix or CSS Modules needed. |
| Style injection | Must be injected into the ShadowRoot via a `<style>` element. |
| JS not isolated | ShadowDOM only isolates CSS; do not manipulate the host DOM. |

### 7.3 Cleanup Function

`activate` **must** return a cleanup function:

```javascript
activate: function(context) {
  var container = context.slots.get('interactive-stage')
  var app = createApp(App)
  app.mount(container)

  return function() {
    app.unmount()  // must clean up, otherwise switching books leaks memory
  }
}
```

### 7.4 Global Variable Naming

The variable name registered on `window` must be **globally unique**. Recommended format: `[Company][Product]Book`

```javascript
window.PenguinInteractiveBook = { activate: ... }
window.AcmeAdventureBook = { activate: ... }
```

This name must match the `globalName` field configured in our backend.

### 7.5 Do Not Set the `base` Config

```javascript
// ❌ Do not set base in vite.config.ts
// base: 'https://cdn.example.com/...'

// ✅ Leave it default; we inject it uniformly at build time
// vite build --base=https://cdn.getepic.com/extensions/penguin/v1.0/
```

---

## 8. Delivery & Launch

### 8.1 Deliverables

| File | Required | Description |
|------|------|------|
| Source code | **Yes** | Complete project source; we handle compilation and build. |
| Media assets | **Yes** | Images, video, audio, and other static assets; we deploy them to the CDN. |
| Level data (labData) | Optional | If you have dynamic content data, provide it as JSON; we write it into the book database. |

### 8.2 Launch Flow

```
Third party submits source code + media assets (+ interaction data, if any)
    │
    ▼
We review + compile/build + deploy to CDN
    │
    ▼
Backend configures the book's extensionUrl, assetBaseUrl, globalName
    │
    ▼
User opens the interactive book page → reader auto-loads the extension and renders the interactive content
```
