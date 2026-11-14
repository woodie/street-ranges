# street-ranges - working notes

The public address-to-precinct demo at https://precinct.netpress.com/ and the data behind it:
street ranges and precinct outlines for all 58 California counties. This repo is public, so
these notes cover only what it does today: how `counties/` is filled and how the page is
published. `README.md` has the format; `docs/SOURCES.md` says what each county gives us.

## Where things stand (2026-11-13)

- All 58 counties are live, since 2026-11-13.
- The page is on GitHub Pages with the custom domain precinct.netpress.com (a CNAME at Network
  Solutions); woodie.github.io/street-ranges/ redirects there.
- Open: confirm Esri's terms allow its basemap tiles on a public page without an API key.

## Filling `counties/`

`counties/` is built outside this repo, by the same build that serves other applications of
the data, and copied here whole; build tools and downloads stay out of this repo. Committing
the copy shows each update as a diff.

- `counties/index.json`: each county's name and zipcodes, and its `source` when it isn't
  address points (`census` or `street`). The page reads the names and zipcodes from here, not
  from code.
- `counties/<county>/streets/<zip>.json`: `{street: [[low, high, precinct], ...]}`. Precinct
  numbers start with the two-digit county number; the page shows them without it.
- `counties/<county>/shapes/<zip>.json`: precinct outlines as GeoJSON, the precinct number as
  each feature's `id`, simplified to about 2 meters and rounded to 5 decimals. A precinct in two
  zipcodes is in both files.
- `counties/<county>/shapes/index.json`: one zipcode for each precinct, for links.

After a copy:

1. `npm run civic` tries every address in `spec/civic/addresses.txt` (county elections
   offices, and the largest counties' courthouses and jails) against the new files. It isn't
   part of `npm test`, since some miss until the data improves; compare its misses with the
   last run's.
2. Spot-check a few addresses in each changed county on a local preview (below).
3. Commit the copy on its own, then ask Woodie to push.

## Publishing the page

- `public/` is the page; `public/main.js` is built from `src/main.ts` with `npm run build` and
  committed.
- `make check` (or `npm run check`) lints, type-checks, runs the specs at 100% coverage and
  confirms `main.js` matches `src/`. Run it before every commit that touches `src/` or
  `public/`.
- A push to `main` that touches `public/`, `counties/` or the workflow runs
  `.github/workflows/pages.yml`, which copies `counties/` into `public/counties/` and deploys.
  Those public URLs should stay put.
- Woodie pushes, or says yes first. Keep code comments to one line.

## The npm package

`src/lookup.ts` is the package `street-ranges`: parse, match, `remoteSource()` for the published
files and `outline()` for a precinct's shape. No map, districts or races. `src/main.ts` is the
page, built on it. `npm run package` builds `dist/` (not committed); publishing runs the full
check first. Woodie publishes, or says yes first.

## The page

- One input and one answer: the precinct, with its map when there is an outline. Races and
  districts stay out.
- The address never leaves the browser: it fetches only `counties/index.json` and the typed
  zipcode's files. Esri's tiles show which blocks are on screen; `privacy.html` says so.
- Matching: a place name before the house number is skipped (as Google Maps copies
  addresses); a missing St/Ave, a different street type (Ln for Rd) and either spelling of a
  direction (W Civic Center Dr, Civic Center Dr W) are tried in turn. A zipcode in no county
  says "Invalid address".
- No zipcode fallback: an address the ranges miss says so, rather than guessing from its
  zipcode. Other applications of the data may choose their own fallback; this page answers a
  precinct or nothing.
- Copy link gives `#41-44007`, county and precinct; it never names an address and clears when
  the box changes.
- The map is Esri's World Street Map under Leaflet (bundled into `main.js`): 4:3, north up,
  opening at the zoom that fits the precinct, no deeper than 18. Four panes from the one
  outline gray and lighten the world outside, brighten the inside, and draw a 1px border.

## Known gaps

- Zipcodes used only by county buildings aren't in the ranges, so their official addresses
  miss: Ventura's 93009 and San Bernardino's 92415.
- 39 Santa Clara precincts have ranges but no outline, so they answer without a map.
- On a phone, one finger drags the map rather than scrolling the page.
- `spec/civic/addresses.txt` has courthouses and jails only for the eight largest counties.

## Showing pages

Open local pages in Woodie's regular Chrome: `open -a "Google Chrome" URL`. Never use Claude's
embedded browser. To preview, serve a folder holding links to `public/*` and `counties/` with
`python3 -m http.server`. README screenshots come from headless Chrome at
`--window-size=600,800 --force-device-scale-factor=2`, cropped with
`sips -c 914 1120 --cropOffset 490 40`.
