#!/usr/bin/env python3
"""Apply a person's map-checked corrections last, so a rebuild keeps them. Warns when a
correction's map has changed at the county since it was checked.

Usage: bin/corrections.py RANGES.csv CORRECTIONS.csv OUT.csv
"""
import csv
import json
import os
import sys
from collections import defaultdict

from build import clip
from map_dates import MAPS


def apply(rows, corrections):
    """Rows with each correction's numbers taken from any other range on that side."""
    served = defaultdict(list)
    for zip_code, street, low, high, precinct in rows:
        served[zip_code, street, low % 2, precinct].append((low, high))
    fixes = defaultdict(list)
    for c in corrections:
        low, high = int(c["low"]), int(c["high"])
        # A correction the ranges already agree with would only split them.
        if not any(a <= low and high <= b for a, b in served[c["zip"], c["street"], low % 2, c["precinct"]]):
            fixes[c["zip"], c["street"], low % 2].append([low, high, c["precinct"]])
    out = []
    for zip_code, street, low, high, precinct in rows:
        taken = sorted(f[:2] for f in fixes.get((zip_code, street, low % 2), []))
        out += [[zip_code, street, a, b, precinct] for a, b in clip(low, high, taken)]
    out += [[z, s, low, high, p] for (z, s, _), side in fixes.items() for low, high, p in side]
    return sorted(out, key=lambda r: (r[0], r[1], r[2] % 2, r[2], r[3]))


def main(ranges_path, corrections_path, out_path):
    with open(ranges_path, encoding="utf-8") as f:
        rows = [[r["zip"], r["street"], int(r["low"]), int(r["high"]), r["precinct"]] for r in csv.DictReader(f)]
    with open(corrections_path, encoding="utf-8") as f:
        corrections = list(csv.DictReader(f))
    dates_path = os.path.join(MAPS, "map_dates.json")
    dates = json.load(open(dates_path)) if os.path.exists(dates_path) else {}
    for c in corrections:
        current = dates.get(c["map"], {}).get("modified")
        if current and current != c["map_date"]:
            print(f"recheck map {c['map']}, now {current}: {c['zip']} {c['street']} {c['low']}-{c['high']}")
    fixed = apply(rows, corrections)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["zip", "street", "low", "high", "precinct"])
        writer.writerows(fixed)
    print(f"{len(corrections)} corrections: {len(rows)} ranges in, {len(fixed)} out")


if __name__ == "__main__":
    main(*sys.argv[1:])
