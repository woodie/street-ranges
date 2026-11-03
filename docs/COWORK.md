# street-ranges - working notes

Street ranges from public data, for anyone building an address-to-precinct
lookup. This repo is public, so these notes stay on what the repo does today.
`README.md` has the format and how to run it; `docs/SOURCES.md` has the sources
and how to verify the ranges.

## Where things stand (2026-11-02)

| County | Number | Built from | Files |
| --- | --- | --- | --- |
| San Francisco | 38 | The county's Street Data Extract | 27 zipcodes, 10,882 ranges |
| San Mateo | 41 | County shapes and address points, then TIGER | 30 zipcodes, 22,005 ranges |
| Santa Clara | 43 | County shapefile and address points, then TIGER | 63 zipcodes, 57,982 ranges |

The lookup page is live at https://woodie.github.io/street-ranges/. Next:

- Trim TIGER ranges that run past a street's real addresses (`OAK CT` to 1998).
- Clean up street names holding unit ranges (`CURTIS ST 100-201`) and check bare ones
  (`S CT`, `N DR`), using the checklist below. `W O CONNOR ST` and `W OCONNOR ST` are
  one street. 94101 is listed for San Francisco but has no usable addresses.
- Mark which ranges rest on real addresses and which on TIGER alone.
- Report an address that sits far from the rest of its zipcode, and two different
  streets sharing a name in one zipcode.
- Work out each county's zipcode list from Census, reporting what address points add.

## What stays out

- Races and endorsements. Output is streets, house numbers and precincts only;
  whatever app uses the files adds its own races and can report mismatches then.
- Downloads. `sources/` is gitignored; `out/` is committed, so a rebuild shows
  up as a diff.
- Anything but public data.

## Sources by county

| County | Number | Precinct map | Address points |
| --- | --- | --- | --- |
| San Francisco | 38 | Not needed: the county's Street Data Extract gives each address's precinct | In the extract |
| San Mateo | 41 | County GIS layer (`counties.json`) | County GIS layer |
| Santa Clara | 43 | County shapefile, free by request (`bin/county_shapes.py`) | County GIS layer, from June 2020 |

To add a map, put its query URL and precinct field in `counties.json`, or get
its shapes into `sources/<county>/precinct_map.json` some other way, in TIGER's
coordinates.

## How a side gets its precinct

`bin/build.py`, with `bin/precinct_map.py`:

First, real addresses: each county address point placed on the map, with runs on
one side of a street in one precinct becoming ranges. An address in two precincts
stays out. Census ranges are then clipped around those. For what's left:

1. Five points along the side, 15 meters off the centerline, are placed on the
   map. If they all land in one precinct, the side gets it.
2. Otherwise, the block rule: the precinct with 90% of the block's voters.
3. Otherwise, no range, and an app falls back to the zipcode.

Tried on San Mateo (2026-11-01), each end of 16,319 known ranges, 31,092 tests:

| Method | Ranges | Right | Wrong | Right when it answers |
| --- | --- | --- | --- | --- |
| Block rule only | 15,437 | 72.8% | 182 | 99.2% |
| Map, whole sides only | 19,329 | 89.2% | 314 | 98.9% |
| Map, then block rule | 19,503 | 90.6% | 358 | 98.7% |
| Map, splitting mixed sides by house number | 21,098 | 92.5% | 735 | 97.5% |

With address points first (used), `bin/check.py KNOWN.json 41 --prefix` gives
96.4% right and 160 wrong. Earlier rows are from the same check before address
points. Offsets of 10 and 25 meters did no better than 15.

Merging stops at a gap of 100 numbers, so an odd segment stays visible: one
street numbered up to 500 keeps a separate 1900-1998. Limits from 4 to 1,000 barely moved the
results; touching numbers only (2) lost right answers.

## Finding bogus ranges (not built yet)

Census ranges are possible numbers, and some are simply off. The map can't catch
those, since it knows where a street is, not which numbers exist. Flags tried on
San Mateo, measured by whether any county address point falls in the side
(17% of all sides have none, so no point isn't proof):

| Flag | Sides | No address point |
| --- | --- | --- |
| Map and block rule disagree | 238 | 60% |
| Gap of 1,000+ to the next segment | 353 | 52% |
| Both sides of a segment have the same parity | 197 | 42% |

The gap flag catches that 1900-1998. Dropping every side with no address
point cost more right answers than it saved wrong ones, so flag, don't filter.

## Known oddities

- TIGER gives some sides a zipcode outside the county or a typo (93133 for 95133).
  `counties.json` lists each county's zipcodes, and the build reports the rest.
- 38 precincts in `out/41` have no voters in the June 2026 file: the map answers
  where the block rule couldn't. An app needs races for them, or falls back.
- Precinct lines are as of each source. The Statewide Database (SWDB) publishes after
  each election. San Mateo's layer has no date of its own, but the county's
  Precinct Lookup uses it and labels it current as of October 2026.

## Cleaning up addresses safely

Address cleanup can fail two ways: it removes part of a real name, or it leaves a
unit in one. Both have happened:

| Fix | Mistake | Size | Known ranges |
| --- | --- | --- | --- |
| Keep N, S, E and W | A lone letter was treated as a unit, so "2100 N 1ST ST" became "1ST ST" | About 51,000 address records | Right 96.4% to 96.6%, wrong 160 to 140 |
| Spell street types one way | "Clarion Alley" missed `CLARION ALY`, and `NEXUS LP` was a second name for `NEXUS LOOP` | Six words, last word only; 12 names merged or renamed | No change |
| Strip a bare unit | "190 E Okeefe St 4" became a street named "E OKEEFE ST 4" | 904 names, 875 fewer ranges | No change |

Before changing a cleanup rule:

1. **Search all of `out/` for the pattern**, not just the example, and count the hits.
2. **Look for proof the rule is right.** 903 of the 904 unit names also had the plain
   street listed in the same zipcode.
3. **List what must not change, and test it:** `AVE A`, `LN 13 E`, `STATE RTE 17`,
   `HWY 9` and `RED OAK DR E` all stay as they are.
4. **Run the rule over TIGER's street names.** A rule meant for address lists
   shouldn't change any.
5. **Rebuild every county and compare.** `bin/check.py` shows whether right and wrong
   moved, and the diff in `out/` shows which zipcodes changed.
6. **Expect the size of the change to match the mistake.** A cleanup that changes
   more than it should is a bug.

Keep a rule narrow. A rule that needs a street type before the unit can't touch
`AVE A`, while one that strips any last word would.

## Reading a street extract

`extract_rows` in `bin/build.py` reads only the street, house number, zipcode and
precinct. The file has other per-address columns that must never reach `out/` or
this repo, so don't add fields without checking. `sources/` stays out of git.

## Lookup page

`public/` is the page at https://woodie.github.io/street-ranges/, with `public/main.js`
built from `src/main.ts` and committed. It copies the guide's address matching, exact
ranges only, and reads `ranges/index.json` for the counties and their zipcodes, then fetches
`ranges/<county>/<zip>.json` from each county listing that zipcode. County names live
there, not in the code. The deploy
copies `out/` to `ranges/`, and those public URLs should stay put. Keep it to one
input and one answer. Races stay out. `make check` lints, type-checks, runs the specs
at 100% coverage and confirms `main.js` is current.

## Commits and pushes

Woodie pushes, or says yes first. Keep comments to one line.

## Showing pages

Open local pages in Woodie's regular Chrome: `open -a "Google Chrome" URL`.
Never use Claude's embedded browser, for showing or testing: it stays hidden and
asks a long run of questions. Test with curl or scripts instead.
