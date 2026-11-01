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
| [UC Berkeley's Statewide Database](https://statewidedatabase.org/) `c<county>_p26_rg_blk_map.csv` | Registered voter counts by precinct and Census block, June 2026 primary |

## How they're built

- A block's precinct is the one with at least 90% of its voters.
- A side gets no range when its block has no voters or no precinct reaches 90%.
- Next-door segments on one side with the same precinct merge, when their
  numbers are within 100 of each other.

## Running

    bin/download.py    # into sources/ (gitignored)
    bin/build.py       # into out/

`bin/check.py` compares the ranges with any file of known ranges.

Python 3, standard library only.

## Next

County precinct maps, to answer addresses where a precinct line splits a block.
