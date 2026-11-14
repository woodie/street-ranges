import { defineConfig } from 'vitest/config'

// Real civic addresses against the published ranges; not part of `npm test`, since some miss until the data improves.
export default defineConfig({ test: { include: ['spec/civic/**/*.spec.ts'] } })
