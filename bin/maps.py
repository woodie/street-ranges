#!/usr/bin/env python3
"""Precinct maps, drawn ahead of time so the page needs no map service. Each is an SVG of the precinct's
outline and the streets inside it, with labels on the streets along its border. Run after bin/build.py, since a
map is only kept for a precinct with ranges. Writes counties/<county>/maps/<zip>.json as {number: svg} and
counties/<county>/maps/index.json as {number: zip}, for links that name a precinct. See docs/COWORK.md.

Usage: bin/maps.py [county ...]    # all counties in counties.json with a precinct map and TIGER streets
"""
import glob
import gzip
import html
import json
import math
import multiprocessing
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

from build import counties, read_dbf
from precinct_map import read_lines

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BORDER_METERS = 30  # a street this close to the outline runs along it
BORDER_SHARE = 0.05  # a label needs this share of the border
MOST_LABELS = 5
SIZE = 800  # the longer side of the drawing
MARGIN = 0.1  # around the precinct, as a share of its longer side
SMOOTHING = 1.5  # drawing units a simplified line can move
SHORTEST = 6  # drawing units; a shorter piece of street inside the outline is left out
BACKGROUND, PRECINCT, STREET = "#f6f5f5", "#ffff80", "#a0693c"
FONT = 26
FONT_WIDTH = 0.68  # of the font size, for capitals
STYLE = (f"text{{font:{FONT}px -apple-system,Helvetica,sans-serif;text-anchor:middle;dominant-baseline:middle}}"
         ".h{fill:#fff;stroke:#fff;stroke-width:10px;stroke-linejoin:round}")
# TIGER drops the apostrophe from these names.
APOSTROPHES = {"OBRIEN": "O'BRIEN", "OCONNOR": "O'CONNOR", "O CONNOR": "O'CONNOR", "OKEEFE": "O'KEEFE",
               "O KEEFE": "O'KEEFE", "ONEILL": "O'NEILL", "OFARRELL": "O'FARRELL", "OSHAUGHNESSY": "O'SHAUGHNESSY"}
APOSTROPHE = re.compile(r"\b(" + "|".join(APOSTROPHES) + r")\b")

streets = []  # (name, line, bounds), shared with the worker processes


def bounds(points):
    xs, ys = zip(*points)
    return min(xs), max(xs), min(ys), max(ys)


def label_text(name):
    return APOSTROPHE.sub(lambda m: APOSTROPHES[m[1]], name.upper())


def simplify(points, tolerance):
    """Douglas-Peucker: drop the points a line can lose without moving more than the tolerance."""
    if len(points) < 3:
        return points
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        farthest, distance = None, tolerance
        for i in range(first + 1, last):
            d = segment_distance(points[i], points[first], points[last])
            if d > distance:
                farthest, distance = i, d
        if farthest:
            keep.add(farthest)
            stack += [(first, farthest), (farthest, last)]
    return [points[i] for i in sorted(keep)]


