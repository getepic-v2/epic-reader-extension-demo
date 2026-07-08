/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** appKey for globalState isolation (doc §4.8). Test value: 'think_studio'. */
  readonly VITE_EPIC_APP_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
