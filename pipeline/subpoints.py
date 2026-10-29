"""Hourly sub-solar and sub-Earth points on the Moon, plus distances.

These are the only ephemeris data the browser needs: topocentric_altaz() turns a sub-point
and distance into azimuth/elevation for any site, including Earth parallax. The browser
mirrors that function exactly, and tests check it against the full Skyfield/SPICE result.

Usage: python subpoints.py [first_year last_year]   (default 2026 2030)
"""
import json
import sys
from pathlib import Path

import numpy as np

from ephemeris import _context, _times

MOON_RADIUS_KM = 1737.4  # sphere used by the SPICE latlon site (pck00008)
OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "data"


def subpoints(utc_strings: list[str]) -> dict:
    """Sub-point latitude/longitude (deg, east-positive, -180..180] and distance (km) of Sun and Earth."""
    ts, eph, _, frame = _context()
    t = _times(ts, utc_strings)
    moon = eph["moon"].at(t)
    result = {}
    for name in ("sun", "earth"):
        x, y, z = moon.observe(eph[name]).apparent().frame_xyz(frame).km
        dist = np.sqrt(x * x + y * y + z * z)
        lon = np.degrees(np.arctan2(y, x))
        result[name] = {
            "lat": np.degrees(np.arcsin(z / dist)),
            "lon": np.where(lon <= -180, lon + 360, lon),
            "dist_km": dist,
        }
    return result


def topocentric_altaz(sub_lat, sub_lon, dist_km, site_lat: float, site_lon: float):
    """Azimuth (from north through east) and elevation in degrees, seen from a site on the sphere."""
    slat, slon = np.radians(np.asarray(sub_lat)), np.radians(np.asarray(sub_lon))
    dist = np.asarray(dist_km, dtype=float)
    phi, lam = np.radians(site_lat), np.radians(site_lon)

    up = np.array([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    east = np.array([-np.sin(lam), np.cos(lam), 0.0])
    north = np.array([-np.sin(phi) * np.cos(lam), -np.sin(phi) * np.sin(lam), np.cos(phi)])

    target = dist * np.array([np.cos(slat) * np.cos(slon), np.cos(slat) * np.sin(slon), np.sin(slat)])
    v = target - MOON_RADIUS_KM * up[:, None]
    v_up, v_east, v_north = up @ v, east @ v, north @ v

    el = np.degrees(np.arctan2(v_up, np.hypot(v_east, v_north)))
    az = np.degrees(np.arctan2(v_east, v_north)) % 360
    return az, el


def _hours_of_year(year: int) -> list[str]:
    start = np.datetime64(f"{year}-01-01T00")
    stop = np.datetime64(f"{year + 1}-01-01T00")
    return [str(h).replace("T", " ") + ":00" for h in np.arange(start, stop, np.timedelta64(1, "h"))]


def build_year(year: int) -> dict:
    """One year of hourly sub-points, rounded for a compact JSON file."""
    sub = subpoints(_hours_of_year(year))
    return {
        "start": f"{year}-01-01T00:00Z",
        "step_hours": 1,
        "frame": "MOON_ME_DE421",
        "source": "NASA JPL DE440 + Moon PA DE421 via NAIF SPICE (Skyfield)",
        **{
            body: {
                "lat": np.round(sub[body]["lat"], 4).tolist(),
                "lon": np.round(sub[body]["lon"], 4).tolist(),
                "dist_km": np.round(sub[body]["dist_km"]).astype(int).tolist(),
            }
            for body in ("sun", "earth")
        },
    }


def main(first: int, last: int) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for year in range(first, last + 1):
        path = OUT_DIR / f"subpoints-{year}.json"
        path.write_text(json.dumps(build_year(year), separators=(",", ":")))
        print(f"{path.name}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    args = [int(a) for a in sys.argv[1:3]] or [2026, 2030]
    main(*args)
