// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { lookup, lookupLink, normalizeStreet, parseAddress, start } from '../../src/main.ts'
import type { Address, Answer, Index, Shapes, Source, Streets } from '../../src/main.ts'

const drawn = vi.hoisted(() => ({ maps: 0, outlines: [] as unknown[], removed: 0, fitted: 0, loading: false }))
vi.mock('leaflet', () => {
  const layer = { addTo: () => layer, isLoading: () => drawn.loading, once: (_event: string, loaded: () => void) => { setTimeout(loaded) } }
  return {
    map: () => {
      drawn.maps++
      return { attributionControl: { setPrefix: () => {} }, createPane: () => ({ style: {} }), invalidateSize: () => {}, fitBounds: () => { drawn.fitted++ } }
    },
    tileLayer: () => layer,
    svg: () => ({}),
    geoJSON: (shape: unknown) => {
      drawn.outlines.push(shape)
      const outline = { addTo: () => outline, getBounds: () => ({}), remove: () => { drawn.removed++ } }
      return outline
    }
  }
})

const MENLO_PARK: Streets = {
  'OCONNOR ST': [[1, 233, '4144007'], [2, 498, '4144007'], [235, 483, '4144031'], [485, 499, '4144043']],
  'E OKEEFE ST': [[2, 200, '4144007']],
  'WOODLAND AVE': [[301, 899, '4144009'], [500, 898, '4144009']],
  'CAMPO BELLO': [[2, 10, '4134009']],
  'CAMPO BELLO CT': [[1, 99, '4134009'], [2, 98, '4134009']],
  'CIVIC CENTER DR W': [[100, 198, '4144009']]
}
const DALY_CITY: Streets = {
  'N LYCETT ST': [[101, 199, '4156060']],
  'S LYCETT ST': [[101, 199, '4156050']]
}
const SAN_JOSE: Streets = { 'BAMBI LN': [[2301, 2699, '430007904'], [2530, 2698, '430007904']] }
const NORTH_BEACH: Streets = { 'VALLEJO ST': [[801, 1085, '387309'], [806, 1070, '387309']] }
const EAST_PALO_ALTO: Streets = {
  'NEWELL RD': [[2, 198, '4140010']],
  'W BAYSHORE RD': [[2400, 2598, '4140010']]
}
const PALO_ALTO: Streets = {
  'NEWELL RD': [[900, 1398, '430002075']],
  'W BAYSHORE RD': [[2450, 2586, '430002102']]
}

