// @vitest-environment jsdom
// Civic buildings in every county, against the published ranges: run with `npm run civic`; misses are expected.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lookup } from '../../src/main.ts'
import type { Source } from '../../src/main.ts'

const read = (path: string): unknown => JSON.parse(readFileSync(`counties/${path}`, 'utf8'))
const source: Source = {
  index: async () => read('index.json') as Awaited<ReturnType<Source['index']>>,
  file: async (county, zip) => { try { return read(`${county}/streets/${zip}.json`) as Awaited<ReturnType<Source['file']>> } catch { return {} } },
  mapIndex: async () => ({}),
  maps: async () => ({ type: 'FeatureCollection', features: [] })
}

// Each address sits under a `# County: sources` line; other lines starting with # are notes.
const rows: Array<[string, string]> = []
let county = ''
for (const line of readFileSync('spec/civic/addresses.txt', 'utf8').split('\n').map((text) => text.trim())) {
  if (line.startsWith('# ')) county = line.slice(2).split(':')[0]
  else if (line && !line.startsWith('#')) rows.push([county, line])
}

describe('civic buildings', () => {
  it.each(rows)('%s: %s', async (county, address) => {
    expect((await lookup(address, source)).text).toMatch(new RegExp(`^\\S+: ${county} County$`))
  })
})
