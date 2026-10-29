"""Reference windows by brute force, to test the browser's window finder.

Independent of the browser method: every minute, Sun and Earth az/el come straight from
the full SPICE engine (no sub-point interpolation, no bisection), compared with the same
terrain horizon and DSN files the app uses. Output: web/src/lib/__fixtures__/windows.json

Rules (shared with windows.ts):
  lit     Sun centre above the terrain horizon
  earth   Earth centre above the terrain horizon
  comms   earth AND at least one DSN complex sees the Moon (hourly mask)
  golden  lit AND comms
Usage: python windows_fixture.py
"""
import json

import numpy as np

from ephemeris import sun_earth_altaz
from illumination import horizon_at
from sites import load_sites
from subpoints import OUT_DIR

FIXTURE = OUT_DIR.parent.parent / "src" / "lib" / "__fixtures__" / "windows.json"
SITES = ("shackleton-rim", "im-2", "im-1", "apollo-11", "custom-180")
# a normal month, a year boundary, and a leap day
RANGES = [("2027-01-01T00:00", "2027-02-01T00:00"), ("2027-12-20T00:00", "2028-01-10T00:00"),
          ("2028-02-20T00:00", "2028-03-10T00:00")]
# custom coordinates with no terrain file, next to the +/-180 deg meridian
CUSTOM = {"custom-180": {"id": "custom-180", "lat": -20.0, "lon": 179.9}}
KINDS = ("lit", "earth", "comms", "golden")


def _profile(site_id: str) -> np.ndarray:
    path = OUT_DIR / "horizon" / f"{site_id}.json"
    return np.array(json.loads(path.read_text())["elevation_deg"]) if path.exists() else np.zeros(360)


def _dsn_mask(minutes: np.ndarray) -> np.ndarray:
    hours = minutes.astype("datetime64[h]")
    out = np.zeros(len(minutes), dtype=int)
    for year in np.unique(hours.astype("datetime64[Y]").astype(int) + 1970):
        mask = np.array(json.loads((OUT_DIR / f"dsn-{year}.json").read_text())["mask"])
        sel = hours.astype("datetime64[Y]").astype(int) + 1970 == year
        idx = (hours[sel] - np.datetime64(f"{year}-01-01T00", "h")).astype(int)
        out[sel] = mask[idx]
    return out


def _windows(flag: np.ndarray, minutes: np.ndarray, end: np.datetime64) -> list[dict]:
    """Runs of True as [start, end) in ISO minutes, with clip flags at the range edges."""
    edges = np.flatnonzero(np.diff(np.concatenate([[0], flag.astype(int), [0]])))
    out = []
    for a, b in zip(edges[::2], edges[1::2]):
        stop = minutes[b] if b < len(minutes) else end
        out.append({"start": f"{minutes[a]}Z", "end": f"{stop}Z",
                    "startClipped": bool(a == 0), "endClipped": bool(b == len(minutes))})
    return out


def site_windows(site: dict, start: str, end: str) -> dict:
    minutes = np.arange(np.datetime64(start), np.datetime64(end), np.timedelta64(1, "m"))
    utc = [str(m).replace("T", " ") for m in minutes]
    pos = sun_earth_altaz(site["lat"], site["lon"], utc)
    profile = _profile(site["id"])
    sun_az, sun_el = np.array(pos["sun"]["az"]), np.array(pos["sun"]["el"])
    earth_az, earth_el = np.array(pos["earth"]["az"]), np.array(pos["earth"]["el"])
    lit = sun_el > horizon_at(profile, sun_az)
    earth = earth_el > horizon_at(profile, earth_az)
    comms = earth & (_dsn_mask(minutes) > 0)
    flags = {"lit": lit, "earth": earth, "comms": comms, "golden": lit & comms}
    return {k: _windows(flags[k], minutes, np.datetime64(end)) for k in KINDS}


def main() -> None:
    sites = {s["id"]: s for s in load_sites()} | CUSTOM
    cases = []
    for site_id in SITES:
        for start, end in RANGES:
            cases.append({"site": site_id, "lat": sites[site_id]["lat"], "lon": sites[site_id]["lon"],
                          "start": f"{start}Z", "end": f"{end}Z", "windows": site_windows(sites[site_id], start, end)})
            n = {k: len(v) for k, v in cases[-1]["windows"].items()}
            print(f"{site_id} {start[:10]}..{end[:10]}: {n}")
    FIXTURE.write_text(json.dumps({"source": "brute force, 1-minute SPICE samples (pipeline/windows_fixture.py)",
                                   "cases": cases}, indent=1))


if __name__ == "__main__":
    main()
