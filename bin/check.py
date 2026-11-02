#!/usr/bin/env python3
"""Check the ranges against a file of known ones ({zip: {street: [[low, high, precinct], ...]}}):
each end of a known range is looked up the way a browser would, exact range, same side.

Usage: bin/check.py KNOWN.json county [--prefix]    # --prefix adds the county number to known precincts
"""
import json
import sys
from collections import Counter, defaultdict

from build import build, counties


def check(rows, streets, known, prefix):
    ranges = defaultdict(list)
    for zip_code, street, low, high, precinct in rows:
        ranges[(zip_code, street)].append((low, high, precinct))
    result = Counter()
    for zip_code, known_streets in known.items():
        for street, runs in known_streets.items():
            for low, high, precinct in runs:
                for n in {low, high}:
                    if (zip_code, street) not in streets:
                        result["street not listed"] += 1
                        continue
                    found = {p for lo, hi, p in ranges.get((zip_code, street), []) if lo % 2 == n % 2 and lo <= n <= hi}
                    result["no range" if not found else "ambiguous" if len(found) > 1
                           else "right" if found == {prefix + precinct} else "wrong"] += 1
    return result


def main():
    path, county = sys.argv[1:3]
    with open(path, encoding="utf-8") as f:
        known = json.load(f)
    rows, _, streets = build(county, counties()[county]["fips"])
    result = check(rows, streets, known, county if "--prefix" in sys.argv else "")
    total = sum(result.values())
    for k, v in result.most_common():
        print(f"{k:22} {v:6} {v / total:6.1%}")
    print(f"right when answered: {result['right'] / (result['right'] + result['wrong']):.1%}")


if __name__ == "__main__":
    main()
