import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const manifest = JSON.parse(
  readFileSync(new URL('./manifest.json', import.meta.url), 'utf-8'),
)
const globalName: string = manifest.globalName

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ...(mode === 'extension'
    ? {
        define: {
          'process.env.NODE_ENV': JSON.stringify('production'),
          '__EXTENSION_GLOBAL_NAME__': JSON.stringify(globalName),
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
      }
    : {}),
}))
