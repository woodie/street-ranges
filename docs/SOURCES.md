# Sources

What each county gives us, and what we do with it. Every county is built from the best it
publishes; where a piece is missing, two statewide sources stand in for it:

- **TIGER:** the Census Bureau's street map, updated every year. For each side of each street
  segment it gives the range of possible house numbers and the zipcode, but not which numbers
  are real homes, or any precinct.
- **The Statewide Database (SWDB):** California's redistricting database, run at UC Berkeley
  for the Legislature. After each election it publishes every county's precinct boundaries, and
  how many registered voters each precinct has in each Census block.

## Street ranges

- **Street data:** the most accurate source, each address with the precinct the county itself
  assigns it. Ranges are just runs of house numbers in one precinct, with nothing to guess.
  San Francisco, Monterey, San Benito, Inyo and El Dorado (by request) publish it.
- **Address points:** most counties publish each address with its location, but not its
  precinct. We place each point on the precinct map, then join neighbors on one side of a
  street into ranges, with TIGER filling the rest of each street. Most are live map
  layers, read at each build: Los Angeles, San Diego, Orange, Riverside, San Bernardino,
  Santa Clara, Alameda, Sacramento, Fresno, Ventura, San Mateo, Stanislaus, Sonoma, Tulare,
  Solano, Placer, Santa Barbara, Merced, San Luis Obispo, Santa Cruz, Marin, Yolo, Butte,
  Shasta, Madera, Kings, Sutter, Yuba, Tehama, Calaveras, Siskiyou, Amador, Mariposa, Trinity
  and Mono. Contra Costa and Plumas post a file, and Mendocino emailed one on request. Santa
  Clara's and Butte's points are from 2020 and Tehama's from 2021, so newer homes come from
  parcels or TIGER.
- **Parcels:** some smaller counties publish parcels with a site address, which already go a
  long way. The middle of each parcel stands in for the address, and is placed on the
  precinct map the same way. It's less exact: a parcel has one address however many homes it
  holds, and its middle can sit far from the door on a large lot. Only the site address is
  read, never an owner's mailing address. Imperial, Humboldt, Nevada, Lake, Tuolumne, Glenn,
  Del Norte, Colusa, Sierra and Alpine are built this way; a public address layer would make
  each of them as exact as the address-point counties.
- **TIGER and SWDB:** where a county hasn't published its addresses yet (Lassen and Modoc),
  ranges come from TIGER's address ranges, placed in precincts with SWDB's voters by Census
  block. That's about 97% right in a city, likely less in the country. Kern and San Joaquin
  use their own street centerlines in place of TIGER, which gets them closer. One public layer
  changes this: Inyo, a county of 18,000 people, publishes each address with its precinct, and
  its ranges are 99.9% right.

## Precinct shapes

- **Live layer or shapefile:** most counties publish their precinct boundaries. A live map
  layer, read at each build, in Los Angeles, San Diego, Riverside (June's lines), San
  Bernardino, Alameda, Sacramento, Contra Costa, Fresno, Kern, Ventura, San Joaquin, San
  Mateo, Sonoma, Solano, Merced, San Luis Obispo, Santa Cruz, Marin, Yolo, Butte, Shasta,
  Imperial, Madera, Napa, Nevada, Sutter, Mendocino, Calaveras, Amador, Glenn, Del Norte,
  Mariposa, Mono and Modoc. A shapefile in Orange, San Francisco, Monterey and Santa Barbara,
  and on request in Santa Clara, Placer, El Dorado and Sierra.
- **Table of addresses:** where a county's street data gives each address's precinct (San
  Francisco, Monterey, San Benito, Inyo and El Dorado), that decides the ranges, and the
  shapes only draw the map.
- **SWDB map:** for Stanislaus, Tulare, Kings, Humboldt, Yuba, Lake, Tehama, Tuolumne,
  Siskiyou, Lassen, Colusa, Plumas, Trinity and Alpine, SWDB's map stands in until the county
  publishes its own. SWDB builds its map after each election from what counties report, so it
  shows the last election's precincts, published months later (June 2026 now; November 2024
  for Lake and Tulare). A "what's my precinct" lookup is needed before an election, when
  counties have already redrawn or merged precincts for it: June's lines put 0.69% of Contra
  Costa's addresses and 2.1% of Solano's in the wrong precinct for November. One public layer
  of the county's own precincts for the coming election closes that gap.

## Checking the results

For each county we measure the share of its own addresses the ranges answer. San
Francisco's street data, ignored and then used as the answer key, measures the methods
themselves; `npm run civic` tries every county's elections office and the largest counties'
courthouses and jails; and [Public precinct data](PUBLIC_PRECINCT_DATA.md) explains why
counties publishing each address's precinct ahead of each election matters most.

## A lookup your county owns

Once a county keeps a current, public layer on whatever GIS system it already uses (its
precinct boundaries for the coming election, and its addresses, ideally with each one's
precinct, as Inyo publishes), the street ranges here stay as current as the county's own data.
The county can then publish its own tools on top of them, such as a lookup that shows each
address's districts, at no cost and without depending on us.
[Your own county lookup](COUNTY_LOOKUP.md) shows how to set one up on a free host, such as
GitHub Pages or the county's own website.
