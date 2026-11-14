import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./spec/javascript/setup.ts'],
    include: ['spec/javascript/**/*.spec.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: { 100: true }
    }
  }
})