const NAMES: Record<string, string> = { 38: 'San Francisco County', 41: 'San Mateo County', 43: 'Santa Clara County' }
const indexOf = (paths: string[]): Index => Object.fromEntries(Object.keys(NAMES).map((county) => [county, {
  name: NAMES[county],
  zipcodes: paths.filter((path) => path.startsWith(`${county}/`)).map((path) => path.slice(3))
}]))
const sourceFor = (files: Record<string, Streets>): Source => ({
  index: async () => indexOf(Object.keys(files)),
  file: async (county, zip) => files[`${county}/${zip}`],
  mapIndex: async () => ({}),
  maps: async () => ({ type: 'FeatureCollection', features: [] })
})
const shape = (id: string) => ({ type: 'Feature' as const, id, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[-121.8, 37.3], [-121.79, 37.3], [-121.79, 37.31], [-121.8, 37.3]]] } })
const SHAPES: Shapes = { type: 'FeatureCollection', features: [shape('7904'), shape('A101')] }
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('normalizeStreet', () => {
  let typed: string
  let street: string

  justBeforeEach(() => { street = normalizeStreet(typed) })

  context('when the street type is spelled out', () => {
    beforeEach(() => { typed = 'Woodland Avenue' })

    it('abbreviates it', () => {
      expect(street).toBe('WOODLAND AVE')
    })
  })

  context('when the street type is one San Francisco abbreviates', () => {
    beforeEach(() => { typed = 'Clarion Alley' })

    it('abbreviates it', () => {
      expect(street).toBe('CLARION ALY')
    })
  })

  context('when the type word starts the name', () => {
    beforeEach(() => { typed = 'Hill Rd' })

    it('keeps the name', () => {
      expect(street).toBe('HILL RD')
    })
  })

  context('when the type word is the whole name', () => {
    beforeEach(() => { typed = 'Plaza' })

    it('keeps the name', () => {
      expect(street).toBe('PLAZA')
    })
  })

  context('when the direction and number are spelled out', () => {
    beforeEach(() => { typed = 'West Third Street' })

    it('abbreviates both', () => {
      expect(street).toBe('W 3RD ST')
    })
  })

  context('when the name has an apostrophe', () => {
    beforeEach(() => { typed = "O'Connor St" })

    it('removes it', () => {
      expect(street).toBe('OCONNOR ST')
    })
  })

  context('when a unit follows the street', () => {
    beforeEach(() => { typed = 'E Okeefe St Apt 4' })

    it('removes the unit', () => {
      expect(street).toBe('E OKEEFE ST')
    })
  })

  context('when the unit is a pound sign', () => {
    beforeEach(() => { typed = 'E Okeefe St #4' })

    it('removes the unit', () => {
      expect(street).toBe('E OKEEFE ST')
    })
  })

  context('when the name starts with Saint', () => {
    beforeEach(() => { typed = 'Saint Francis St' })

    it('uses the county\'s St', () => {
      expect(street).toBe('ST FRANCIS ST')
    })
  })

  context('when it is a numbered county road', () => {
    beforeEach(() => { typed = 'County Road 98' })

    it('uses Census\'s Co Rd and keeps the number', () => {
      expect(street).toBe('CO RD 98')
    })
  })

  context('when it is Alameda de las Pulgas', () => {
    beforeEach(() => { typed = 'Alameda de las Pulgas' })

    it('uses the county\'s shorter name', () => {
      expect(street).toBe('ALAMEDA')
    })
  })
})

describe('parseAddress', () => {
  let text: string
  let address: Address | null

  justBeforeEach(() => { address = parseAddress(text) })

  context('with a city, state and zip code', () => {
    beforeEach(() => { text = '353 Tennyson Ave, Palo Alto, CA 94301' })

    it('finds the number, street and zip code', () => {
      expect(address).toEqual({ number: 353, street: 'TENNYSON AVE', zip: '94301' })
    })
  })

  context('with a place name first, as Google Maps copies it', () => {
    beforeEach(() => { text = 'Modoc Medical Center, 1111 N Nagle St, Alturas, CA 96101' })

    it('reads the address after it', () => {
      expect(address).toEqual({ number: 1111, street: 'N NAGLE ST', zip: '96101' })
    })
  })

  context('with a zip+4', () => {
    beforeEach(() => { text = '1350 W Bayshore Rd 94303-1234' })

    it('keeps the first five digits', () => {
      expect(address?.zip).toBe('94303')
    })
  })

  context('with a house number suffix', () => {
    beforeEach(() => { text = '238B Oconnor St 94025' })

    it('keeps the digits', () => {
      expect(address?.number).toBe(238)
    })
  })

  context('without a zip code', () => {
    beforeEach(() => { text = '238 Oconnor St' })

    it('has no zip code', () => {
      expect(address?.zip).toBeNull()
    })
  })

  context('without a house number', () => {
    beforeEach(() => { text = 'Oconnor St 94025' })

    it('is not an address', () => {
      expect(address).toBeNull()
    })
  })
})

