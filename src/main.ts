import * as L from 'leaflet'
import leafletStyle from 'leaflet/dist/leaflet.css?inline'
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson'

export type Range = [low: number, high: number, precinct: string]
export type Streets = Record<string, Range[]>
export type Index = Record<string, { name: string, zipcodes: string[] }>
export type Shapes = FeatureCollection<Polygon>
export interface Source {
  index: () => Promise<Index>
  file: (county: string, zip: string) => Promise<Streets>
  mapIndex: (county: string) => Promise<Record<string, string>>
  maps: (county: string, zip: string) => Promise<Shapes>
}
export interface Found { county: string, number: string, zip: string }
export interface Answer { text: string, found?: Found }
export interface Address { number: number, street: string, zip: string | null }
export type Env = Pick<typeof globalThis, 'document' | 'fetch'>

const STREET_WORDS: Record<string, string> = {
  STREET: 'ST',
  AVENUE: 'AVE',
  AV: 'AVE',
  ROAD: 'RD',
  DRIVE: 'DR',
  LANE: 'LN',
  COURT: 'CT',
  PLACE: 'PL',
  CIRCLE: 'CIR',
  BOULEVARD: 'BLVD',
  TERRACE: 'TER',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  TRAIL: 'TRL',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  FIRST: '1ST',
  SECOND: '2ND',
  THIRD: '3RD',
  FOURTH: '4TH',
  FIFTH: '5TH',
  SIXTH: '6TH',
  SEVENTH: '7TH',
  EIGHTH: '8TH',
  NINTH: '9TH',
  TENTH: '10TH',
  ELEVENTH: '11TH',
  TWELFTH: '12TH'
}

// Street types only as the last word, so HILL RD and PLAZA N keep their names.
const LAST_WORDS: Record<string, string> = {
  ALLEY: 'ALY',
  PLAZA: 'PLZ',
  HILL: 'HL',
  SQUARE: 'SQ',
  CROSSING: 'XING',
  LP: 'LOOP'
}

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

const UNIT = /\s+(?:(?:APT|UNIT|STE|SUITE|SPC|OFC|BLDG|RM|FL|LOT|TRLR|LOWR|UPPR|REAR|FRNT|BSMT|PH)\b|#).*$/

export function normalizeStreet (street: string): string {
  const words = street.toUpperCase().replace(/[.'’]/g, '').replace(UNIT, '')
    .split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] ?? word)
  if (words[0] === 'SAINT') words[0] = 'ST'
  if (words.length > 1) words[words.length - 1] = LAST_WORDS[words[words.length - 1]] ?? words[words.length - 1]
  return words.join(' ').replace(/^COUNTY RD\b/, 'CO RD').replace(/^ALAMEDA DE LAS PULGAS$/, 'ALAMEDA')
}

export function parseAddress (text: string): Address | null {
  let rest = text.toUpperCase().replace(/\s+/g, ' ').trim()
  const zipMatch = rest.match(/\b(\d{5})(-\d{4})?$/)
  if (zipMatch) rest = rest.slice(0, zipMatch.index).trim()
  rest = rest.replace(/,?\s*(CA|CALIFORNIA)$/, '').trim()
  // A place name first, as Google Maps copies it ("Modoc Medical Center, 1111 N Nagle St"), is skipped.
  const part = rest.split(',').map((piece) => piece.trim()).find((piece) => /^\d/.test(piece)) ?? ''
  const match = part.match(/^(\d+)\S*\s+(.+)$/)
  return match && { number: parseInt(match[1], 10), street: normalizeStreet(match[2]), zip: zipMatch && zipMatch[1] }
}

// Exact, or missing its N/S/E/W; then a known street followed by a city; then missing its St/Ave.
function matchingStreets (names: string[], typed: string): string[] {
  // Both spellings of a direction count, as data can hold W CIVIC CENTER DR and CIVIC CENTER DR W side by side.
  const moved = /^[NSEW] /.test(typed) ? `${typed.slice(2)} ${typed[0]}` : typed.replace(/^(.+) ([NSEW])$/, '$2 $1')
  const exact = names.filter((name) => name === typed || name === moved)
  if (!exact.length) exact.push(...names.filter((name) => /^[NSEW] /.test(name) && name.slice(2) === typed))
  if (exact.length) return exact
  const withCity = names.filter((name) => typed.startsWith(`${name} `))
  if (withCity.length) {
    const longest = Math.max(...withCity.map((name) => name.length))
    return withCity.filter((name) => name.length === longest)
  }
  const untyped = names.filter((name) => name.startsWith(`${typed} `))
  return untyped.length ? untyped : otherType(names, typed)
}

// The same street with another type, as Sheriff Cady Ln for the Census's Sheriff Cady Rd.
const TYPES = /^(?:ST|AVE|RD|LN|DR|CT|WAY|PL|BLVD|CIR|TER|PKWY|HWY|TRL|LOOP|ALY|PLZ|SQ|XING|HL|RUN|PATH|ROW|WALK)$/
function otherType (names: string[], typed: string): string[] {
  const base = (name: string): string | null => {
    const words = name.split(' ')
    return words.length > 1 && TYPES.test(words[words.length - 1]) ? words.slice(0, -1).join(' ') : null
  }
  const typedBase = base(typed)
  return typedBase ? names.filter((name) => base(name) === typedBase) : []
}

function precinctsIn (streets: Streets, { number, street }: Address): string[] {
  return matchingStreets(Object.keys(streets), street).flatMap((name) => {
    const range = streets[name].find(([low, high]) => low % 2 === number % 2 && low <= number && number <= high)
    return range ? [range[2]] : []
  })
}

export async function lookup (text: string, source: Source): Promise<Answer> {
  const address = parseAddress(text)
  if (!address) return { text: 'Please enter a street address, starting with the house number.' }
  const { zip } = address
  if (!zip) return { text: 'Please include the zip code.' }
  const counties = await source.index()
  const listed = Object.keys(counties).filter((county) => counties[county].zipcodes.includes(zip))
  if (!listed.length) return { text: 'Invalid address' }
  const files = await Promise.all(listed.map((county) => source.file(county, zip)))
  const found = new Set(files.flatMap((streets) => precinctsIn(streets, address)))
  if (found.size > 1) return { text: "There's more than one match. Please add St, Ave, etc." }
  const [precinct] = found
  if (!precinct) return { text: "Sorry, that address isn't in the street ranges." }
  const county = precinct.slice(0, 2)
  const number = precinct.slice(2).replace(/^0+/, '')
  return { text: `${number}: ${counties[county].name}`, found: { county, number, zip } }
}

export async function lookupLink (county: string, number: string, source: Source): Promise<Answer> {
  const name = (await source.index())[county]?.name
  const zip = (await source.mapIndex(county))[number]
  if (!name || !zip) return { text: `Sorry, there's no map for ${county}-${number}.` }
  return { text: `${number}: ${name}`, found: { county, number, zip } }
}

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
