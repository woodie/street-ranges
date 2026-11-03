export type Range = [low: number, high: number, precinct: string]
export type Streets = Record<string, Range[]>
export type Index = Record<string, { name: string, zipcodes: string[] }>
export interface Source {
  index: () => Promise<Index>
  file: (county: string, zip: string) => Promise<Streets>
  mapIndex: (county: string) => Promise<Record<string, string>>
  maps: (county: string, zip: string) => Promise<Record<string, string>>
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

// A link to a precinct, like 41-44007: county and number.
const LINK = /^(\d\d)-0*(\d+)$/

const NORTH_UP = '#c4c4c4'
const NORTH_TURNED = '#fca1a9'
const NORTH_UP_STROKE = '#808080'
const NORTH_TURNED_STROKE = '#c0303c'

const UNIT = /\s+(?:(?:APT|UNIT|STE|SUITE|SPC|OFC|BLDG|RM|FL|LOT|TRLR|LOWR|UPPR|REAR|FRNT|BSMT|PH)\b|#).*$/

export function normalizeStreet (street: string): string {
  const words = street.toUpperCase().replace(/[.'’]/g, '').replace(UNIT, '')
    .split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] ?? word)
  if (words[0] === 'SAINT') words[0] = 'ST'
  if (words.length > 1) words[words.length - 1] = LAST_WORDS[words[words.length - 1]] ?? words[words.length - 1]
  return words.join(' ').replace(/^ALAMEDA DE LAS PULGAS$/, 'ALAMEDA')
}

export function parseAddress (text: string): Address | null {
  let rest = text.toUpperCase().replace(/\s+/g, ' ').trim()
  const zipMatch = rest.match(/\b(\d{5})(-\d{4})?$/)
  if (zipMatch) rest = rest.slice(0, zipMatch.index).trim()
  rest = rest.replace(/,?\s*(CA|CALIFORNIA)$/, '').trim()
  const match = rest.split(',')[0].trim().match(/^(\d+)\S*\s+(.+)$/)
  return match && { number: parseInt(match[1], 10), street: normalizeStreet(match[2]), zip: zipMatch && zipMatch[1] }
}

// Exact, or missing its N/S/E/W; then a known street followed by a city; then missing its St/Ave.
function matchingStreets (names: string[], typed: string): string[] {
  const exact = names.filter((name) => name === typed)
  if (!exact.length) exact.push(...names.filter((name) => /^[NSEW] /.test(name) && name.slice(2) === typed))
  if (exact.length) return exact
  const withCity = names.filter((name) => typed.startsWith(`${name} `))
  if (!withCity.length) return names.filter((name) => name.startsWith(`${typed} `))
  const longest = Math.max(...withCity.map((name) => name.length))
  return withCity.filter((name) => name.length === longest)
}

function precinctsIn (streets: Streets, { number, street }: Address): string[] {
  return matchingStreets(Object.keys(streets), street).flatMap((name) => {
    const range = streets[name].find(([low, high]) => low % 2 === number % 2 && low <= number && number <= high)
    return range ? [range[2]] : []
  })
}

function countyList (counties: Index): string {
  const names = Object.values(counties).map(({ name }) => name.replace(/ County$/, ''))
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)} County`
}

export async function lookup (text: string, source: Source): Promise<Answer> {
  const address = parseAddress(text)
  if (!address) return { text: 'Please enter a street address, starting with the house number.' }
  const { zip } = address
  if (!zip) return { text: 'Please include the zip code.' }
  const counties = await source.index()
  const listed = Object.keys(counties).filter((county) => counties[county].zipcodes.includes(zip))
  if (!listed.length) return { text: `Sorry, ${zip} isn't in ${countyList(counties)}.` }
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

// A map after some quarter turns to the left. Labels stay put, flipped once they'd read upside down.
export function turnedMap (svg: string, turns: number): string {
  const [head, across, down] = svg.match(/^<svg[^>]*viewBox="0 0 (\d+) (\d+)">/)!
  const width = turns % 2 ? down : across
  const height = turns % 2 ? across : down
  const move = ['', `translate(0 ${across}) rotate(-90)`, `translate(${across} ${down}) rotate(180)`, `translate(${down} 0) rotate(90)`][turns]
  const styleEnd = svg.indexOf('</style>') + '</style>'.length
  const drawing = svg.slice(styleEnd, -'</svg>'.length)
  const labels = turns < 2 ? drawing : drawing.replace(/<text x="(\d+)" y="(\d+)"/g, '<text transform="rotate(180 $1 $2)" x="$1" y="$2"')
  const opening = head.replace(`0 0 ${across} ${down}`, `0 0 ${width} ${height}`)
  return `${opening}${svg.slice(head.length, styleEnd)}<g transform="${move}">${labels}</g>${northMarker(+width, turns)}</svg>`
}

// Sized by the map's width, which is what fills the page, so it's the same size on every map.
function northMarker (width: number, turns: number): string {
  const [color, stroke] = turns ? [NORTH_TURNED, NORTH_TURNED_STROKE] : [NORTH_UP, NORTH_UP_STROKE]
  const spot = width * 0.08
  const scale = width * 0.12 / 44
  return `<g transform="translate(${width - spot} ${spot}) scale(${scale}) rotate(${-90 * turns})" stroke-linejoin="round">` +
    `<path d="M0-15 7 2 0-2-7 2Z" fill="${color}" stroke="${stroke}" stroke-width="0.75"/>` +
    `<path d="M-2.4 11V5L2.4 11V5" fill="none" stroke="${NORTH_UP}" stroke-width="1.4"/></g>`
}

export function start ({ document, fetch }: Env = globalThis): void {
  const form = document.querySelector('form')!
  const input = document.querySelector('input')!
  const result = document.getElementById('result')!
  const apply = document.querySelector<HTMLButtonElement>('button[type=submit]')!
  const reset = document.querySelector<HTMLButtonElement>('button[type=reset]')!
  const copy = document.querySelector<HTMLAnchorElement>('#copy')!
  const copyLabel = copy.querySelector('span')!
  const rotate = document.querySelector<HTMLButtonElement>('#rotate')!
  const map = document.querySelector<HTMLImageElement>('#map')!
  const window = document.defaultView!
  const { history, location, navigator } = window
  let applied = ''
  let latest = 0
  let shown = ''
  let turns = 0
  const get = (path: string) => fetch(`counties/${path}.json`).then((reply) => {
    if (!reply.ok) throw new Error(`${reply.status} ${path}`)
    return reply.json()
  })
  // A county with no maps is not a failure.
  const getMaps = (path: string) => fetch(`counties/${path}.json`).then((reply) => reply.ok ? reply.json() : {})
  const source: Source = {
    index: () => get('index'),
    file: (county, zip) => get(`${county}/streets/${zip}`),
    mapIndex: (county) => getMaps(`${county}/maps/index`),
    maps: (county, zip) => getMaps(`${county}/maps/${zip}`).catch(() => ({}))
  }
  const clearHash = () => history.replaceState(null, '', location.pathname + location.search)
  const hideMap = () => {
    map.hidden = true
    copy.hidden = true
    rotate.hidden = true
  }
  const drawMap = () => { map.src = `data:image/svg+xml,${encodeURIComponent(turnedMap(shown, turns))}` }
  const showMap = async ({ county, number, zip }: Found, run: number) => {
    const svg = (await source.maps(county, zip))[number]
    if (run !== latest || !svg) return
    shown = svg
    turns = 0
    drawMap()
    map.alt = `Map of precinct ${number}`
    copy.href = `${location.pathname}#${county}-${number}`
    copyLabel.textContent = 'Copy link'
    map.hidden = false
    copy.hidden = false
    rotate.hidden = false
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const run = ++latest
    const typed = input.value.trim()
    const link = typed.match(LINK)
    result.textContent = ''
    hideMap()
    try {
      const answer = await (link ? lookupLink(link[1], link[2], source) : lookup(typed, source))
      if (run !== latest) return
      result.textContent = answer.text
      if (answer.found) {
        if (link) {
          input.value = `${link[1]}-${link[2]}`
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
  rotate.addEventListener('click', () => {
    turns = (turns + 1) % 4
    drawMap()
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
