# Sources and verification

How the ranges are built, how they could get better, and how to tell.

## Sources

| Source | Gives | As of | San Mateo | Santa Clara | Change signal |
| --- | --- | --- | --- | --- | --- |
| Precinct shapes | Which precinct a place is in | Oct 2026, Aug 2026 | GIS layer | PDF per precinct, no coordinates | Listing dates; `Last-Modified` |
| County address points | Real house numbers and where they are | Unknown; June 2020 | 236,649 | About 504,000 | None seen |
| Census TIGER 2025 | Possible numbers on each side of a street | 2025 | Yes | Yes | New each year |
| UC Berkeley Statewide Database | Voters by precinct and block | June 2026 | Yes | Yes | After each election |
| County-published ranges | The real answer | Not yet | | | |

## Methods, best first

San Mateo, looked up against 16,319 known ranges (31,092 tests):

| Method | Right | Wrong | No answer | Right when it answers |
| --- | --- | --- | --- | --- |
| Address points on the map, alone | 85.3% | 54 | 4,507 | 99.80% |
| Address points, then TIGER + map + block rule (`out/41` today) | 96.4% | 160 | 952 | 99.47% |
| TIGER + map + block rule | 90.8% | 358 | 2,502 | 98.75% |
| Block rule alone | 72.8% | 182 | 8,276 | 99.20% |

Santa Clara's PDFs have no coordinates, but they do print house numbers. Reading
those and matching them to the county's address points lines a map up, and then
each point is on the precinct's yellow area or not. Seven trial maps agreed with
the block rule on 99.6% of 5,300 points; rural maps are weakest. Not built yet.

## How to verify

1. **Known ranges.** `bin/check.py` measures a method against any file of known
   ranges. Only counts come out, and nothing from that file enters `out/`.
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
