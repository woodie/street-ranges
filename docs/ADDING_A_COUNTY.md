# Adding a county

What a new county needs, in the order to do it. `README.md` has the output format and
`docs/SOURCES.md` has how to verify the ranges.

## 1. Find the county's sources

Look for each of these, best first. Every one must be public.

| Need | Best | Next best | Last resort |
| --- | --- | --- | --- |
| Each address's precinct | The elections office's street extract, as San Francisco publishes | | |
| Precinct shapes | The elections office's GIS layer or shapefile, for the coming election | Statewide Database (SWDB) shapes from the last election | |
| Address points | The county's address point layer | Parcel addresses (one address per parcel) | None: TIGER alone |

Most counties publish their GIS layers on ArcGIS, so search ArcGIS for the county's
name with "precinct" and "address". Check each layer's description, edit date and count of
features, and take only the fields the build reads. A layer that needs a token or
holds voter counts is out.

TIGER and SWDB's block file come for every county, so `bin/download.py` fetches them
without being told.

## 2. Add it to `counties.json`

The key is California's county number, two digits, which also starts each precinct
number: 01 is Alameda, 07 Contra Costa. `fips` is the three-digit federal county code
TIGER and SWDB use: 001, 013.

    "07": {
      "name": "Contra Costa County",
      "fips": "013",
      "precinct_map": {"url": ".../FeatureServer/0/query", "field": "sPrecinctID"},
      "address_points": {"url": ".../FeatureServer/0/query", "address": "ADDRESS", "zip": "ZIPCODE"},
      "zipcodes": [...]
    }

- `precinct_map` gives a layer's query URL and precinct field. A shapefile has no URL:
  add its precinct column to `SHAPEFILES` in `bin/county_shapes.py` and convert it.
- `address_points.address` is one field, or a list starting with the house number.
  The build reads a point for each address, so parcel shapes need a point each before they work.
- `street_extract` replaces both, as for San Francisco.

## 3. Make the precinct numbers agree

The block rule takes precinct numbers from SWDB's `rgprec` and the map takes them from the
county's field, and both end up in the same ranges. Compare a few from each before building.
Alameda's layer writes `200100` where SWDB writes `20010000`, the county's precinct and a
two-digit portion, so `"rgprec_digits": 6` in `counties.json` keeps SWDB's first six.

Precinct numbers with letters, like `RICH101`, need two changes first:

- `LINK` in `src/main.ts` takes digits only, so links like `#07-RICH101` fail.
- `bin/maps.py` and the page drop leading zeros, which is only safe for numbers.

## 4. List its zipcodes

Start from the zipcodes in the county's address points, and add TIGER's where real
addresses back them. A zipcode that crosses a county line goes in each county's list.
The build reports any zipcode it leaves out, which is how TIGER's typos show up.

## 5. Build

    bin/download.py 07
    bin/build.py 07
    bin/maps.py 07

The build prints how each street side got its precinct. A county with many sides on the
block rule, or many with none, needs a closer look at its map.

## 6. Check

1. **Two maps.** Place the address points on both the county's shapes and SWDB's last
   shapes, and count where they agree. San Mateo agreed on 99.90%. A low number means
   the precincts changed or the layer is out of date, so find out which before going on.
2. **Flags.** Read the sides flagged in `docs/SOURCES.md`: map and block rule disagree,
   a gap of 1,000+, the same parity on both sides.
3. **Spot checks.** Look up a dozen addresses on the county's own precinct lookup,
   across cities and rural areas.
4. **Known ranges.** If any exist, `bin/check.py KNOWN.json 07 --prefix`.
5. **The page.** `make check`, then look up an address and a link.

## 7. Publish

Add the county to the tables in `README.md`, `docs/SOURCES.md` and `docs/COWORK.md`, and
a screenshot of one of its maps to `docs/`. Pushing `counties/` deploys it.

## When SWDB catches up

SWDB publishes each election's shapes a few months after it, and the block file can take
longer. Until then, the county's layer is the only source for new precinct lines.

| Election | Shapes | Block file |
| --- | --- | --- |
| November 2022 | February 2023 | October 2023 |
| November 2024 | April to May 2025 | April to November 2025 |
| June 2026 | September 2026 | September 2026 |