def closest_on_segment(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    u = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
    return a[0] + u * dx, a[1] + u * dy


def segment_distance(p, a, b):
    return math.dist(p, closest_on_segment(p, a, b))


def closest_on_lines(p, lines):
    pieces = (closest_on_segment(p, a, b) for line in lines for a, b in zip(line, line[1:]))
    return min(pieces, key=lambda q: math.dist(p, q))


def inside(p, rings):
    hit = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > p[1]) != (y2 > p[1]) and p[0] < (x2 - x1) * (p[1] - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def path(points, close=False):
    corners = " ".join(f"{round(x)} {round(y)}" for x, y in points)
    return f"M{corners}{'z' if close else ''}"


def crossings(a, b, ring):
    """Fractions along a-b where it crosses the ring."""
    found = []
    dx, dy = b[0] - a[0], b[1] - a[1]
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        ex, ey = x2 - x1, y2 - y1
        denominator = dx * ey - dy * ex
        if denominator:
            t = ((x1 - a[0]) * ey - (y1 - a[1]) * ex) / denominator
            u = ((x1 - a[0]) * dy - (y1 - a[1]) * dx) / denominator
            if 0 < t < 1 and 0 <= u <= 1:
                found.append(t)
    return found


def inside_pieces(line, rings):
    """The parts of a line inside the rings."""
    pieces, piece = [], []
    for a, b in zip(line, line[1:]):
        cuts = sorted({0, 1, *(t for ring in rings for t in crossings(a, b, ring))})
        for t1, t2 in zip(cuts, cuts[1:]):
            start = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
            end = (a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2)
            if inside(((start[0] + end[0]) / 2, (start[1] + end[1]) / 2), rings):
                piece = piece or [start]
                piece.append(end)
            elif piece:
                pieces.append(piece)
                piece = []
    if piece:
        pieces.append(piece)
    return [p for p in pieces if sum(math.dist(a, b) for a, b in zip(p, p[1:])) >= SHORTEST]


def border_points(ring):
    """Evenly spaced points around the outline, at most about 400."""
    perimeter = sum(math.dist(a, b) for a, b in zip(ring, ring[1:]))
    step = max(10, perimeter / 400)
    points = []
    for a, b in zip(ring, ring[1:]):
        count = max(1, int(math.dist(a, b) / step))
        points += [(a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count) for i in range(count)]
    return points


def border_owners(points, named):
    """The closest named street to each border point, or None."""
    owners = []
    for p in points:
        owner, closest = None, BORDER_METERS
        for name, line, (x0, x1, y0, y1) in named:
            if x0 - BORDER_METERS <= p[0] <= x1 + BORDER_METERS and y0 - BORDER_METERS <= p[1] <= y1 + BORDER_METERS:
                for a, b in zip(line, line[1:]):
                    distance = segment_distance(p, a, b)
                    if distance < closest:
                        owner, closest = name, distance
        owners.append(owner)
    return owners


def runs_from_the_middle(owners, name):
    """Indexes of a street's border points: its longest stretch first, each from its middle outward."""
    runs, run = [], []
    for i, owner in enumerate(owners):
        if owner == name:
            run.append(i)
        elif run:
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    runs.sort(key=len, reverse=True)
    return [r[j] for r in runs for j in sorted(range(len(r)), key=lambda j: abs(j - len(r) // 2))]


def place_labels(names, owners, points, named, scale, width, height):
    """A straight label on each street, at the first spot along the border that overlaps no other label."""
    labels, taken = [], []
    for name in names:
        text = label_text(name)
        half = len(text) * FONT * FONT_WIDTH / 2
        lines = [line for n, line, _ in named if n == name]
        for i in runs_from_the_middle(owners, name):
            x, y = scale(closest_on_lines(points[i], lines))
            x, y = max(half + 8, min(width - half - 8, x)), max(FONT, min(height - FONT, y))
            box = (x - half - 6, y - FONT * 0.7, x + half + 6, y + FONT * 0.7)
            if not any(box[0] < o[2] and o[0] < box[2] and box[1] < o[3] and o[1] < box[3] for o in taken):
                taken.append(box)
                labels.append((round(x), round(y), html.escape(text)))
                break
    return labels


def draw(rings):
    """The SVG for a precinct's rings of (lon, lat)."""
    x0, x1, y0, y1 = bounds([p for ring in rings for p in ring])
    per_y = 111320
    per_x = per_y * math.cos(math.radians((y0 + y1) / 2))
    meters = lambda p: ((p[0] - x0) * per_x, (y1 - p[1]) * per_y)
    across, down = (x1 - x0) * per_x, (y1 - y0) * per_y
    margin = MARGIN * max(across, down)
    ratio = SIZE / (max(across, down) + 2 * margin)
    scale = lambda p: ((p[0] + margin) * ratio, (p[1] + margin) * ratio)
    width, height = round((across + 2 * margin) * ratio), round((down + 2 * margin) * ratio)
    reach_x, reach_y = (BORDER_METERS + 50) / per_x, (BORDER_METERS + 50) / per_y
    nearby = [(name, [meters(p) for p in line]) for name, line, (a, b, c, d) in streets
              if a <= x1 + reach_x and b >= x0 - reach_x and c <= y1 + reach_y and d >= y0 - reach_y]
    named = [(name, line, bounds(line)) for name, line in nearby if name]
    plain = [[meters(p) for p in ring] for ring in rings]
    points = border_points(max(plain, key=len))
    owners = border_owners(points, named)
    counts = Counter(owners)
    names = [n for n, count in counts.most_common()
             if n and not n.endswith("Rmp") and count / len(owners) >= BORDER_SHARE][:MOST_LABELS]
    drawn = [simplify([scale(p) for p in ring], SMOOTHING) for ring in plain]
    outline = "".join(path(ring, True) for ring in drawn)
    roads = "".join(path(piece) for _, line in nearby for piece in inside_pieces(simplify([scale(p) for p in line], SMOOTHING), drawn))
    labels = "".join(f'<text x="{x}" y="{y}" class="h">{t}</text><text x="{x}" y="{y}">{t}</text>'
                     for x, y, t in place_labels(names, owners, points, named, scale, width, height))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><style>{STYLE}</style>'
            f'<rect width="{width}" height="{height}" fill="{BACKGROUND}"/><path d="{outline}" fill="{PRECINCT}"/>'
            f'<path d="{roads}" fill="none" stroke="{STREET}" stroke-width="3"/>'
            f'<path d="{outline}" fill="none" stroke="#000" stroke-width="4"/>{labels}</svg>')


def drawn(job):
    number, rings = job
    return number, draw(rings)


def precinct_zipcodes(county):
    """Each precinct number with ranges, as shown on the page, and the zipcodes it has them in."""
    zipcodes = defaultdict(set)
    for path_ in glob.glob(os.path.join(REPO, "counties", county, "streets", "*.json")):
        with open(path_, encoding="utf-8") as f:
            for ranges in json.load(f).values():
                for _, _, precinct in ranges:
                    zipcodes[precinct[2:].lstrip("0")].add(os.path.basename(path_)[:-5])
    return zipcodes


def build_county(county, config):
    global streets
    directory = os.path.join(REPO, "sources", county)
    base = os.path.join(directory, f"tl_2025_06{config['fips']}_addrfeat")
    shapes = os.path.join(directory, "precinct_map.json")
    if not (os.path.exists(shapes) and os.path.exists(f"{base}.dbf")):
        print(f"{config['name']}: no precinct_map.json or TIGER streets, skipped")
        return
    names = (r["FULLNAME"] for r in read_dbf(f"{base}.dbf"))
    lines = read_lines(f"{base}.zip", f"{os.path.basename(base)}.shp")
    streets = [(name, line, bounds(line)) for name, line in zip(names, lines) if line]
    zipcodes = precinct_zipcodes(county)
    with open(shapes, encoding="utf-8") as f:
        features = json.load(f)
    field = config["precinct_map"]["field"]
    jobs = [(str(f["attributes"][field]).strip().lstrip("0"), f["geometry"]["rings"]) for f in features]
    jobs = [job for job in jobs if job[0] in zipcodes]
    with multiprocessing.get_context("fork").Pool() as pool:
        svgs = dict(pool.imap_unordered(drawn, jobs, chunksize=8))
    write_county(county, svgs, zipcodes)
    missing = sorted(set(zipcodes) - set(svgs), key=int)
    print(f"{config['name']}: {len(svgs)} maps; no shape for {len(missing)} precincts with ranges: {' '.join(missing)}")


def write_county(county, svgs, zipcodes):
    directory = os.path.join(REPO, "counties", county, "maps")
    shutil.rmtree(directory, ignore_errors=True)
    os.makedirs(directory)
    by_zip = defaultdict(dict)
    for number, svg in svgs.items():
        for zip_code in zipcodes[number]:
            by_zip[zip_code][number] = svg
    sizes = []
    for zip_code, maps in by_zip.items():
        text = json.dumps(dict(sorted(maps.items(), key=lambda kv: int(kv[0]))), indent=0, ensure_ascii=False) + "\n"
        with open(os.path.join(directory, f"{zip_code}.json"), "w", encoding="utf-8") as f:
            f.write(text)
        sizes.append((len(gzip.compress(text.encode())), zip_code, len(text)))
    index = {number: min(zipcodes[number]) for number in sorted(svgs, key=int)}
    with open(os.path.join(directory, "index.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(index, indent=0) + "\n")
    print(f"counties/{county}/maps/: {len(by_zip)} zipcodes, {sum(s[2] for s in sizes) / 1e6:.1f} MB, {sum(s[0] for s in sizes) / 1e6:.1f} MB compressed, "
          f"largest {max(sizes)[1]} at {max(sizes)[2] / 1e3:.0f} KB ({max(sizes)[0] / 1e3:.0f} KB compressed)")


def main():
    known = counties()
    for county in sys.argv[1:] or known:
        build_county(county, known[county])


if __name__ == "__main__":
    main()
