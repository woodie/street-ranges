#!/usr/bin/env python3
"""Street ranges from public data. Real addresses come first: the county's address
points placed on its precinct map. For other numbers, each side of a Census street
segment gets its precinct from the map, or else the precinct of the block it faces. Writes out/<county>/<zip>.json as
{street: [[low, high, precinct], ...]}. See README.md.

Usage: bin/build.py [county ...]    # all counties in counties.json by default
"""
import csv
import glob
import itertools
import json
import os
import re
import shutil
import struct
import sys
from collections import Counter, defaultdict

from precinct_map import PrecinctMap, read_lines

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARE = 0.90  # a block's precinct needs this share of its voters
MAX_GAP = 100  # next-door segments merge only when their numbers are this close
NOT_HOMES = {"Exception Address", "Mail Drop", "Drop Box", "No-Residence"}
STREET_WORDS = {
    "STREET": "ST", "AVENUE": "AVE", "AV": "AVE", "ROAD": "RD", "DRIVE": "DR", "LANE": "LN", "COURT": "CT",
    "PLACE": "PL", "CIRCLE": "CIR", "BOULEVARD": "BLVD", "TERRACE": "TER", "PARKWAY": "PKWY", "HIGHWAY": "HWY",
    "TRAIL": "TRL", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
    "FIRST": "1ST", "SECOND": "2ND", "THIRD": "3RD", "FOURTH": "4TH", "FIFTH": "5TH", "SIXTH": "6TH",
    "SEVENTH": "7TH", "EIGHTH": "8TH", "NINTH": "9TH", "TENTH": "10TH", "ELEVENTH": "11TH", "TWELFTH": "12TH",
}
# Street types only as the last word, so HILL RD and PLAZA N keep their names.
LAST_WORDS = {"ALLEY": "ALY", "PLAZA": "PLZ", "HILL": "HL", "SQUARE": "SQ", "CROSSING": "XING", "LP": "LOOP"}
UNIT = r"\s+(?:(?:APT|UNIT|STE|SUITE|SPC|OFC|BLDG|RM|FL|LOT|TRLR|LOWR|UPPR|REAR|FRNT|BSMT|PH)\b|#).*$"
# A bare unit after a street type ("E OKEEFE ST 4"); E, N, S and W stay, since they can be part of a name.
TRAILING_UNIT = (r"(?<=\s(?:ST|RD|DR|CT|LN|PL))|(?<=\s(?:AVE|WAY|CIR|TER|TRL|ALY|PLZ|RUN|ROW))|(?<=\s(?:BLVD|PKWY|LOOP|WALK|PATH|MALL|EXPY|PIKE))")
TRAILING_UNIT = rf"(?:{TRAILING_UNIT})\s+(?:\d+[A-Z]?|[A-DF-MO-RT-VX-Z])$"
# Census abbreviates Spanish street types nobody types ("CLL SUENO" is Calle Sueno).
SPELLED = {"CLL": "CALLE", "CAM": "CAMINO", "PSO": "PASEO", "VIS": "VISTA", "AVE": "AVENIDA"}


def counties():
    with open(os.path.join(REPO, "counties.json"), encoding="utf-8") as f:
        return json.load(f)


def normalize_street(street):
    words = [STREET_WORDS.get(w, w) for w in re.sub(UNIT, "", re.sub(r"[.'’]", "", street.upper())).split()]
    if words and words[0] == "SAINT":
        words[0] = "ST"
    street = re.sub(r"^ALAMEDA DE LAS PULGAS$", "ALAMEDA", re.sub(TRAILING_UNIT, "", " ".join(words)))
    head, _, last = street.rpartition(" ")
    return f"{head} {LAST_WORDS[last]}" if head and last in LAST_WORDS else street


def spelled_out(street):
    """Calle Sueno for CLL SUENO, or None. AVE A stays Avenue A."""
    first, _, rest = street.partition(" ")
    return f"{SPELLED[first]} {rest}" if first in SPELLED and len(rest) > 1 else None


def read_dbf(path):
    """Rows of a dBASE table (TIGER attributes) as dicts of strings."""
    with open(path, "rb") as f:
        count, header_len, rec_len = struct.unpack("<xxxxIHH", f.read(12))
        f.seek(32)
        cols = []
        while (d := f.read(32))[0] != 0x0D:
            cols.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(header_len)
        for _ in range(count):
            rec = f.read(rec_len)
            if rec[:1] == b"*":
                continue
            row, pos = {}, 1
            for name, size in cols:
                row[name] = rec[pos:pos + size].decode("latin-1").strip()
                pos += size
            yield row


def block_precincts(path, prefix):
    """block -> precinct, or None when no precinct has SHARE of its voters."""
    voters = defaultdict(Counter)
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            voters[r["tract"] + r["block"]][prefix + re.sub(r"-\d+$", "", r["rgprec"])] += int(r["blkreg"])
    out = {}
    for block, counts in voters.items():
        precinct, n = counts.most_common(1)[0]
        out[block] = precinct if n >= SHARE * sum(counts.values()) else None
    return out


