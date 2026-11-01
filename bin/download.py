#!/usr/bin/env python3
"""Download each county's public source files into sources/<county>/ (gitignored).

Usage: bin/download.py [county ...]    # all counties in counties.json by default
"""
import json
import os
import sys
import urllib.request
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SWDB = "https://statewidedatabase.org/pub/data/P26/c{fips}/c{fips}_p26_rg_blk_map.csv"
TIGER = "https://www2.census.gov/geo/tiger/TIGER2025/{layer}/tl_2025_06{fips}_{name}.zip"


def fetch(url, directory):
    path = os.path.join(directory, os.path.basename(url))
    if os.path.exists(path):
        return path
    print(url)
    request = urllib.request.Request(url, headers={"User-Agent": "street-ranges"})
    with urllib.request.urlopen(request) as response, open(path + ".part", "wb") as f:
        f.write(response.read())
    os.rename(path + ".part", path)
    return path


def download(county, fips):
    directory = os.path.join(REPO, "sources", county)
    os.makedirs(directory, exist_ok=True)
    fetch(SWDB.format(fips=fips), directory)
    for layer in ("ADDRFEAT", "FACES"):
        with zipfile.ZipFile(fetch(TIGER.format(layer=layer, fips=fips, name=layer.lower()), directory)) as z:
            z.extractall(directory, [n for n in z.namelist() if n.endswith(".dbf")])


def main():
    with open(os.path.join(REPO, "counties.json"), encoding="utf-8") as f:
        counties = json.load(f)
    for county in sys.argv[1:] or counties:
        download(county, counties[county]["fips"])


if __name__ == "__main__":
    main()
