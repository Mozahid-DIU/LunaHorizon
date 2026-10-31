"""Golden Window Map: sunlight, Earth view and Golden share of hours across the south polar region.

Every node gets its own LOLA terrain horizon, then the same hourly rules as the web app:
lit = Sun centre above terrain, earth = Earth centre above terrain, golden = lit AND earth AND
at least one DSN complex sees the Moon. The grid uses the LOLA polar stereographic plane, so it
lines up with LOLA maps: row 0 is +y (towards longitude 0) and the right column is +x (towards
longitude 90 E). Values are per mille of hours (0..1000); null marks nodes outside the circle.

Usage: python golden_grid.py        -> web/public/data/map/golden-grid.json (uses every CPU core)
"""
import json
import time
from functools import lru_cache, partial
from multiprocessing import Pool, cpu_count

import numpy as np

from best_lit_rim import _to_latlon
from dem import height_m
from horizon import horizon_profile
from illumination import YEARS, horizon_at
from subpoints import OUT_DIR, topocentric_altaz

RADIUS_KM = 300                # about 80 S
STEP_KM = 5
POLE_LIMIT_LAT = -89.999       # compass bearings are undefined exactly at the pole


@lru_cache(maxsize=None)
def _year_tracks(year: int) -> tuple:
    data = json.loads((OUT_DIR / f"subpoints-{year}.json").read_text())
    sun, earth = (tuple(np.array(data[body][k]) for k in ("lat", "lon", "dist_km")) for body in ("sun", "earth"))
    mask = np.array(json.loads((OUT_DIR / f"dsn-{year}.json").read_text())["mask"])
    return sun, earth, mask


def grid_nodes(radius_km: float = RADIUS_KM, step_km: float = STEP_KM) -> dict:
    n = round(2 * radius_km / step_km) + 1
    axis = np.arange(n) * step_km - radius_km
    x_km, y_km = np.meshgrid(axis, -axis)
    lat, lon = _to_latlon(x_km * 1000.0, y_km * 1000.0)
    return {"size": n, "x_km": x_km, "y_km": y_km, "lat": lat, "lon": lon, "inside": np.hypot(x_km, y_km) <= radius_km}


def site_stats(lat: float, lon: float, profile, years=YEARS) -> dict:
    """Share of hours with the Sun up, the Earth up, and Golden (both, with a DSN station)."""
    lit = earth = golden = total = 0
    for year in years:
        sun_track, earth_track, mask = _year_tracks(year)
        sun_az, sun_el = topocentric_altaz(*sun_track, lat, lon)
        earth_az, earth_el = topocentric_altaz(*earth_track, lat, lon)
        is_lit = sun_el > horizon_at(profile, sun_az)
        sees_earth = earth_el > horizon_at(profile, earth_az)
        lit += int(np.sum(is_lit))
        earth += int(np.sum(sees_earth))
        golden += int(np.sum(is_lit & sees_earth & (mask > 0)))
        total += len(mask)
    return {"lit": lit / total, "earth": earth / total, "golden": golden / total}


def dem_profile(lat: float, lon: float) -> np.ndarray:
    return horizon_profile(max(lat, POLE_LIMIT_LAT), lon, height_m)


def _node_stats(profile_fn, years, node: tuple) -> dict:
    return site_stats(node[0], node[1], profile_fn(node[0], node[1]), years)


def build_grid(profile_fn, radius_km: float = RADIUS_KM, step_km: float = STEP_KM, years=YEARS, map_fn=map) -> dict:
    grid = grid_nodes(radius_km, step_km)
    inside = grid["inside"].ravel()
    nodes = list(zip(grid["lat"].ravel()[inside].tolist(), grid["lon"].ravel()[inside].tolist()))
    results = iter(map_fn(partial(_node_stats, profile_fn, years), nodes))

    stored = {key: [] for key in ("lit", "earth", "golden")}
    for is_inside in inside.tolist():
        stats = next(results) if is_inside else None
        for key, values in stored.items():
            values.append(None if stats is None else round(stats[key] * 1000))
    return {
        "size": grid["size"],
        "step_km": step_km,
        "radius_km": radius_km,
        "years": list(years),
        "projection": "LOLA south polar stereographic; row 0 = +y, last column = +x, centred on the pole",
        **stored,
        "source": "NASA LRO LOLA polar DEMs, NASA SPICE (DE440), DSN 810-005",
    }


def main() -> None:
    started = time.time()

    def parallel_map(fn, nodes):
        with Pool(cpu_count()) as pool:
            results = []
            for i, result in enumerate(pool.imap(fn, nodes, chunksize=8), start=1):
                results.append(result)
                if i % 500 == 0:
                    print(f"{i}/{len(nodes)} nodes, {(time.time() - started) / 60:.1f} min", flush=True)
            return results

    data = build_grid(dem_profile, map_fn=parallel_map)
    out = OUT_DIR / "map"
    out.mkdir(parents=True, exist_ok=True)
    (out / "golden-grid.json").write_text(json.dumps(data, separators=(",", ":")))
    print(f"done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