def point_ranges(path, places, source):
    """(zip, street, parity) -> runs of real addresses in one precinct, and the numbers in two precincts."""
    homes = defaultdict(set)
    with open(path, encoding="utf-8") as f:
        for feature in json.load(f):
            attributes = feature["attributes"]
            fields = source["address"] if isinstance(source["address"], list) else [source["address"]]
            # The first field is the house number, when an address comes in parts.
            address = " ".join(str(attributes.get(f) or "").strip() for f in fields).strip()
            if not str(attributes.get(fields[0]) or "").strip():
                continue
            zip_code = attributes[source["zip"]] or ""
            # "8881/2 Green St" is 888 1/2, and " 91st St" has no house number.
            address = re.sub(r"^(\d+)1/2\b", r"\1 1/2", address.strip())
            parsed = re.match(r"(\d+)(?!\d)(?!(?i:st|nd|rd|th)\b)\S*(?:\s+1/2)?\s+(?:(?![NSEWnsew]\s)[A-Za-z]\s+(?=\S+\s))?(.+)$", address)
            precinct = places.at(feature["geometry"]["x"], feature["geometry"]["y"]) if "geometry" in feature else None
            if parsed and int(parsed[1]) and zip_code.strip() and precinct:
                homes[zip_code.strip()[:5], normalize_street(parsed[2]), int(parsed[1])].add(precinct)
    sides, split = defaultdict(list), defaultdict(list)
    for (zip_code, street, number), precincts in sorted(homes.items()):
        side, precinct = (zip_code, street, number % 2), precincts.pop() if len(precincts) == 1 else None
        runs = sides[side]
        if precinct is None:
            split[side].append(number)
            runs.append([number, number, None])  # ends the run
        elif runs and runs[-1][2] == precinct:
            runs[-1][1] = number
        else:
            runs.append([number, number, precinct])
    return {side: [r for r in runs if r[2]] for side, runs in sides.items()}, split


def clip(low, high, taken):
    """The parts of low-high outside the taken [start, end] spans, sorted."""
    parts = []
    for start, end in taken:
        if end >= low and start <= high:
            if start > low:
                parts.append([low, start - 2])
            low = end + 2
    return parts + [[low, high]] if low <= high else parts


def merge_rows(rows, max_gap):
    """Join a side's neighboring ranges in one precinct, so clipping leaves no extra pieces."""
    merged = []
    for row in sorted(rows, key=lambda r: (r[0], r[1], r[2] % 2, r[2], r[3])):
        last = merged[-1] if merged else None
        if (last and last[:2] == row[:2] and last[2] % 2 == row[2] % 2 and last[4] == row[4]
                and row[2] - last[3] <= max_gap):
            last[3] = max(last[3], row[3])
        else:
            merged.append(list(row))
    return merged


