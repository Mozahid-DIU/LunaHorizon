"""Share of hours the Sun's centre is above the terrain horizon at a site.

Uses the same hourly sub-point files and horizon convention as the web app.
"""
import json
from functools import lru_cache

import numpy as np

from subpoints import OUT_DIR, topocentric_altaz

YEARS = (2026, 2027, 2028, 2029, 2030)


@lru_cache(maxsize=None)
def _sun_track(year: int) -> tuple:
    data = json.loads((OUT_DIR / f"subpoints-{year}.json").read_text())["sun"]
    return tuple(np.array(data[k]) for k in ("lat", "lon", "dist_km"))


def horizon_at(profile, az_deg):
    """Horizon elevation at any azimuth from a 1-degree profile, wrapping at 360."""
    p = np.asarray(profile, dtype=float)
    return np.interp(np.asarray(az_deg) % 360, np.arange(len(p) + 1) * 360 / len(p), np.append(p, p[0]))


def lit_fraction(lat: float, lon: float, profile, years=YEARS) -> float:
    lit = total = 0
    for year in years:
        az, el = topocentric_altaz(*_sun_track(year), lat, lon)
        lit += int(np.sum(el > horizon_at(profile, az)))
        total += len(el)
    return lit / total
