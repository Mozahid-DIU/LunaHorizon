"""Build validation.json for the app's Validation Panel.

Compares our numbers with independent references. Runs offline: JPL Horizons answers are
read from nasa-data/horizons (cached by the tests). Usage: python validation.py
"""
import json
from datetime import date

import numpy as np

from dem import height_m
from dsn import STATIONS, moon_elevation
from ephemeris import NASA_DATA, sun_earth_altaz
from horizon import horizon_profile
from illumination import YEARS, _sun_track, horizon_at
from sites import load_sites
from subpoints import OUT_DIR, topocentric_altaz

HORIZONS_DIR = NASA_DATA / "horizons"
TIMES = ["2027-01-01 00:00", "2027-03-15 06:00", "2027-07-04 12:00", "2028-11-20 18:00"]
# (id, lat, lon): equatorial, mid-latitude and polar reference points, east-positive longitude
HORIZONS_SITES = [
    ("apollo-11", 0.674, 23.473),
    ("chandrayaan-3", -69.37, 32.32),
    ("south-pole-89s", -89.45, 222.69),
]
ANGLE_TOL_DEG = 0.1
BROWSER_TOL_DEG = 0.02
SUN_RADIUS_DEG = 0.27


def angle_diff(a, b):
    return float(np.abs((np.asarray(a) - np.asarray(b) + 180) % 360 - 180))


def _load(name: str) -> list[dict]:
    return json.loads((HORIZONS_DIR / name).read_text())


def _horizons_rows() -> list[dict]:
    rows = []
    for site, lat, lon in HORIZONS_SITES:
        ours = sun_earth_altaz(lat, lon, TIMES)
        for body in ("sun", "earth"):
            for i, ref in enumerate(_load(f"horizons-{site}-{body}.json")):
                az, el = ours[body]["az"][i], ours[body]["el"][i]
                # azimuth is ill-defined near the zenith, so weight it by cos(elevation)
                diff = max(abs(el - ref["el"]), angle_diff(az, ref["az"]) * np.cos(np.radians(ref["el"])))
                rows.append({
                    "site": site, "body": body, "utc": TIMES[i],
                    "ours": {"az": round(az, 5), "el": round(el, 5)},
                    "reference": {"az": ref["az"], "el": ref["el"]},
                    "diff_deg": round(float(diff), 6), "tolerance_deg": ANGLE_TOL_DEG,
                    "pass": bool(diff < ANGLE_TOL_DEG),
                })
    return rows


def _browser_rows() -> list[dict]:
    """The browser's method (hourly sub-point files) against the full SPICE engine."""
    rows = []
    for site in load_sites():
        for utc in TIMES:
            year = int(utc[:4])
            sub = json.loads((OUT_DIR / f"subpoints-{year}.json").read_text())
            hour = int((np.datetime64(utc.replace(" ", "T")) - np.datetime64(f"{year}-01-01T00:00")) / np.timedelta64(1, "h"))
            ref = sun_earth_altaz(site["lat"], site["lon"], [utc])
            worst = 0.0
            for body in ("sun", "earth"):
                b = sub[body]
                az, el = topocentric_altaz([b["lat"][hour]], [b["lon"][hour]], [b["dist_km"][hour]], site["lat"], site["lon"])
                ref_el = ref[body]["el"][0]
                worst = max(worst, abs(el[0] - ref_el), angle_diff(az[0], ref[body]["az"][0]) * np.cos(np.radians(ref_el)))
            rows.append({"site": site["id"], "utc": utc, "diff_deg": round(worst, 6),
                         "tolerance_deg": BROWSER_TOL_DEG, "pass": bool(worst < BROWSER_TOL_DEG)})
    return rows


def _dsn_rows() -> list[dict]:
    rows = []
    for station in STATIONS:
        ours = moon_elevation(station, TIMES)
        for i, ref in enumerate(_load(f"horizons-dsn-{station['id']}-moon.json")):
            diff = abs(float(ours[i]) - ref["el"])
            rows.append({"station": station["name"], "utc": TIMES[i], "ours_el": round(float(ours[i]), 5),
                         "reference_el": ref["el"], "diff_deg": round(diff, 6),
                         "tolerance_deg": ANGLE_TOL_DEG, "pass": bool(diff < ANGLE_TOL_DEG)})
    return rows


def _sunlit_any_part(lat: float, lon: float) -> float:
    profile = horizon_profile(lat, lon, height_m)
    lit = total = 0
    for year in YEARS:
        az, el = topocentric_altaz(*_sun_track(year), lat, lon)
        lit += int(np.sum(el + SUN_RADIUS_DEG > horizon_at(profile, az)))
        total += len(el)
    return lit / total


def _terrain_rows() -> list[dict]:
    im1 = float(height_m(np.array([-80.13]), np.array([1.44]))[0])
    rim = next(s for s in load_sites() if s["id"] == "shackleton-rim")
    lit = _sunlit_any_part(rim["lat"], rim["lon"])
    return [
        {"check": "Ground height at the IM-1 Odysseus landing point (80.13 S, 1.44 E)",
         "ours": round(im1), "reference": 2579, "unit": "m",
         "reference_source": "NASA/GSFC/Arizona State University, LROC (lroc.im-ldi.com/images/1360)",
         "diff": round(abs(im1 - 2579)), "tolerance": 150, "pass": bool(abs(im1 - 2579) < 150)},
        {"check": "Best sunlit share on the Shackleton rim at 2 m height (any part of the Sun)",
         "ours": round(lit * 100, 1), "reference": 92.3, "unit": "%",
         "reference_source": "Glaser et al. 2014, Icarus: best point on the nearby connecting ridge",
         "diff": round(abs(lit * 100 - 92.3), 1), "tolerance": 5.0, "pass": bool(abs(lit * 100 - 92.3) < 5.0)},
    ]


def build_validation() -> dict:
    sections = [
        {"id": "horizons-sun-earth", "title": "Sun and Earth position vs NASA JPL Horizons",
         "method": "Topocentric azimuth/elevation at 3 sites x 4 times; azimuth error weighted by cos(elevation)",
         "rows": _horizons_rows()},
        {"id": "browser-engine", "title": "Browser engine vs full SPICE calculation",
         "method": "Hourly sub-point files (what the web app uses) against Skyfield + SPICE for every curated site",
         "rows": _browser_rows()},
        {"id": "dsn-moon", "title": "Moon elevation from Deep Space Network stations vs NASA JPL Horizons",
         "method": "Goldstone, Madrid, Canberra x 4 times", "rows": _dsn_rows()},
        {"id": "terrain", "title": "Terrain and illumination vs published values",
         "method": "LOLA heights and our sunlit share against LROC and peer-reviewed results", "rows": _terrain_rows()},
    ]
    rows = [r for s in sections for r in s["rows"]]
    angle_rows = [r for s in sections[:3] for r in s["rows"]]
    return {
        "generated": date.today().isoformat(),
        "summary": {"checks": len(rows), "passed": sum(r["pass"] for r in rows),
                    "max_angle_diff_deg": max(r["diff_deg"] for r in angle_rows)},
        "sections": sections,
    }


def main() -> None:
    report = build_validation()
    path = OUT_DIR / "validation.json"
    path.write_text(json.dumps(report, indent=1))
    s = report["summary"]
    print(f"{path.name}: {s['passed']}/{s['checks']} checks pass, max angle diff {s['max_angle_diff_deg']:.6f} deg")


if __name__ == "__main__":
    main()