def extract_rows(path, county, max_gap=MAX_GAP):
    """Rows from an elections office's address table: only the street, house number, zipcode and precinct are read."""
    homes = defaultdict(set)
    with open(path, encoding="latin-1", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            number = (row["lHouseNumLo"] or "").strip()
            # Numbers run from 1, and these types aren't places a voter lives or looks up.
            if not number.isdigit() or int(number) == 0 or row["szAddrTypeDesc"] in NOT_HOMES or not row["sPrecinctID"]:
                continue
            street = normalize_street(" ".join(row[k] or "" for k in ("sPreDir", "szStreetName", "sStreetSuffix", "sPostDir")))
            homes[row["sZip"].strip(), street, int(number)].add(county + row["sPrecinctID"].strip().zfill(4))
    rows = []
    for (zip_code, street, number), precincts in sorted(homes.items(), key=lambda item: (item[0][0], item[0][1], item[0][2] % 2, item[0][2])):
        rows.append([zip_code, street, number, number, precincts.pop() if len(precincts) == 1 else None])
    stops = {(z, s, n) for z, s, n, _, p in rows if p is None}
    merged = []
    for row in rows:
        last = merged[-1] if merged else None
        if row[4] is None:
            continue
        if (last and last[:2] == row[:2] and last[2] % 2 == row[2] % 2 and last[4] == row[4] and row[2] - last[3] <= max_gap
                and not any((row[0], row[1], n) in stops for n in range(last[3] + 2, row[2], 2))):
            last[3] = row[2]
        else:
            merged.append(row)
    return merged


def build(county, fips, max_gap=MAX_GAP, source=None):
    """[zip, street, low, high, precinct] rows, counts of sides by outcome, and every (zip, street)."""
    directory = os.path.join(REPO, "sources", county)
    extract = counties()[county].get("street_extract")
    if extract:
        rows = extract_rows(sorted(glob.glob(os.path.join(directory, extract)))[-1], county, max_gap)
        return sorted(rows), Counter(address=sum((r[3] - r[2]) // 2 + 1 for r in rows)), {(r[0], r[1]) for r in rows}
    source = source or counties()[county].get("precinct_map")
    places = PrecinctMap(os.path.join(directory, "precinct_map.json"), county, source["field"]) if source else None
    lines = read_lines(os.path.join(directory, f"tl_2025_06{fips}_addrfeat.zip"), f"tl_2025_06{fips}_addrfeat.shp") if places else itertools.repeat(None)
    blocks = block_precincts(os.path.join(directory, f"c{fips}_p26_rg_blk_map.csv"), county)
    faces = {r["TFID"]: (r["TRACTCE20"] + r["BLOCKCE20"], r["ZCTA5CE20"])
             for r in read_dbf(os.path.join(directory, f"tl_2025_06{fips}_faces.dbf"))}
    sides, outcome = defaultdict(list), Counter()
    for r, line in zip(read_dbf(os.path.join(directory, f"tl_2025_06{fips}_addrfeat.dbf")), lines):
        for s in "LR":
            low, high = r[f"{s}FROMHN"], r[f"{s}TOHN"]
            if not (low.isdigit() and high.isdigit()):
                continue
            low, high = sorted((int(low), int(high)))
            block, zcta = faces.get(r[f"TFID{s}"], (None, None))
            mapped = places.side(line, s) if places else None
            precinct = mapped or blocks.get(block)
            outcome["both parities" if r[f"PARITY{s}"] == "B" else "map" if mapped else "block" if precinct
                    else "no voters" if block not in blocks else "split block"] += 1
            if r[f"PARITY{s}"] == "B":
                precinct = None  # a lookup picks a side by the low number's parity
            sides[(r[f"ZIP{s}"] or zcta, normalize_street(r["FULLNAME"]), low % 2)].append([low, high, precinct])
    rows = []
    for (zip_code, street, _), ranges in sides.items():
        merged = []
        for low, high, precinct in sorted(ranges, key=lambda r: r[:2]):
            # A side with no precinct between two segments keeps them apart.
            if merged and precinct and merged[-1][2] == precinct and low - merged[-1][1] <= max_gap:
                merged[-1][1] = max(merged[-1][1], high)
            else:
                merged.append([low, high, precinct])
        for name in filter(None, (street, spelled_out(street))):
            rows += [[zip_code, name, low, high, p] for low, high, p in merged if p and zip_code]
    streets = {(row[0], row[1]) for row in rows} | {(z, s) for z, s, _ in sides}
    points = counties()[county].get("address_points")
    if places and points:
        runs, split = point_ranges(os.path.join(directory, "address_points.json"), places, points)
        tiger, rows = rows, []
        for zip_code, street, low, high, precinct in tiger:
            side = (zip_code, street, low % 2)
            taken = sorted([r[:2] for r in runs.get(side, [])] + [[n, n] for n in split.get(side, [])])
            rows += [[zip_code, street, a, b, precinct] for a, b in clip(low, high, taken)]
        rows += [[z, s, low, high, p] for (z, s, _), side_runs in runs.items() for low, high, p in side_runs]
        rows = merge_rows(rows, max_gap)
        streets |= {(z, s) for z, s, _ in runs}
    return sorted(rows), outcome, streets


def readable(streets):
    """JSON with one range per line, each street in house-number order."""
    blocks = []
    for street in sorted(streets):
        ranges = sorted(streets[street], key=lambda r: r[:2])
        lines = ",\n".join(f"    {json.dumps(r)}" for r in ranges)
        blocks.append(f"  {json.dumps(street)}: [\n{lines}\n  ]")
    return "{\n" + ",\n".join(blocks) + "\n}\n"


def write(county, rows, zipcodes):
    """One file per listed zipcode, and the rest reported: TIGER has typos and strays."""
    directory = os.path.join(REPO, "out", county)
    shutil.rmtree(directory, ignore_errors=True)
    os.makedirs(directory)
    by_zip = defaultdict(lambda: defaultdict(list))
    for zip_code, street, low, high, precinct in rows:
        by_zip[zip_code][street].append([low, high, precinct])
    strays = {z: by_zip.pop(z) for z in sorted(set(by_zip) - set(zipcodes))}
    for zip_code, streets in strays.items():
        print(f"not a listed zipcode, left out: {zip_code} ({', '.join(sorted(streets))})")
    for zip_code, streets in by_zip.items():
        with open(os.path.join(directory, f"{zip_code}.json"), "w", encoding="utf-8") as f:
            f.write(readable(streets))
    return len(by_zip)


def corrected(county, rows):
    """Rows with what a person read off a map applied last, so a rebuild keeps it."""
    from corrections import apply

    path = os.path.join(REPO, "corrections", f"{county}.csv")
    if not os.path.exists(path):
        return rows
    with open(path, encoding="utf-8") as f:
        return apply(rows, list(csv.DictReader(f)))


def main():
    known = counties()
    for county in sys.argv[1:] or known:
        rows, outcome, _ = build(county, known[county]["fips"])
        rows = corrected(county, rows)
        total = sum(outcome.values())
        print(known[county]["name"], "street sides:", ", ".join(f"{k} {v} ({v / total:.1%})" for k, v in outcome.most_common()))
        print(f"{len(rows)} ranges in {write(county, rows, known[county]['zipcodes'])} zipcodes -> out/{county}/")


if __name__ == "__main__":
    main()
