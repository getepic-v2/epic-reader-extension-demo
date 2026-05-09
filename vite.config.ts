import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

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
        },
        build: {
          lib: {
            entry: fileURLToPath(new URL('./src/extension/index.ts', import.meta.url)),
            name: 'EpicLabsStarExtension',
            formats: ['iife'] as const,
            fileName: () => 'main.js',
          },
          cssCodeSplit: false,
          outDir: 'dist-extension',
          emptyOutDir: true,
        },
      }
    : {}),
}))
