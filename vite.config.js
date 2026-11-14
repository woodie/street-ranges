import { defineConfig } from 'vite'

// Like lambada: one fixed-name file beside the hand-edited pages, committed so publishing needs no npm.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'StreetRanges',
      fileName: () => 'main.js'
    }
  }
})
