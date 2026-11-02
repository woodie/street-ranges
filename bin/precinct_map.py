"""Which precinct is a street side in? Answers from a county's precinct map and TIGER's street lines."""
import json
import math
import struct
import zipfile
from collections import defaultdict

CELL = 0.005  # degrees, for finding nearby precincts quickly
OFFSET = 15  # meters from the centerline to a house
SAMPLES = (0.1, 0.3, 0.5, 0.7, 0.9)  # places along a segment to check
METERS_X, METERS_Y = 111320 * math.cos(math.radians(37.5)), 110574  # per degree, close enough for a county


def read_lines(zip_path, name):
    """Each shape in a TIGER .shp as a list of (lon, lat), in the same order as its .dbf."""
    data = zipfile.ZipFile(zip_path).read(name)
    lines, pos = [], 100
    while pos < len(data):
        size = struct.unpack(">i", data[pos + 4:pos + 8])[0] * 2
        record = data[pos + 8:pos + 8 + size]
        pos += 8 + size
        if struct.unpack("<i", record[:4])[0] == 0:
            lines.append([])
            continue
        parts, points = struct.unpack("<ii", record[36:44])
        xy = struct.unpack(f"<{2 * points}d", record[44 + 4 * parts:44 + 4 * parts + 16 * points])
        lines.append(list(zip(xy[::2], xy[1::2])))
    return lines


def inside(x, y, rings):
    hit = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def along(line, t):
    """The point at fraction t of the line, and the line's direction there in meters."""
    pieces = [(a, b, math.hypot((b[0] - a[0]) * METERS_X, (b[1] - a[1]) * METERS_Y)) for a, b in zip(line, line[1:])]
    remaining = t * sum(p[2] for p in pieces)
    for a, b, length in pieces:
        if length and (remaining <= length or (a, b, length) == pieces[-1]):
            u = min(remaining / length, 1)
            return (a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]),
                    (b[0] - a[0]) * METERS_X / length, (b[1] - a[1]) * METERS_Y / length)
        remaining -= length
    return line[0][0], line[0][1], 0, 0


class PrecinctMap:
    def __init__(self, path, prefix, field):
        with open(path, encoding="utf-8") as f:
            features = json.load(f)
        self.precincts = [(prefix + str(f["attributes"][field]).strip(), f["geometry"]["rings"]) for f in features]
        self.grid = defaultdict(list)
        for i, (_, rings) in enumerate(self.precincts):
            xs, ys = zip(*(point for ring in rings for point in ring))
            for gx in range(math.floor(min(xs) / CELL), math.floor(max(xs) / CELL) + 1):
                for gy in range(math.floor(min(ys) / CELL), math.floor(max(ys) / CELL) + 1):
                    self.grid[gx, gy].append(i)

    def at(self, x, y):
        for i in self.grid.get((math.floor(x / CELL), math.floor(y / CELL)), ()):
            if inside(x, y, self.precincts[i][1]):
                return self.precincts[i][0]
        return None

    def side(self, line, side):
        """The precinct of a whole side (L or R) of a line, or None when it isn't all in one."""
        if len(line) < 2:
            return None
        sign = 1 if side == "L" else -1
        found = set()
        for t in SAMPLES:
            x, y, dx, dy = along(line, t)
            found.add(self.at(x - sign * dy * OFFSET / METERS_X, y + sign * dx * OFFSET / METERS_Y))
        return found.pop() if len(found) == 1 else None
