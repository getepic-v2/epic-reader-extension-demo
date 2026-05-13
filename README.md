# Epic Reader Extension Demo

A Vue 3 example project demonstrating how to develop interactive extensions for the Epic Reader using the Extension API.

## Features

- Render interactive stars on book pages by coordinates (Lottie animations)
- Click stars to open a host-provided side drawer with interactive content (quiz, flashcard, puzzle)
- Click game stars to open a host-provided modal with game content
- Auto-update stars and close drawer/modal on page turn
- ShadowDOM style isolation

## Project Structure

```
src/extension/
├── index.ts                 ← Extension entry (activate function)
├── types.ts                 ← Context API type definitions
├── utils/
│   ├── styles.ts            ← ShadowDOM style injection utility
│   └── parse-labs-xml.ts    ← Interactive data XML parser
└── components/
    ├── StarOverlay.vue      ← Star overlay layer
    ├── DrawerPanel.vue      ← Drawer content router
    ├── MultipleChoice.vue   ← Quiz interaction
    ├── Flashcard.vue        ← Flashcard flip
    ├── Puzzle.vue           ← Puzzle game
    └── GameContent.vue      ← Game content (rendered inside host modal)
```

## Requirements

- Node.js >= 20.19.0

## Development

```bash
# Install dependencies
npm install

# Terminal 1: Watch mode (auto-rebuild on code changes)
npm run dev:extension

# Terminal 2: Start local dev server
npm run dev:serve
```

Open the test environment reader in your browser and run in the console (once only):

```javascript
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/EpicLabsStarExtension-main.js')
```

Refresh the page to see the extension load and run.

Try opening this book to see the interactive stars in action:  
https://webqa-new.getepic.dev/app/read/49528

To clear debug mode:

```javascript
localStorage.removeItem('epic_debug_plugin')
```

## Build

```bash
# Production build, outputs dist-extension/{globalName}-main.js
npm run build:extension
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:extension` | Vite watch mode, continuously builds extension |
| `npm run dev:serve` | Start local HTTP server (localhost:8080) |
| `npm run build:extension` | Production build, outputs IIFE format JS |

## Documentation

- [Developer Guide (English)](./docs/Epic_Reader_Extension_Developer_Guide.md)
- [开发文档（中文）](./docs/Epic_Reader_Extension_开发文档.md)
- [Star Interaction Example (English)](./docs/Epic_Reader_Extension_Star_Interaction_Example.md)
- [星星互动示例（中文）](./docs/Epic_Reader_Extension_星星互动示例.md)
