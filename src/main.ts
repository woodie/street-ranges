import * as L from 'leaflet'
import leafletStyle from 'leaflet/dist/leaflet.css?inline'
import type { Feature, Polygon, Position } from 'geojson'
import { lookup, lookupLink } from './lookup.ts'
import type { Found, Shapes, Source } from './lookup.ts'

export * from './lookup.ts'
export type Env = Pick<typeof globalThis, 'document' | 'fetch'>

// A link to a precinct, like 41-44007 or 07-RICH101: county and number.
const LINK = /^(\d\d)-0*([0-9A-Z]+)$/i

const NO_SHAPES: Shapes = { type: 'FeatureCollection', features: [] }
const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), ' +
  'Esri Korea, Esri (Thailand), NGCC, &copy; OpenStreetMap contributors, and the GIS User Community'
const DEEPEST = 19
const DEEPEST_START = 18
const PRECINCT = { color: '#000', weight: 1, fill: false, interactive: false }
const VEIL = { stroke: false, fillColor: '#808080', fillOpacity: 1, interactive: false }
const FADE = { stroke: false, fillColor: '#fff', fillOpacity: 0.4, interactive: false }
const BOOST = { stroke: false, fillColor: '#f00', fillOpacity: 0.5, interactive: false }
const WIDE = 1 // screens past each edge that the shapes are drawn, so a drag doesn't uncover the map
const WORLD: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]

// Esri's street map, with the veil, the fade, the boost and the outline over it.
function precinctMap (element: HTMLElement): [L.Map, L.TileLayer] {
  const map = L.map(element, { scrollWheelZoom: false, maxZoom: DEEPEST })
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a> | Powered by <a href="https://www.esri.com">Esri</a>')
  const tiles = L.tileLayer(TILES, { maxZoom: DEEPEST, attribution: ATTRIBUTION }).addTo(map)
  map.createPane('veil').style.zIndex = '390'
  map.createPane('fade').style.zIndex = '395'
  map.createPane('boost').style.zIndex = '396'
  return [map, tiles]
}

