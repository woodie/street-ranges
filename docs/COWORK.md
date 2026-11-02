# street-ranges - working notes

Street ranges from public data, for anyone building an address-to-precinct
lookup. This repo is public, so these notes stay on what the repo does today.
`README.md` has the format and how to run it; `docs/SOURCES.md` has the sources
and how to verify the ranges.

## What stays out

- Races and endorsements. Output is streets, house numbers and precincts only;
  whatever app uses the files adds its own races and can report mismatches then.
- Downloads. `sources/` is gitignored; `out/` is committed, so a rebuild shows
  up as a diff.
- Anything but public data.

## Sources by county

| County | Number | Precinct map |
| --- | --- | --- |
| San Mateo | 41 | County GIS layer (`counties.json`) |
| Santa Clara | 43 | None yet: the county's maps are PDFs |

To add a map, put its query URL and precinct field in `counties.json`, or get
its shapes into `sources/<county>/precinct_map.json` some other way, in TIGER's
coordinates.

## How a side gets its precinct

`bin/build.py`, with `bin/precinct_map.py`:

1. Five points along the side, 15 meters off the centerline, are placed on the
   map. If they all land in one precinct, the side gets it.
2. Otherwise, the block rule: the precinct with 90% of the block's voters.
3. Otherwise, no range, and an app falls back to the zipcode.

Tried on San Mateo (2026-11-01), each end of 16,319 known ranges, 31,092 tests:

| Method | Ranges | Right | Wrong | Right when it answers |
| --- | --- | --- | --- | --- |
| Block rule only | 15,437 | 72.8% | 182 | 99.2% |
| Map, whole sides only | 19,329 | 89.2% | 314 | 98.9% |
| Map, then block rule (used) | 19,503 | 90.6% | 358 | 98.7% |
| Map, splitting mixed sides by house number | 21,098 | 92.5% | 735 | 97.5% |

The same numbers come from `bin/check.py KNOWN.json 41`, given a file of known
ranges. Offsets of 10 and 25 meters did no better than 15.

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

- `out/` lists every zipcode Census gives a side, so a few files hold only a
  stray block or two (94128, 95006, 94134).
- 38 precincts in `out/41` have no voters in the June 2026 file: the map answers
  where the block rule couldn't. An app needs races for them, or falls back.
- Precinct lines are as of each source. The Statewide Database publishes after
  each election. San Mateo's layer has no date of its own, but the county's
  Precinct Lookup uses it and labels it current as of October 2026.

## Commits and pushes

Woodie pushes, or says yes first. Keep comments to one line.
