// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { lookup, normalizeStreet, parseAddress, start } from '../../src/main.ts'
import type { Address, Load, Streets } from '../../src/main.ts'

const MENLO_PARK: Streets = {
  'OCONNOR ST': [[1, 233, '4144007'], [2, 498, '4144007'], [235, 483, '4144031'], [485, 499, '4144043']],
  'E OKEEFE ST': [[2, 200, '4144007']],
  'WOODLAND AVE': [[301, 899, '4144009'], [500, 898, '4144009']],
  'CAMPO BELLO': [[2, 10, '4134009']],
  'CAMPO BELLO CT': [[1, 99, '4134009'], [2, 98, '4134009']]
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

const filesFor = (files: Record<string, Streets>): Load => async (county, zip) => files[`${county}/${zip}`] ?? null
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
  let answer: string

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

  justBeforeEach(async () => { answer = await lookup(text, filesFor(files)) })

  context('with a San Mateo address', () => {
    beforeEach(() => { text = "238 O'Connor Street, Menlo Park, CA 94025" })

    it('gives the short precinct and county', () => {
      expect(answer).toBe('Precinct 44007, San Mateo County')
    })
  })

  context('with a San Francisco address', () => {
    beforeEach(() => { text = '977 Vallejo St, San Francisco, CA 94133' })

    it('gives the precinct and county', () => {
      expect(answer).toBe('Precinct 7309, San Francisco County')
    })
  })

  context('with a Santa Clara address', () => {
    beforeEach(() => { text = '2501 Bambi Ln, San Jose 95116' })

    it('drops the zeros from the precinct', () => {
      expect(answer).toBe('Precinct 7904, Santa Clara County')
    })
  })

  context('when the precinct changes partway along a side', () => {
    beforeEach(() => { text = '359 Oconnor St 94025' })

    it('uses the range holding that number', () => {
      expect(answer).toBe('Precinct 44031, San Mateo County')
    })
  })

  context('when the number is only in a range on the other side', () => {
    beforeEach(() => { text = '101 E Okeefe St 94025' })

    it('finds no range', () => {
      expect(answer).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the number is past every range', () => {
    beforeEach(() => { text = '202 E Okeefe St 94025' })

    it('finds no range', () => {
      expect(answer).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the street is not listed', () => {
    beforeEach(() => { text = '100 Nowhere Ln 94025' })

    it('finds no range', () => {
      expect(answer).toBe("Sorry, that address isn't in the street ranges.")
    })
  })

  context('when the zip code crosses the county line', () => {
    context('and only San Mateo has the number', () => {
      beforeEach(() => { text = '104 Newell Rd 94303' })

      it('answers from San Mateo', () => {
        expect(answer).toBe('Precinct 40010, San Mateo County')
      })
    })

    context('and only Santa Clara has the number', () => {
      beforeEach(() => { text = '1158 Newell Rd 94303' })

      it('answers from Santa Clara', () => {
        expect(answer).toBe('Precinct 2075, Santa Clara County')
      })
    })

    context('and both counties have the number', () => {
      beforeEach(() => { text = '2526 W Bayshore Rd 94303' })

      it('asks for more detail', () => {
        expect(answer).toBe("There's more than one match. Please add St, Ave, etc.")
      })
    })
  })

  context('when the typed street is missing its direction', () => {
    context('and one street fits', () => {
      beforeEach(() => {
        files['41/94015'] = { 'N LYCETT ST': DALY_CITY['N LYCETT ST'] }
        text = '151 Lycett St 94015'
      })

      it('uses that street', () => {
        expect(answer).toBe('Precinct 56060, San Mateo County')
      })
    })

    context('and two streets fit', () => {
      beforeEach(() => { text = '151 Lycett St 94015' })

      it('asks for more detail', () => {
        expect(answer).toBe("There's more than one match. Please add St, Ave, etc.")
      })
    })
  })

  context('when a city follows the street without a comma', () => {
    beforeEach(() => { text = '53 Campo Bello Ct Menlo Park 94025' })

    it('uses the longest street that fits', () => {
      expect(answer).toBe('Precinct 34009, San Mateo County')
    })
  })

  context('when the typed street is missing its type', () => {
    beforeEach(() => { text = '703 Woodland 94025' })

    it('finds the street', () => {
      expect(answer).toBe('Precinct 44009, San Mateo County')
    })
  })

  context('without a zip code', () => {
    beforeEach(() => { text = '238 Oconnor St' })

    it('asks for one', () => {
      expect(answer).toBe('Please include the zip code.')
    })
  })

  context('without a house number', () => {
    beforeEach(() => { text = 'Oconnor St 94025' })

    it('asks for an address', () => {
      expect(answer).toBe('Please enter a street address, starting with the house number.')
    })
  })

  context('with a zip code in neither county', () => {
    beforeEach(() => { text = '99 Nowhere Ln 90210' })

    it('says so', () => {
      expect(answer).toBe("Sorry, 90210 isn't in San Francisco, San Mateo or Santa Clara County.")
    })
  })
})

describe('start', () => {
  let fetchFile: ReturnType<typeof vi.fn>
  let typed: string

  const reply = (body: Streets | null) => ({ ok: body !== null, json: async () => body })
  const result = () => document.getElementById('result')?.textContent

  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync('public/index.html', 'utf8')
    fetchFile = vi.fn(async (url: string) => reply(url === 'out/43/95116.json' ? SAN_JOSE : null))
    typed = '2501 Bambi Ln 95116'
  })

  justBeforeEach(async () => {
    start({ document, fetch: fetchFile as unknown as typeof fetch })
    document.querySelector('input')!.value = typed
    document.querySelector('form')!.requestSubmit()
    await settled()
  })

  context('when the street ranges load', () => {
    it('shows the precinct', () => {
      expect(result()).toBe('Precinct 7904, Santa Clara County')
    })

    it('asks for each county\'s file for that zip code', () => {
      expect(fetchFile.mock.calls.map(([url]) => url)).toEqual(['out/38/95116.json', 'out/41/95116.json', 'out/43/95116.json'])
    })

    it('never sends the street or house number', () => {
      expect(JSON.stringify(fetchFile.mock.calls)).not.toMatch(/BAMBI|2501/i)
    })
  })

  context('when the street ranges fail to load', () => {
    beforeEach(() => { fetchFile.mockRejectedValue(new Error('offline')) })

    it('asks to try again', () => {
      expect(result()).toBe("Sorry, the street ranges couldn't be loaded. Please try again.")
    })
  })
})
