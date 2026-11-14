import { describe } from 'vitest'

declare global {
  var context: typeof describe
}

globalThis.context = describe
