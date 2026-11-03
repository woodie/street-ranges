# Precinct from street ranges

Street ranges built from public data turn a street address into a precinct. The lookup runs in the
browser from static files, so it needs no API call and the address never leaves the device. A
[sample app](https://woodie.github.io/street-ranges/) on GitHub Pages covers San Francisco, San Mateo
and Santa Clara Counties and renders a map of each precinct.

<p>
  <img src="docs/38-7532.png" alt="San Francisco" width="32%">
  <img src="docs/41-46126.png" alt="San Mateo" width="32%">
  <img src="docs/43-7417.png" alt="Santa Clara" width="32%">
</p>

A range is a run of house numbers on one side of a street, all in one precinct:

    {"W BAYSHORE RD": [[1200, 1498, "4140011"], [1201, 1499, "4140011"]]}

## Output

Everything in `out/` is published under `https://woodie.github.io/street-ranges/counties/`.

| File | What it holds |
| --- | --- |
| `index.json` | Each county's name and zipcodes |
| `<county>/<zip>.json` | The ranges for one zipcode |
| `maps/<county>/<zip>.json` | An SVG map of each precinct in that zipcode, as `{"44007": "<svg ...>"}` |
| `maps/<county>/index.json` | A zipcode for each precinct |

The county is California's county number, which also starts each precinct number: 38 is
San Francisco, 41 is San Mateo, 43 is Santa Clara. A zipcode that crosses a county line has a
file in each county. Which races a precinct votes in is left to whatever app uses these files.

## Sources

| Source | What it gives |
| --- | --- |
| [Census TIGER 2025](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) `ADDRFEAT` | Address range on each side of each street segment, and the face it borders |
| Census TIGER 2025 `FACES` | Each face's Census block and ZCTA |
| [Statewide Database (SWDB)](https://statewidedatabase.org/) `c<county>_p26_rg_blk_map.csv` | Registered voter counts by precinct and Census block, June 2026 primary |
| County precinct shapes, where `counties.json` lists them | Each precinct's shape |
| County address points, where `counties.json` lists them | Real addresses and where they are |
| County street extract, where `counties.json` lists one | Each address's precinct, from the county's elections office |

## How they're built

- Where a county publishes its street extract, the ranges come straight from it.
- Otherwise real addresses come first: each address point placed on the county's map, with
  runs of house numbers in one precinct on one side of a street becoming ranges.
- The rest of a street comes from Census, around those ranges. A side whose whole
  length falls in one precinct on the county's map gets that precinct.
- Otherwise it gets its block's precinct: the one with at least 90% of the block's voters.
- A side with neither gets no range.
- Neighboring ranges on one side with the same precinct merge, when their numbers
  are within 100 of each other.

## Running

    bin/download.py    # into sources/, which is gitignored
    bin/build.py       # into out/, with corrections applied
    bin/maps.py        # into out/maps/, after the build

Python 3, standard library only. `bin/check.py` compares the ranges with any file of known ranges.

Santa Clara's precinct shapes come free by request from the Registrar of Voters, using Option 2 on
[its form](https://vote.santaclaracounty.gov/precinct-data-and-gis-maps). Convert the shapefile before building:

    bin/county_shapes.py 43 sources/43/county_shapes/Precinct_Boundaries

San Francisco publishes [its datasets](https://sfelections.org/tools/election_data/datasets.php), including
its address table as the Street Data Extract and a precinct shapefile used only for the maps.
Its site blocks scripts, so save both in `sources/38/`. The build reads only the street,
house number, zipcode and precinct. Convert the shapefile the same way:

    bin/county_shapes.py 38 sources/38/doe/SF_DOE_PREC_2025_12_10_pg/SF_DOE_PREC_2025_12_10_pg

## Corrections

The county's precinct map settles any disagreement. `corrections/<county>.csv`
holds what a person read off a map: the numbers, the precinct, and the map and
its date. `bin/corrections.py` applies them last, so a rebuild keeps them, and
warns when a map has changed since it was checked.

`bin/review.py` builds a local page of what needs checking, linked to local
copies of the maps. `bin/map_dates.py` compares those copies with the county's.

## Publishing

The sample app is `public/`, with `public/main.js` built from `src/`. Pushing changes to `public/`
or `out/` deploys it to GitHub Pages, using `.github/workflows/pages.yml`.
