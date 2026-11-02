# street-ranges

Street ranges turn a street address into a precinct, right in the browser,
so the address never leaves the voter's device. This repo builds them from
public data only.

A range is a run of house numbers on one side of a street, all in one precinct:

    {"W BAYSHORE RD": [[1200, 1498, "4140011"], [1201, 1499, "4140011"]]}

## Output

`out/<county>/<zip>.json`, one file per zipcode. The folder is California's
county number, which also starts each precinct number: 41 is San Mateo
County, 43 is Santa Clara County. A zipcode that crosses a county line has a
file in each county. Which races a precinct votes in is left to whatever app
uses these files.

## Sources

| Source | What it gives |
| --- | --- |
| [Census TIGER 2025](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) `ADDRFEAT` | Address range on each side of each street segment, and the face it borders |
| Census TIGER 2025 `FACES` | Each face's Census block and ZCTA |
| [Statewide Database (SWDB)](https://statewidedatabase.org/) `c<county>_p26_rg_blk_map.csv` | Registered voter counts by precinct and Census block, June 2026 primary |
| County precinct map, where `counties.json` lists one | Each precinct's shape |
| County address points, where `counties.json` lists them | Real addresses and where they are |

## How they're built

- Real addresses come first: each address point placed on the county's map, with
  runs of house numbers in one precinct on one side of a street becoming ranges.
- The rest of a street comes from Census, around those ranges. A side whose whole
  length falls in one precinct on the county's map gets that precinct.
- Otherwise it gets its block's precinct: the one with at least 90% of the block's voters.
- A side with neither gets no range.
- Neighboring ranges on one side with the same precinct merge, when their numbers
  are within 100 of each other.

## Running

    bin/download.py    # into sources/ (gitignored)
    bin/build.py       # into out/

`bin/check.py` compares the ranges with any file of known ranges.

## Corrections

The county's precinct map settles any disagreement. `corrections/<county>.csv`
holds what a person read off a map: the numbers, the precinct, and the map and
its date. `bin/corrections.py` applies them last, so a rebuild keeps them, and
warns when a map has changed since it was checked.

`bin/review.py` builds a local page of what needs checking, linked to local
copies of the maps. `bin/map_dates.py` compares those copies with the county's.

Python 3, standard library only.

## Next

A precinct map for Santa Clara County.
