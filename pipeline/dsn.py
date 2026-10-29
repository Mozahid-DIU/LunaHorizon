"""Hourly visibility of the Moon from NASA's three Deep Space Network complexes.

A lander can talk directly to Earth only when Earth is above its horizon AND at least one
DSN complex has the Moon above its elevation mask. This file covers the second half.

Output: web/public/data/dsn-<year>.json with one bitmask per hour
(bit 0 = Goldstone, bit 1 = Madrid, bit 2 = Canberra).
Usage: python dsn.py [first_year last_year]   (default 2026 2030)
"""
import json
import sys

import numpy as np
from skyfield.api import wgs84

from ephemeris import _context, _times
from subpoints import OUT_DIR, _hours_of_year

# 10 deg is a conservative tracking limit; DSN antennas can work lower in good conditions.
ELEVATION_MASK_DEG = 10.0

# Reference antennas: DSS-14, DSS-63, DSS-43 (70 m). Geodetic coordinates from the
# DSN Telecommunications Link Design Handbook 810-005, module 301 (rev. K), geodetic coordinates table.
STATIONS = [
    {"id": "goldstone", "name": "Goldstone (USA), DSS-14", "lat": 35.425901, "lon": -116.889538, "alt_km": 1.001390},
    {"id": "madrid", "name": "Madrid (Spain), DSS-63", "lat": 40.431210, "lon": -4.248010, "alt_km": 0.864816},
    {"id": "canberra", "name": "Canberra (Australia), DSS-43", "lat": -35.402424, "lon": 148.981267, "alt_km": 0.688867},
]


def moon_elevation(station: dict, utc_strings: list[str]) -> np.ndarray:
    """Airless elevation of the Moon's centre (deg) seen from a DSN station."""
    ts, eph, _, _ = _context()
    t = _times(ts, utc_strings)
    site = eph["earth"] + wgs84.latlon(station["lat"], station["lon"], elevation_m=station["alt_km"] * 1000)
    alt, _, _ = site.at(t).observe(eph["moon"]).apparent().altaz()
    return alt.degrees


def build_year(year: int) -> dict:
    hours = _hours_of_year(year)
    mask = np.zeros(len(hours), dtype=int)
    for bit, station in enumerate(STATIONS):
        mask |= (moon_elevation(station, hours) >= ELEVATION_MASK_DEG).astype(int) << bit
    return {
        "start": f"{year}-01-01T00:00Z",
        "step_hours": 1,
        "elevation_mask_deg": ELEVATION_MASK_DEG,
        "stations": [s["name"] for s in STATIONS],
        "source": "NASA JPL DE440 via Skyfield; station locations from DSN 810-005 module 301",
        "mask": mask.tolist(),
    }


def main(first: int, last: int) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for year in range(first, last + 1):
        path = OUT_DIR / f"dsn-{year}.json"
        path.write_text(json.dumps(build_year(year), separators=(",", ":")))
        print(f"{path.name}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    args = [int(a) for a in sys.argv[1:3]] or [2026, 2030]
    main(*args)
