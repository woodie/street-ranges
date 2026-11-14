import { defineConfig } from 'vite'

// The npm package: just the address-to-precinct lookup, as a module, without the page or its map.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: { entry: 'src/lookup.ts', formats: ['es'], fileName: () => 'street-ranges.js' }
  }
})
