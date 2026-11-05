# Sources and verification

How the ranges are built, how they could get better, and how to tell.

## Sources

| Source | Gives | As of | San Mateo | Santa Clara | Change signal |
| --- | --- | --- | --- | --- | --- |
| Precinct shapes | Which precinct a place is in | Oct 2026, Nov 2026 election | GIS layer | Shapefile, free by request | Listing dates; file date |
| SWDB precinct shapes | The last election's precincts, for any California county | June 2026 | Matches the county on 99.90% of addresses | 98.28% | After each election |
| County address points | Real house numbers and where they are | Unknown; June 2020 | 236,649 | About 504,000 | None seen |
| Census TIGER 2025 | Possible numbers on each side of a street | 2025 | Yes | Yes | New each year |
| Statewide Database (SWDB) | Voters by precinct and block | June 2026 | Yes | Yes | After each election |
| County-published ranges | The real answer | Not yet | | | |

## Methods, best first

San Mateo, looked up against 16,319 known ranges (31,092 tests):

| Method | Right | Wrong | No answer | Right when it answers |
| --- | --- | --- | --- | --- |
| Address points on the map, alone | 85.3% | 54 | 4,507 | 99.80% |
| Address points, then TIGER + map + block rule (`counties/41` today) | 96.6% | 140 | 927 | 99.5% |
| TIGER + map + block rule | 90.8% | 358 | 2,502 | 98.75% |
| Block rule alone | 72.8% | 182 | 8,276 | 99.20% |

Santa Clara uses the same method as San Mateo, since the county provided its shapes.
Alameda does too, from its Registrar of Voters' public layers; its shapes and SWDB's June
shapes agree on 99.75% of its 637,196 address points. Contra Costa uses its parcels' street
addresses as address points, one per parcel; its shapes and SWDB's agree on 99.21% of
parcels, and most of the rest are precincts it added after June.
Before that, ranges came from reading house numbers on its precinct PDFs, which have
no coordinates, to line each map up with the address points. Against the county's
shapes, the maps used matched on over 99.9% of addresses. The numbers in the table
above predate fixes that made small differences; see `docs/COWORK.md`.

San Francisco needs no method: its Street Data Extract (Oct 2026) gives each address's
precinct, and ranges are runs of those. The county's own precinct shapes match it on
99.996% of addresses and SWDB's June shapes on 99.98%, though the county may set
precincts from those shapes, so that isn't an independent test.

## How to verify

1. **Known ranges.** `bin/check.py` measures a method against any file of known
   ranges. Only counts come out, and nothing from that file enters `counties/`.
2. **Agreement between methods.** Where address points and TIGER agree, 24,751
   tests had 9 wrong. They disagree on 286 tests, about half of them wrong, which
   makes a short list to review, and the main check where nothing else is known.
3. **Flags.** Map and block rule disagree (238 sides, 60% with no address point);
   a gap of 1,000+ to the next segment (353, 52%); same parity on both sides of a
   segment (197, 42%). Flag, don't filter.
4. **What the voter sees.** Whether a wrong precinct changes the races is for the
   app that adds races to check.
5. **Spot checks.** County lookups, by hand.
6. **Refresh.** Rebuild when a source's change signal moves, and read the diff.

## The goal

The best source is the county itself: address points with a precinct, or ranges
by precinct, published when precincts are set.
