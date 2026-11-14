import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATA, outline, remoteSource } from '../../src/lookup.ts'
import type { Found } from '../../src/lookup.ts'

const SHAPE = { type: 'Feature', id: '44007', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }
const FILES: Record<string, unknown> = {
  'https://example.org/data/index.json': { 41: { name: 'San Mateo County', zipcodes: ['94025'] } },
  'https://example.org/data/41/shapes/94025.json': { type: 'FeatureCollection', features: [SHAPE] }
}
const fetcher = async (url: string) => ({ ok: url in FILES, json: async () => FILES[url] }) as Response
const FOUND: Found = { county: '41', number: '44007', zip: '94025' }

describe('remoteSource', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('reads the files at the address given', async () => {
    expect(await remoteSource('https://example.org/data/', fetcher).index()).toEqual(FILES['https://example.org/data/index.json'])
  })

  it('reads a missing file as empty', async () => {
    const source = remoteSource('https://example.org/data/', fetcher)
    expect(await source.file('41', '99999')).toEqual({})
    expect(await source.mapIndex('41')).toEqual({})
    expect(await source.maps('41', '99999')).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('reads the published files by default', async () => {
    const fetched = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetched)
    await remoteSource().index()
    expect(fetched).toHaveBeenCalledWith(`${DATA}index.json`)
  })
})

describe('outline', () => {
  const source = remoteSource('https://example.org/data/', fetcher)

  it('gives the precinct found', async () => {
    expect(await outline(FOUND, source)).toEqual(SHAPE)
  })

  it('gives nothing when the county has no outline for it', async () => {
    expect(await outline({ ...FOUND, number: '44008' }, source)).toBeUndefined()
  })
})
