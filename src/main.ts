export type Range = [low: number, high: number, precinct: string]
export type Streets = Record<string, Range[]>
export type Index = Record<string, { name: string, zipcodes: string[] }>
export interface Source {
  index: () => Promise<Index>
  file: (county: string, zip: string) => Promise<Streets>
}
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

function describePrecinct (precinct: string, counties: Index): string {
  return `Precinct ${precinct.slice(2).replace(/^0+/, '')}, ${counties[precinct.slice(0, 2)].name}`
}

function countyList (counties: Index): string {
  const names = Object.values(counties).map(({ name }) => name.replace(/ County$/, ''))
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)} County`
}

export async function lookup (text: string, source: Source): Promise<string> {
  const address = parseAddress(text)
  if (!address) return 'Please enter a street address, starting with the house number.'
  const { zip } = address
  if (!zip) return 'Please include the zip code.'
  const counties = await source.index()
  const listed = Object.keys(counties).filter((county) => counties[county].zipcodes.includes(zip))
  if (!listed.length) return `Sorry, ${zip} isn't in ${countyList(counties)}.`
  const files = await Promise.all(listed.map((county) => source.file(county, zip)))
  const found = new Set(files.flatMap((streets) => precinctsIn(streets, address)))
  if (found.size > 1) return "There's more than one match. Please add St, Ave, etc."
  const [precinct] = found
  return precinct ? describePrecinct(precinct, counties) : "Sorry, that address isn't in the street ranges."
}

export function start ({ document, fetch }: Env = globalThis): void {
  const form = document.querySelector('form')!
  const input = document.querySelector('input')!
  const result = document.getElementById('result')!
  const apply = document.querySelector<HTMLButtonElement>('button[type=submit]')!
  const reset = document.querySelector<HTMLButtonElement>('button[type=reset]')!
  let applied = ''
  const get = (path: string) => fetch(`counties/${path}.json`).then((reply) => {
    if (!reply.ok) throw new Error(`${reply.status} ${path}`)
    return reply.json()
  })
  const source: Source = { index: () => get('index'), file: (county, zip) => get(`${county}/${zip}`) }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const typed = input.value.trim()
    result.textContent = ''
    try {
      const answer = await lookup(typed, source)
      result.textContent = answer
      if (answer.startsWith('Precinct ')) {
        applied = typed
        apply.disabled = true
      }
    } catch {
      result.textContent = "Sorry, the street ranges couldn't be loaded. Please try again."
    }
    reset.hidden = false
  })
  input.addEventListener('input', () => {
    const typed = input.value.trim()
    apply.disabled = !typed || typed === applied
  })
  form.addEventListener('reset', () => {
    applied = ''
    apply.disabled = true
    result.textContent = ''
    reset.hidden = true
    input.focus()
  })
}
