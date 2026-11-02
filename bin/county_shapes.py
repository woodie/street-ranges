#!/usr/bin/env python3
"""Convert Santa Clara's precinct shapefile (free by request from its Registrar of Voters) into
sources/43/precinct_map.json, in the layout and coordinates of a county layer that bin/download.py fetches.

Usage: bin/county_shapes.py SHAPEFILE_WITHOUT_EXTENSION
"""
import json
import math
import os
import re
import struct
import sys

from download import REPO

MAJOR = 6378137.0
ECC = math.sqrt(2 / 298.257222101 - (1 / 298.257222101) ** 2)


def inverse_lambert(prj):
    """A function from the .prj's Lambert conformal conic coordinates to NAD83 longitude and latitude."""
    par = {k: float(v) for k, v in re.findall(r'PARAMETER\["(\w+)",([-\d.]+)\]', prj)}
    unit = float(re.search(r'UNIT\["Foot[^"]*",([\d.]+)\]', prj)[1])
    p1, p2, p0 = (math.radians(par[k]) for k in ("Standard_Parallel_1", "Standard_Parallel_2", "Latitude_Of_Origin"))
    m = lambda p: math.cos(p) / math.sqrt(1 - (ECC * math.sin(p)) ** 2)
    t = lambda p: math.tan(math.pi / 4 - p / 2) / ((1 - ECC * math.sin(p)) / (1 + ECC * math.sin(p))) ** (ECC / 2)
    n = (math.log(m(p1)) - math.log(m(p2))) / (math.log(t(p1)) - math.log(t(p2)))
    f = m(p1) / (n * t(p1) ** n)
    r0 = MAJOR * f * t(p0) ** n

    def inverse(x, y):
        dx, dy = (x - par["False_Easting"]) * unit, r0 - (y - par["False_Northing"]) * unit
        r = math.copysign(math.hypot(dx, dy), n)
        ts = (r / (MAJOR * f)) ** (1 / n)
        lat = math.pi / 2 - 2 * math.atan(ts)
        for _ in range(8):
            s = ECC * math.sin(lat)
            lat = math.pi / 2 - 2 * math.atan(ts * ((1 - s) / (1 + s)) ** (ECC / 2))
        return math.degrees(math.atan2(dx, dy) / n) + par["Central_Meridian"], math.degrees(lat)
    return inverse


def main(stem):
    with open(stem + ".dbf", "rb") as f:
        count, header, width = struct.unpack("<xxxxIHH", f.read(12))
        f.seek(header)
        ids = [f.read(width)[1:].decode().strip() for _ in range(count)]
    with open(stem + ".prj", encoding="utf-8") as f:
        inverse = inverse_lambert(f.read())
    with open(stem + ".shp", "rb") as f:
        data = f.read()
    features, pos = [], 100
    for precinct in ids:
        size = struct.unpack(">i", data[pos + 4:pos + 8])[0] * 2
        record = data[pos + 8:pos + 8 + size]
        pos += 8 + size
        parts_n, points_n = struct.unpack("<ii", record[36:44])
        parts = [*struct.unpack(f"<{parts_n}i", record[44:44 + 4 * parts_n]), points_n]
        flat = struct.unpack(f"<{2 * points_n}d", record[44 + 4 * parts_n:44 + 4 * parts_n + 16 * points_n])
        points = [inverse(x, y) for x, y in zip(flat[0::2], flat[1::2])]
        features.append({"attributes": {"Precinct": precinct.zfill(7)},
                         "geometry": {"rings": [points[a:b] for a, b in zip(parts, parts[1:])]}})
    with open(os.path.join(REPO, "sources", "43", "precinct_map.json"), "w", encoding="utf-8") as f:
        json.dump(features, f)
    print(len(features), "precincts")


if __name__ == "__main__":
    main(sys.argv[1])
