#!/usr/bin/env python3
"""Build a local page for a person to settle Santa Clara disagreements on the county's precinct maps.

It lists addresses two maps both claim, addresses where a map and the Census ranges disagree, and
maps the machine couldn't use, grouped by precinct and linked to the local PDFs. Decisions download
as corrections/43.csv. Writes sources/43/maps/review.html (gitignored).

Usage: bin/review.py GUIDE_DIR    # the app whose website/43/ lists each precinct's races
"""
import csv
import glob
import json
import os
import re
import sys
from collections import defaultdict

from build import normalize_street
from map_dates import MAPS, REPO, refresh

LOCAL_RACE = re.compile(r"^SC-(CY|US|ES|HS)-")  # city council and school boards


def fit_problem(result):
    """Why a map's numbers and blocks don't line up with the address data, or None."""
    if "frac" not in result:
        return "House numbers couldn't be lined up with the address data"
    if result["frac"] < .5:
        return "Fewer than half the house numbers lined up"
    if result["other_in"] > max(1, result["other"] * .03):
        return "Too many other precincts' Census blocks are yellow"
    return None if result["points"] else "No address points in the yellow area"


def census_name(names, street):
    """The one Census name a lookup would reach from the county's street name, else the name itself."""
    if street in names:
        return street
    found = [k for k in names if re.match("^[NSEW] ", k) and k[2:] == street]
    if not found:
        longer = [k for k in names if street.startswith(k + " ")]
        most = max(map(len, longer), default=0)
        found = [k for k in longer if len(k) == most] or [k for k in names if k.startswith(street + " ")]
    return found[0] if len(found) == 1 else street


def runs(numbers, every):
    """Join numbers into [low, high] runs that no other address on that side falls between."""
    out = []
    for n in sorted(numbers):
        if out and not any(out[-1][1] < x < n for x in every):
            out[-1][1] = n
        else:
            out.append([n, n])
    return out


def main(guide):
    races = {}
    for path in glob.glob(os.path.join(guide, "website", "43", "*.json")):
        for precinct, entry in json.load(open(path))["precincts"].items():
            races[int(precinct[2:])] = frozenset(c for c in entry["races"] if LOCAL_RACE.match(c))
    census, names = defaultdict(list), defaultdict(set)
    with open(os.path.join(MAPS, "census_ranges.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            census[r["zip"], r["street"]].append((int(r["low"]), int(r["high"]), int(r["precinct"][2:])))
            names[r["zip"]].add(r["street"])
    results = [json.load(open(p)) for p in glob.glob(os.path.join(MAPS, "night", "res*.json"))]
    problems = {r["pct"]: fit_problem(r) or r.get("why") for r in results}
    claims = defaultdict(set)
    for r in results:
        if not problems[r["pct"]]:
            for zip_code, street, number, _ in r["points"]:
                if zip_code in names and street:
                    claims[zip_code, census_name(names[zip_code], street), number].add(r["pct"])
    every = defaultdict(set)
    for number, street, zip_code, *_ in json.load(open(os.path.join(MAPS, "night", "scc_points.json"))):
        if number.isdigit() and zip_code in names:
            n = int(number)
            every[zip_code, census_name(names[zip_code], normalize_street(street)), n % 2].add(n)
    groups, retired = defaultdict(set), 0
    for (zip_code, street, number), precincts in claims.items():
        if len(precincts) > 1:
            groups[zip_code, street, number % 2, "two", tuple(sorted(precincts))].add(number)
            continue
        hit = next((p for low, high, p in census[zip_code, street] if low % 2 == number % 2 and low <= number <= high), None)
        mapped = next(iter(precincts))
        if hit and hit != mapped:
            if hit in races:
                groups[zip_code, street, number % 2, "changed", (mapped, hit)].add(number)
            else:
                retired += 1  # the Census ranges name a precinct no longer on the county's list
    with open(os.path.join(REPO, "corrections", "43.csv"), encoding="utf-8") as f:
        corrections = list(csv.DictReader(f))
    settled = [(c["zip"], c["street"], int(c["low"]), int(c["high"])) for c in corrections]
    rows = []
    for (zip_code, street, side, kind, choices), numbers in groups.items():
        for low, high in runs(numbers, every[zip_code, street, side]):
            if any((z, s) == (zip_code, street) and a % 2 == side and a <= low and high <= b for z, s, a, b in settled):
                continue
            sets = {races.get(p) for p in choices}
            rows.append(dict(zip=zip_code, street=street, low=low, high=high, kind=kind, choices=choices,
                             count=len([n for n in numbers if low <= n <= high]),
                             differ=None in sets or len(sets) > 1))
    dates = refresh({p for row in rows for p in row["choices"]})
    failed = [dict(precinct=p, why=why) for p, why in sorted(problems.items()) if why]
    data = dict(rows=rows, failed=failed, dates=dates, corrections=corrections, retired=retired)
    template = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "review_template.html"), encoding="utf-8").read()
    with open(os.path.join(MAPS, "review.html"), "w", encoding="utf-8") as f:
        f.write(template.replace("__DATA__", json.dumps(data).replace("</", "<\\/")))
    two = sum(r["kind"] == "two" for r in rows)
    print(f"{len(rows)} runs to review ({two} two maps, {len(rows) - two} map vs Census, "
          f"{sum(r['differ'] for r in rows)} with different local races), {len(failed)} unused maps, "
          f"{sum(r['count'] for r in rows)} addresses; {retired} answers on retired precincts left out")


if __name__ == "__main__":
    main(sys.argv[1])
