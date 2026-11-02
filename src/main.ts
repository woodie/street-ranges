export type Range = [low: number, high: number, precinct: string]
export type Streets = Record<string, Range[]>
export type Load = (county: string, zip: string) => Promise<Streets | null>
export interface Address { number: number, street: string, zip: string | null }
export type Env = Pick<typeof globalThis, 'document' | 'fetch'>

const COUNTIES: Record<string, string> = { 41: 'San Mateo County', 43: 'Santa Clara County' }

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

const UNIT = /\s+(?:(?:APT|UNIT|STE|SUITE|SPC|OFC|BLDG|RM|FL|LOT|TRLR|LOWR|UPPR|REAR|FRNT|BSMT|PH)\b|#).*$/

export function normalizeStreet (street: string): string {
  const words = street.toUpperCase().replace(/[.'’]/g, '').replace(UNIT, '')
    .split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] ?? word)
  if (words[0] === 'SAINT') words[0] = 'ST'
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

function describePrecinct (precinct: string): string {
  return `Precinct ${precinct.slice(2).replace(/^0+/, '')}, ${COUNTIES[precinct.slice(0, 2)]}`
}

export async function lookup (text: string, load: Load): Promise<string> {
  const address = parseAddress(text)
  if (!address) return 'Please enter a street address, starting with the house number.'
  const { zip } = address
  if (!zip) return 'Please include the zip code.'
  const files = await Promise.all(Object.keys(COUNTIES).map((county) => load(county, zip)))
  const known = files.filter((file) => file !== null)
  if (!known.length) return `Sorry, ${zip} isn't in San Mateo or Santa Clara County.`
  const found = new Set(known.flatMap((streets) => precinctsIn(streets, address)))
  if (found.size > 1) return "There's more than one match. Please add St, Ave, etc."
  const [precinct] = found
  return precinct ? describePrecinct(precinct) : "Sorry, that address isn't in the street ranges."
}

export function start ({ document, fetch }: Env = globalThis): void {
  const form = document.querySelector('form')!
  const input = document.querySelector('input')!
  const result = document.getElementById('result')!
  const load: Load = (county, zip) => fetch(`out/${county}/${zip}.json`).then((reply) => reply.ok ? reply.json() : null)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    result.textContent = ''
    try {
      result.textContent = await lookup(input.value, load)
    } catch {
      result.textContent = "Sorry, the street ranges couldn't be loaded. Please try again."
    }
  })
}
