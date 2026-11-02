#!/usr/bin/env python3
"""Fail if a spec uses a real address: every house number and street it types must miss the county address lists.

Usage: bin/spec_addresses.py    # needs sources/ from bin/download.py
"""
import json
import os
import re
import sys

from build import REPO, normalize_street, counties


def known_addresses():
    found = set()
    for county, config in counties().items():
        fields = config["address_points"]["address"]
        fields = fields if isinstance(fields, list) else [fields]
        with open(os.path.join(REPO, "sources", county, "address_points.json"), encoding="utf-8") as f:
            for feature in json.load(f):
                address = " ".join(str(feature["attributes"].get(k) or "").strip() for k in fields)
                parsed = re.match(r"\s*(\d+)\S*(?:\s+1/2)?\s+(.+)$", address)
                if parsed:
                    found.add((normalize_street(parsed[2]), int(parsed[1])))
    return found


def main():
    with open(os.path.join(REPO, "spec", "javascript", "main.spec.ts"), encoding="utf-8") as f:
        typed = re.findall(r"""(?:text|typed) = (["'])(\d.+?)\1""", f.read())
    known = known_addresses()
    real = []
    for _, text in typed:
        parsed = re.match(r"(\d+)\S*\s+([^,]+?)(?: Menlo Park)?(?:,.*| \d{5}.*)?$", text)
        if (normalize_street(parsed[2]), int(parsed[1])) in known:
            real.append(text)
    print(f"{len(typed)} typed addresses, {len(real)} real")
    for text in real:
        print(" ", text)
    sys.exit(1 if real else 0)


if __name__ == "__main__":
    main()