export function start ({ document, fetch }: Env = globalThis): void {
  document.head.append(Object.assign(document.createElement('style'), { textContent: leafletStyle }))
  const form = document.querySelector('form')!
  const input = document.querySelector('input')!
  const result = document.getElementById('result')!
  const apply = document.querySelector<HTMLButtonElement>('button[type=submit]')!
  const reset = document.querySelector<HTMLButtonElement>('button[type=reset]')!
  const copy = document.querySelector<HTMLAnchorElement>('#copy')!
  const copyLabel = copy.querySelector('span')!
  const print = document.querySelector<HTMLAnchorElement>('#print')!
  const map = document.querySelector<HTMLElement>('#map')!
  const window = document.defaultView!
  const { history, location, navigator } = window
  let applied = ''
  let latest = 0
  let leaflet: L.Map | undefined
  let tiles: L.TileLayer | undefined
  let outline: L.GeoJSON | undefined
  let veil: L.GeoJSON | undefined
  let fade: L.GeoJSON | undefined
  let boost: L.GeoJSON | undefined
  const renderers: Record<string, L.Renderer> = {}
  const drawIn = (pane: string) => {
    renderers[pane] ??= L.svg({ pane, padding: WIDE })
    return { pane, renderer: renderers[pane] }
  }
  const get = (path: string) => fetch(`counties/${path}.json`).then((reply) => {
    if (!reply.ok) throw new Error(`${reply.status} ${path}`)
    return reply.json()
  })
  // A county with no shapes is not a failure.
  const getShapes = <T>(path: string, none: T): Promise<T> => fetch(`counties/${path}.json`).then((reply) => reply.ok ? reply.json() : none)
  const source: Source = {
    index: () => get('index'),
    file: (county, zip) => get(`${county}/streets/${zip}`),
    mapIndex: (county) => getShapes(`${county}/shapes/index`, {}),
    maps: (county, zip) => getShapes(`${county}/shapes/${zip}`, NO_SHAPES).catch(() => NO_SHAPES)
  }
  const clearHash = () => history.replaceState(null, '', location.pathname + location.search)
  const hideMap = () => {
    map.hidden = true
    copy.hidden = true
    print.hidden = true
  }
  const fit = () => {
    leaflet!.invalidateSize()
    leaflet!.fitBounds(outline!.getBounds(), { padding: [16, 16], maxZoom: DEEPEST_START, animate: false })
  }
  const showMap = async ({ county, number, zip }: Found, run: number) => {
    const shape = (await source.maps(county, zip)).features.find((feature: Feature) => feature.id === number)
    if (run !== latest || !shape) return
    map.hidden = false
    map.ariaLabel = `Map of precinct ${number}`
    if (!leaflet) [leaflet, tiles] = precinctMap(map)
    outline?.remove()
    veil?.remove()
    fade?.remove()
    boost?.remove()
    // Everything but the precinct turns a lighter gray, so the precinct keeps its color and contrast.
    const outside: Feature<Polygon> = { ...shape, geometry: { type: 'Polygon', coordinates: [WORLD, ...shape.geometry.coordinates] } }
    veil = L.geoJSON(outside, { style: VEIL, ...drawIn('veil') }).addTo(leaflet)
    fade = L.geoJSON(outside, { style: FADE, ...drawIn('fade') }).addTo(leaflet)
    boost = L.geoJSON(shape, { style: BOOST, ...drawIn('boost') }).addTo(leaflet)
    outline = L.geoJSON(shape, { style: PRECINCT, ...drawIn('overlayPane') }).addTo(leaflet)
    fit()
    copy.href = `${location.pathname}#${county}-${number}`
    copyLabel.textContent = 'Copy link'
    copy.hidden = false
    print.hidden = false
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const run = ++latest
    const typed = input.value.trim()
    const link = typed.match(LINK)
    result.textContent = ''
    hideMap()
    try {
      const answer = await (link ? lookupLink(link[1], link[2].toUpperCase(), source) : lookup(typed, source))
      if (run !== latest) return
      result.textContent = answer.text
      if (answer.found) {
        if (link) {
          input.value = `${link[1]}-${link[2].toUpperCase()}`
          history.replaceState(null, '', `#${input.value}`)
        }
        applied = input.value.trim()
        apply.disabled = true
        await showMap(answer.found, run)
      }
    } catch {
      result.textContent = "Sorry, the street ranges couldn't be loaded. Please try again."
    }
    reset.hidden = false
  })
  input.addEventListener('input', () => {
    const typed = input.value.trim()
    apply.disabled = !typed || typed === applied
    // The URL only ever names a precinct, never an address.
    if (location.hash !== `#${typed}`) clearHash()
  })
  form.addEventListener('reset', () => {
    latest++
    applied = ''
    apply.disabled = true
    result.textContent = ''
    reset.hidden = true
    hideMap()
    clearHash()
    input.focus()
  })
  copy.addEventListener('click', async (event) => {
    event.preventDefault()
    try {
      await navigator.clipboard.writeText(copy.href)
      copyLabel.textContent = 'Copied'
    } catch {
      copyLabel.textContent = 'Press and hold to copy'
    }
  })
  // The map draws for the size it has, so Print sizes it to the page, waits for its tiles, then prints.
  print.addEventListener('click', async (event) => {
    event.preventDefault()
    document.documentElement.classList.add('printing')
    fit()
    if (tiles!.isLoading()) await new Promise((resolve) => tiles!.once('load', resolve))
    window.print()
  })
  window.addEventListener('afterprint', () => {
    if (!document.documentElement.classList.contains('printing')) return
    document.documentElement.classList.remove('printing')
    fit()
  })
  const openHash = () => {
    const id = location.hash.slice(1)
    if (!LINK.test(id)) return
    input.value = id
    form.requestSubmit()
  }
  window.addEventListener('hashchange', openHash)
  openHash()
}
