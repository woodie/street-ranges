#!/usr/bin/env python3
"""Compare the local copies of Santa Clara's precinct maps with the county's, by date and checksum.

Writes sources/43/maps/map_dates.json: {precinct: {"modified": date, "current": bool}}.

Usage: bin/map_dates.py [precinct ...]    # with precincts, also downloads any missing copy
"""
import base64
import datetime
import email.utils
import glob
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = os.path.join(REPO, "sources", "43", "maps")
URL = "https://stgenrov.sccgov.org/precinctmaps/pct%20{}.pdf"


def local_path(precinct):
    return os.path.join(MAPS, "pdfs", f"pct{precinct}.pdf")


def check(precinct, download=False):
    """(precinct, {"modified", "current"}), or (precinct, None) when the county has no such map."""
    url = URL.format(precinct)
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "street-ranges"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                headers = response.headers
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return precinct, None
            raise
        except urllib.error.URLError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    path = local_path(precinct)
    if download and not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "street-ranges"}), timeout=60) as response:
            with open(path, "wb") as f:
                f.write(response.read())
    digest = base64.b64encode(hashlib.md5(open(path, "rb").read()).digest()).decode() if os.path.exists(path) else None
    modified = email.utils.parsedate_to_datetime(headers["Last-Modified"]).date().isoformat()
    return precinct, {"modified": modified, "current": digest == headers["Content-MD5"]}


def refresh(extra=()):
    """Check every local copy, downloading any of the extra precincts not held yet."""
    held = {int(re.search(r"pct(\d+)", p)[1]) for p in glob.glob(local_path("*"))}
    extra = set(extra) - held
    with ThreadPoolExecutor(12) as pool:
        found = list(pool.map(check, sorted(held)))
        found += list(pool.map(lambda p: check(p, download=True), sorted(extra)))
    dates = {str(p): info for p, info in found if info}
    with open(os.path.join(MAPS, "map_dates.json"), "w") as f:
        json.dump(dates, f)
    return dates


if __name__ == "__main__":
    dates = refresh(map(int, sys.argv[1:]))
    stale = sorted(p for p, info in dates.items() if not info["current"])
    print(f"{len(dates)} maps, checked {datetime.date.today()}; {len(stale)} changed at the county: {' '.join(stale)}")
