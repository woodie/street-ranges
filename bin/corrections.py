"""Apply a person's map-checked corrections last, so a rebuild keeps them."""
from collections import defaultdict

from build import clip


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
