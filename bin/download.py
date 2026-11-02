#!/usr/bin/env python3
"""Download each county's public source files into sources/<county>/ (gitignored).

Usage: bin/download.py [county ...]    # all counties in counties.json by default
"""
import json
import os
import sys
import urllib.parse
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


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "street-ranges"})) as response:
        return json.load(response)


def fetch_layer(url, fields, path):
    """Every feature of a county layer, a page at a time, in TIGER's coordinates."""
    if os.path.exists(path):
        return
    print(url)
    features = []
    while True:
        query = {"where": "1=1", "outFields": ",".join(fields), "outSR": 4269, "f": "json",
                 "orderByFields": "OBJECTID", "resultOffset": len(features)}
        page = get_json(f"{url}?{urllib.parse.urlencode(query)}")["features"]
        if not page:
            break
        features += page
    with open(path, "w", encoding="utf-8") as f:
        json.dump(features, f)


def download(county, fips, precinct_map=None, address_points=None):
    directory = os.path.join(REPO, "sources", county)
    os.makedirs(directory, exist_ok=True)
    fetch(SWDB.format(fips=fips), directory)
    for layer in ("ADDRFEAT", "FACES"):
        with zipfile.ZipFile(fetch(TIGER.format(layer=layer, fips=fips, name=layer.lower()), directory)) as z:
            z.extractall(directory, [n for n in z.namelist() if n.endswith(".dbf")])
    if precinct_map and "url" in precinct_map:
        fetch_layer(precinct_map["url"], [precinct_map["field"]], os.path.join(directory, "precinct_map.json"))
    if address_points and "url" in address_points:
        address = address_points["address"]
        fetch_layer(address_points["url"], [*(address if isinstance(address, list) else [address]), address_points["zip"]],
                    os.path.join(directory, "address_points.json"))


def main():
    with open(os.path.join(REPO, "counties.json"), encoding="utf-8") as f:
        counties = json.load(f)
    for county in sys.argv[1:] or counties:
        download(county, counties[county]["fips"], counties[county].get("precinct_map"), counties[county].get("address_points"))


if __name__ == "__main__":
    main()