describe('lookup', () => {
  let text: string
  let files: Record<string, Streets>
  let answer: Answer

  beforeEach(() => {
    files = {
      '38/94133': NORTH_BEACH,
      '41/94025': MENLO_PARK,
      '41/94015': DALY_CITY,
      '43/95116': SAN_JOSE,
      '41/94303': EAST_PALO_ALTO,
      '43/94303': PALO_ALTO
    }
  })

  justBeforeEach(async () => { answer = await lookup(text, sourceFor(files)) })

  context('with a San Mateo address', () => {
    beforeEach(() => { text = "238 O'Connor Street, Menlo Park, CA 94025" })

    it('gives the short precinct and county', () => {
      expect(answer.text).toBe('44007: San Mateo County')
    })
  })

  context('with a San Francisco address', () => {
    beforeEach(() => { text = '977 Vallejo St, San Francisco, CA 94133' })

    it('gives the precinct and county', () => {
      expect(answer.text).toBe('7309: San Francisco County')
    })
  })

  context('with a Santa Clara address', () => {
    beforeEach(() => { text = '2501 Bambi Ln, San Jose 95116' })

    it('drops the zeros from the precinct', () => {
      expect(answer.text).toBe('7904: Santa Clara County')
    })
  })

  context('when the precinct changes partway along a side', () => {
    beforeEach(() => { text = '359 Oconnor St 94025' })

    it('uses the range holding that number', () => {
      expect(answer.text).toBe('44031: San Mateo County')
    })
  })

  context('when the number is only in a range on the other side', () => {
    beforeEach(() => { text = '101 E Okeefe St 94025' })

    it('finds no range', () => {
      expect(answer.text).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the number is past every range', () => {
    beforeEach(() => { text = '202 E Okeefe St 94025' })

    it('finds no range', () => {
      expect(answer.text).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the street is not listed', () => {
    beforeEach(() => { text = '100 Nowhere Ln 94025' })

    it('finds no range', () => {
      expect(answer.text).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the zip code crosses the county line', () => {
    context('and only San Mateo has the number', () => {
      beforeEach(() => { text = '104 Newell Rd 94303' })

      it('answers from San Mateo', () => {
        expect(answer.text).toBe('40010: San Mateo County')
      })
    })

    context('and only Santa Clara has the number', () => {
      beforeEach(() => { text = '1158 Newell Rd 94303' })

      it('answers from Santa Clara', () => {
        expect(answer.text).toBe('2075: Santa Clara County')
      })
    })

    context('and both counties have the number', () => {
      beforeEach(() => { text = '2526 W Bayshore Rd 94303' })

      it('asks for more detail', () => {
        expect(answer.text).toBe("There's more than one match. Please add St, Ave, etc.")
      })
    })
  })

  context('when the typed direction comes first but the county puts it last', () => {
    beforeEach(() => { text = '150 W Civic Center Dr, Menlo Park, CA 94025' })

    it('finds the street', () => {
      expect(answer.text).toBe('44009: San Mateo County')
    })
  })

  context('when the data has the street under both direction spellings', () => {
    beforeEach(() => {
      files['41/94401'] = { 'CIVIC CENTER DR W': [[400, 698, '4168841']], 'W CIVIC CENTER DR': [[120, 700, '4168841']] }
      text = '700 Civic Center Drive West, San Mateo, CA 94401'
    })

    it('uses the spelling whose range holds the number', () => {
      expect(answer.text).toBe('68841: San Mateo County')
    })
  })

  context('when the typed direction comes last but the county puts it first', () => {
    beforeEach(() => { text = '151 Lycett St N, Daly City, CA 94015' })

    it('finds the street', () => {
      expect(answer.text).toBe('56060: San Mateo County')
    })
  })

  context('when the typed street is missing its direction', () => {
    context('and one street fits', () => {
      beforeEach(() => {
        files['41/94015'] = { 'N LYCETT ST': DALY_CITY['N LYCETT ST'] }
        text = '151 Lycett St 94015'
      })

      it('uses that street', () => {
        expect(answer.text).toBe('56060: San Mateo County')
      })
    })

    context('and two streets fit', () => {
      beforeEach(() => { text = '151 Lycett St 94015' })

      it('asks for more detail', () => {
        expect(answer.text).toBe("There's more than one match. Please add St, Ave, etc.")
      })
    })
  })

  context('when a city follows the street without a comma', () => {
    beforeEach(() => { text = '53 Campo Bello Ct Menlo Park 94025' })

    it('uses the longest street that fits', () => {
      expect(answer.text).toBe('34009: San Mateo County')
    })
  })

  context('when the typed street is missing its type', () => {
    beforeEach(() => { text = '703 Woodland 94025' })

    it('finds the street', () => {
      expect(answer.text).toBe('44009: San Mateo County')
    })
  })

  context('when the typed street has another type than the data', () => {
    beforeEach(() => { text = '703 Woodland Rd 94025' })

    it('finds the street', () => {
      expect(answer.text).toBe('44009: San Mateo County')
    })
  })

  context('when the typed street has no type and matches nothing', () => {
    beforeEach(() => { text = '703 Nowhere 94025' })

    it('is not in the ranges', () => {
      expect(answer.text).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('without a zip code', () => {
    beforeEach(() => { text = '238 Oconnor St' })

    it('asks for one', () => {
      expect(answer.text).toBe('Please include the zip code.')
    })
  })

  context('without a house number', () => {
    beforeEach(() => { text = 'Oconnor St 94025' })

    it('asks for an address', () => {
      expect(answer.text).toBe('Please enter a street address, starting with the house number.')
    })
  })

  context('with a zip code in neither county', () => {
    beforeEach(() => { text = '99 Nowhere Ln 90210' })

    it('says so', () => {
      expect(answer.text).toBe('Invalid address')
    })
  })
})

describe('the page before anything is typed', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync('public/index.html', 'utf8')
  })

  it('starts with Apply disabled', () => {
    expect(document.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
  })

  it('starts with no reset', () => {
    expect(document.querySelector<HTMLButtonElement>('button[type=reset]')?.hidden).toBe(true)
  })
})

describe('start', () => {
  let fetchFile: ReturnType<typeof vi.fn>
  let typed: string

  const reply = (body: unknown) => ({ ok: body !== null, status: body === null ? 404 : 200, json: async () => body })
  const result = () => document.getElementById('result')?.textContent
  const applyButton = () => document.querySelector<HTMLButtonElement>('button[type=submit]')!
  const resetButton = () => document.querySelector<HTMLButtonElement>('button[type=reset]')!
  const map = () => document.querySelector<HTMLElement>('#map')!
  const copy = () => document.querySelector<HTMLAnchorElement>('#copy')!
  const box = () => document.querySelector('input')!
  const retype = (text: string) => {
    document.querySelector('input')!.value = text
    document.querySelector('input')!.dispatchEvent(new Event('input'))
  }

  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync('public/index.html', 'utf8')
    Object.assign(drawn, { maps: 0, outlines: [], removed: 0, fitted: 0, loading: false })
    fetchFile = vi.fn(async (url: string) => reply(
      ({
        'counties/index.json': indexOf(['43/95116', '43/95117']),
        'counties/43/streets/95116.json': SAN_JOSE,
        'counties/43/shapes/index.json': { 7904: '95116', A101: '95116' },
        'counties/43/shapes/95116.json': SHAPES
      } as Record<string, unknown>)[url] ?? null))
    typed = '2501 Bambi Ln 95116'
    history.replaceState(null, '', '/')
  })

  justBeforeEach(async () => {
    start({ document, fetch: fetchFile as unknown as typeof fetch })
    if (typed) {
      retype(typed)
      document.querySelector('form')!.requestSubmit()
    }
    await settled()
  })

  context('when the street ranges load', () => {
    it('disables Apply', () => {
      expect(applyButton().disabled).toBe(true)
    })

    it('offers a reset', () => {
      expect(resetButton().hidden).toBe(false)
    })

    it('shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })

    it('asks for the index, then only the file for that zip code', () => {
      expect(fetchFile.mock.calls.map(([url]) => url)).toEqual(['counties/index.json', 'counties/43/streets/95116.json', 'counties/43/shapes/95116.json'])
    })

    it('never sends the street or house number', () => {
      expect(JSON.stringify(fetchFile.mock.calls)).not.toMatch(/BAMBI|2501/i)
    })
  })

  context('when the visitor edits the address', () => {
    justBeforeEach(() => { retype('2503 Bambi Ln 95116') })

    it('enables Apply', () => {
      expect(applyButton().disabled).toBe(false)
    })
  })

  context('when the visitor retypes the same address', () => {
    justBeforeEach(() => { retype(typed) })

    it('keeps Apply disabled', () => {
      expect(applyButton().disabled).toBe(true)
    })
  })

  context('when the visitor empties the box', () => {
    justBeforeEach(() => { retype('') })

    it('keeps Apply disabled', () => {
      expect(applyButton().disabled).toBe(true)
    })
  })

  context('when the visitor resets', () => {
    justBeforeEach(() => { resetButton().click() })

    it('clears the address', () => {
      expect(document.querySelector('input')?.value).toBe('')
    })

    it('clears the precinct', () => {
      expect(result()).toBe('')
    })

    it('leaves Apply disabled until something is typed', () => {
      expect(applyButton().disabled).toBe(true)
    })

    it('hides the button again', () => {
      expect(resetButton().hidden).toBe(true)
    })

    it('puts the cursor back in the box', () => {
      expect(document.activeElement).toBe(document.querySelector('input'))
    })
  })

  context('when the address has no precinct', () => {
    beforeEach(() => { typed = '99 Nowhere Ln 95116' })

    it('says so', () => {
      expect(result()).toBe("Sorry, that address isn't in the street ranges.")
    })

    it('leaves Apply enabled to try again', () => {
      expect(applyButton().disabled).toBe(false)
    })

    it('offers a reset', () => {
      expect(resetButton().hidden).toBe(false)
    })
  })

  context('when the zip code is in the index but its file is missing', () => {
    beforeEach(() => { typed = '100 Nowhere Ln 95117' })

    it('asks to try again', () => {
      expect(result()).toBe("Sorry, the street ranges couldn't be loaded. Please try again.")
    })
  })

  context('when the zip code is in no county', () => {
    beforeEach(() => { typed = '99 Nowhere Ln 90210' })

    it('says the address is invalid', () => {
      expect(result()).toBe('Invalid address')
    })

    it('never asks for a file', () => {
      expect(fetchFile.mock.calls.map(([url]) => url)).toEqual(['counties/index.json'])
    })
  })

  context('when the zip code is missing', () => {
    beforeEach(() => { typed = '2501 Bambi Ln' })

    it('leaves Apply enabled to try again', () => {
      expect(applyButton().disabled).toBe(false)
    })
  })

  context('when the street ranges fail to load', () => {
    beforeEach(() => { fetchFile.mockRejectedValue(new Error('offline')) })

    it('asks to try again', () => {
      expect(result()).toBe("Sorry, the street ranges couldn't be loaded. Please try again.")
    })

    it('leaves Apply enabled to try again', () => {
      expect(applyButton().disabled).toBe(false)
    })
  })

  context('when the precinct has a map', () => {
    it('shows it', () => {
      expect(map().hidden).toBe(false)
    })

    it('outlines the precinct from the file', () => {
      expect(drawn.outlines.at(-1)).toEqual(shape('7904'))
    })

    it('fades everything outside it', () => {
      const [world, ...rings] = (drawn.outlines[0] as ReturnType<typeof shape>).geometry.coordinates
      expect(world).toContainEqual([180, 85])
      expect(rings).toEqual(shape('7904').geometry.coordinates)
    })

    it('fits the map to it', () => {
      expect(drawn.fitted).toBe(1)
    })

    it('offers to print it', () => {
      expect(document.querySelector<HTMLAnchorElement>('#print')!.hidden).toBe(false)
    })

    context('when the visitor prints it', () => {
      let printed: ReturnType<typeof vi.fn>

      beforeEach(() => {
        printed = vi.fn()
        window.print = printed as typeof window.print
      })

      justBeforeEach(async () => {
        document.querySelector<HTMLAnchorElement>('#print')!.click()
        await settled()
      })

      it('sizes the map to the page, refits it and prints', () => {
        expect(document.documentElement.classList.contains('printing')).toBe(true)
        expect(drawn.fitted).toBe(2)
        expect(printed).toHaveBeenCalled()
      })

      context('while tiles are still loading', () => {
        beforeEach(() => { drawn.loading = true })

        it('prints once they load', () => {
          expect(printed).toHaveBeenCalled()
        })
      })

      context('and the print dialog closes', () => {
        justBeforeEach(() => { window.dispatchEvent(new Event('afterprint')) })

        it('puts the map back', () => {
          expect(document.documentElement.classList.contains('printing')).toBe(false)
          expect(drawn.fitted).toBe(3)
        })
      })
    })

    context('when the page is printed from the browser menu', () => {
      justBeforeEach(() => { window.dispatchEvent(new Event('afterprint')) })

      it('leaves the map alone', () => {
        expect(drawn.fitted).toBe(1)
      })
    })

    it('names it for screen readers', () => {
      expect(map().ariaLabel).toBe('Map of precinct 7904')
    })

    context('when the visitor looks up another precinct', () => {
      justBeforeEach(async () => {
        retype('43-A101')
        document.querySelector('form')!.requestSubmit()
        await settled()
      })

      it('keeps the one map', () => {
        expect(drawn.maps).toBe(1)
      })

      it('swaps the outline and every layer around it', () => {
        expect(drawn.removed).toBe(4)
        expect(drawn.outlines.at(-1)).toEqual(shape('A101'))
      })
    })

    it('offers a link to the precinct, without the address', () => {
      expect(copy().getAttribute('href')).toBe('/#43-7904')
    })

    it('shows the link', () => {
      expect(copy().hidden).toBe(false)
    })

    it('keeps the address out of the URL', () => {
      expect(location.hash).toBe('')
    })
  })

  context('when the visitor resets after a map', () => {
    justBeforeEach(() => { resetButton().click() })

    it('hides the map', () => {
      expect(map().hidden).toBe(true)
    })

    it('hides the link', () => {
      expect(copy().hidden).toBe(true)
    })
  })

  context('when the visitor copies the link', () => {
    let writeText: ReturnType<typeof vi.fn>

    beforeEach(() => {
      writeText = vi.fn(async () => {})
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    })

    justBeforeEach(async () => {
      copy().click()
      await settled()
    })

    it('copies the whole URL', () => {
      expect(writeText).toHaveBeenCalledWith(`${location.origin}/#43-7904`)
    })

    it('says so', () => {
      expect(copy().textContent).toBe('Copied')
    })

    context('when the browser refuses', () => {
      beforeEach(() => { writeText.mockRejectedValue(new Error('denied')) })

      it('suggests copying by hand', () => {
        expect(copy().textContent).toBe('Press and hold to copy')
      })
    })
  })

  context('when the precinct has no map', () => {
    beforeEach(() => { fetchFile.mockImplementation(async (url: string) => reply(url.includes('/shapes/') ? null : url.endsWith('index.json') ? indexOf(['43/95116']) : SAN_JOSE)) })

    it('still shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })

    it('shows no map', () => {
      expect(map().hidden).toBe(true)
    })

    it('offers no link', () => {
      expect(copy().hidden).toBe(true)
    })
  })

  context('when the map fails to load', () => {
    beforeEach(() => {
      fetchFile.mockImplementation(async (url: string) => {
        if (url.includes('/shapes/')) throw new Error('offline')
        return reply(url.endsWith('index.json') ? indexOf(['43/95116']) : SAN_JOSE)
      })
    })

    it('still shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })

    it('shows no map', () => {
      expect(map().hidden).toBe(true)
    })
  })

  context('when the visitor resets before the answer arrives', () => {
    beforeEach(() => {
      const button = resetButton()
      fetchFile.mockImplementation(async (url: string) => {
        button.click()
        return reply(url.endsWith('index.json') ? indexOf(['43/95116']) : SAN_JOSE)
      })
    })

    it('shows nothing', () => {
      expect(result()).toBe('')
    })
  })

  context('when the visitor resets before the map arrives', () => {
    beforeEach(() => {
      const button = resetButton()
      fetchFile.mockImplementation(async (url: string) => {
        if (url.includes('/shapes/')) button.click()
        return reply(url.includes('/shapes/') ? SHAPES : url.endsWith('index.json') ? indexOf(['43/95116']) : SAN_JOSE)
      })
    })

    it('shows no map', () => {
      expect(map().hidden).toBe(true)
    })
  })

  context('when the page opens with a link', () => {
    beforeEach(() => {
      typed = ''
      history.replaceState(null, '', '/#43-7904')
    })

    it('fills in the box', () => {
      expect(box().value).toBe('43-7904')
    })

    it('shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })

    it('shows the map', () => {
      expect(map().hidden).toBe(false)
    })

    it('disables Apply', () => {
      expect(applyButton().disabled).toBe(true)
    })

    it('offers a reset', () => {
      expect(resetButton().hidden).toBe(false)
    })

    it('never asks for the street ranges', () => {
      expect(fetchFile.mock.calls.map(([url]) => url)).toEqual(['counties/index.json', 'counties/43/shapes/index.json', 'counties/43/shapes/95116.json'])
    })

    context('when the visitor resets', () => {
      justBeforeEach(() => { resetButton().click() })

      it('clears the URL', () => {
        expect(location.hash).toBe('')
      })
    })

    context('when the visitor types something else', () => {
      justBeforeEach(() => { retype('2501 Bambi') })

      it('clears the URL', () => {
        expect(location.hash).toBe('')
      })
    })

    context('when the visitor retypes the same link', () => {
      justBeforeEach(() => { retype('43-7904') })

      it('keeps the URL', () => {
        expect(location.hash).toBe('#43-7904')
      })
    })
  })

  context('when the link has leading zeros', () => {
    beforeEach(() => {
      typed = ''
      history.replaceState(null, '', '/#43-0007904')
    })

    it('shortens the box', () => {
      expect(box().value).toBe('43-7904')
    })

    it('shortens the URL', () => {
      expect(location.hash).toBe('#43-7904')
    })
  })

  context('when the URL has something else after the hash', () => {
    beforeEach(() => {
      typed = ''
      history.replaceState(null, '', '/#foo')
    })

    it('ignores it', () => {
      expect(result()).toBe('')
    })
  })

  context('when a link is pasted into an open page', () => {
    beforeEach(() => { typed = '' })

    justBeforeEach(async () => {
      location.hash = '#43-7904'
      await settled()
      await settled()
    })

    it('shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })
  })

  context('when the visitor types a link', () => {
    beforeEach(() => { typed = '43-7904' })

    it('shows the precinct', () => {
      expect(result()).toBe('7904: Santa Clara County')
    })

    it('puts it in the URL', () => {
      expect(location.hash).toBe('#43-7904')
    })
  })

  context('when the visitor types a link with letters', () => {
    beforeEach(() => { typed = '43-a101' })

    it('shows the precinct', () => {
      expect(result()).toBe('A101: Santa Clara County')
    })

    it('puts it in the URL', () => {
      expect(location.hash).toBe('#43-A101')
    })
  })

  context('when the visitor types a link with no map', () => {
    beforeEach(() => { typed = '41-99999' })

    it('says so', () => {
      expect(result()).toBe("Sorry, there's no map for 41-99999.")
    })

    it('leaves Apply enabled to try again', () => {
      expect(applyButton().disabled).toBe(false)
    })

    it('keeps it out of the URL', () => {
      expect(location.hash).toBe('')
    })
  })

  context('when an address follows a link', () => {
    beforeEach(() => {
      typed = '2501 Bambi Ln 95116'
      history.replaceState(null, '', '/#43-7904')
    })

    it('clears the URL', () => {
      expect(location.hash).toBe('')
    })
  })
})

describe('lookupLink', () => {
  const source: Source = {
    index: async () => indexOf(['43/95116']),
    file: async () => ({}),
    mapIndex: async (county) => (county === '43' ? { 7904: '95116' } : {}) as Record<string, string>,
    maps: async () => SHAPES
  }

  it('finds a precinct with a map', async () => {
    expect(await lookupLink('43', '7904', source)).toEqual({
      text: '7904: Santa Clara County',
      found: { county: '43', number: '7904', zip: '95116' }
    })
  })

  it('says so for an unknown number', async () => {
    expect((await lookupLink('43', '1', source)).text).toBe("Sorry, there's no map for 43-1.")
  })

  it('says so for an unknown county', async () => {
    expect((await lookupLink('99', '1', source)).text).toBe("Sorry, there's no map for 99-1.")
  })
})
