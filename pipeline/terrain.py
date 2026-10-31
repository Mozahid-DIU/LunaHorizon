"""3D terrain tiles for the Lander's-eye view: nested height grids centred on a site.

Each level is a square grid measured along the surface from the site. Node (row, col) is
x = col·step − half metres east and y = half − row·step metres north. Values are little-endian
int16; each level starts at its offset_bytes in the .bin file.

To rebuild a node (R = 1737400 m, using 64-bit numbers until the last step):
    h = value · height_scale_m + ground_m        height above the R sphere
    d = hypot(x, y), theta = d / R, r = R + h
    east  = r · sin(theta) · x / d
    north = r · sin(theta) · y / d
    up    = r · cos(theta) − (R + ground_m)      add nothing at the ground; the eye is
                                                 observer_height_m above it

Levels overlap: hide the part of each coarser level that a finer level covers. The farthest
level holds the highest point around each node, so distant ridges are not lost between nodes;
doing the same on the middle level pulls nearby peaks towards the lander and makes the skyline
worse. Grids are square, so corners reach 212 km; leave nodes equal to `nodata` out of the
mesh (the map edge).

These tiles are for display. The app's numbers come from the horizon files.

Usage: python terrain.py            -> web/public/data/terrain/<site>.bin and <site>.json
"""
import json

import numpy as np

from horizon import LANDER_HEIGHT_M, destination
from subpoints import OUT_DIR

# (half size m, step m, samples per node along each axis; odd, so they centre on the node):
# sharp around the lander, coarse out to the 150 km horizon limit
LEVELS = ((3_000, 20, 1), (30_000, 200, 1), (150_000, 1_000, 5))
HEIGHT_SCALE_M = 0.5
NODATA = -32768


def grid_points(lat: float, lon: float, half_size_m: float, step_m: float):
    """Latitude, longitude, east and north offsets of every grid node (row 0 = north)."""
    n = round(2 * half_size_m / step_m) + 1
    axis = np.arange(n) * step_m - half_size_m
    x, y = np.meshgrid(axis, -axis)
    bearing = np.degrees(np.arctan2(x, y))
    grid_lat, grid_lon = destination(lat, lon, bearing, np.hypot(x, y))
    return grid_lat, grid_lon, x, y


def node_heights(site: dict, half_size_m: float, step_m: float, oversample: int, height_fn) -> np.ndarray:
    """Highest terrain sampled around each grid node; NaN only where no sample has terrain."""
    fine_step = step_m / oversample
    margin = fine_step * (oversample // 2)
    lat, lon, _, _ = grid_points(site["lat"], site["lon"], half_size_m + margin, fine_step)
    heights = height_fn(lat.ravel(), lon.ravel()).reshape(lat.shape)
    n = lat.shape[0] // oversample
    return np.fmax.reduce(heights.reshape(n, oversample, n, oversample), axis=(1, 3))


def encode_heights(heights: np.ndarray, ground_m: float) -> np.ndarray:
    """Heights relative to the site in HEIGHT_SCALE_M units; NODATA where terrain is missing."""
    steps = np.round((heights - ground_m) / HEIGHT_SCALE_M)
    known = np.isfinite(steps)
    if np.any(np.abs(steps[known]) > 32767):
        raise ValueError("terrain height does not fit in 16 bits")
    return np.where(known, steps, NODATA).astype("<i2")


def build_terrain(site: dict, height_fn) -> tuple[dict, bytes]:
    """The metadata and the binary tiles for one site."""
    raw_ground = float(height_fn(np.array([site["lat"]]), np.array([site["lon"]]))[0])
    if not np.isfinite(raw_ground):
        raise ValueError(f"no terrain data at {site['id']}")
    ground = round(raw_ground, 1)

    levels, chunks, offset = [], [], 0
    for half_size, step, oversample in LEVELS:
        values = encode_heights(node_heights(site, half_size, step, oversample, height_fn), ground)
        chunk = values.tobytes()
        levels.append(
            {"half_size_m": half_size, "step_m": step, "oversample": oversample, "size": values.shape[0], "offset_bytes": offset}
        )
        chunks.append(chunk)
        offset += len(chunk)

    manifest = {
        "site": site["id"],
        "lat": site["lat"],
        "lon": site["lon"],
        "ground_m": ground,
        "observer_height_m": LANDER_HEIGHT_M,
        "height_scale_m": HEIGHT_SCALE_M,
        "nodata": NODATA,
        "levels": levels,
        "source": "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)",
    }
    return manifest, b"".join(chunks)


def main() -> None:
    from dem import height_m
    from sites import load_sites

    out = OUT_DIR / "terrain"
    out.mkdir(parents=True, exist_ok=True)
    for site in load_sites():
        if not np.isfinite(height_m(np.array([site["lat"]]), np.array([site["lon"]]))[0]):
            print(f"skip {site['id']}: outside LOLA polar coverage")
            continue
        manifest, blob = build_terrain(site, height_m)
        (out / f"{site['id']}.bin").write_bytes(blob)
        (out / f"{site['id']}.json").write_text(json.dumps(manifest, separators=(",", ":")))
        missing = int(np.sum(np.frombuffer(blob, dtype="<i2") == NODATA))
        print(f"{site['id']}: {len(blob) / 1024:.0f} KB, {missing} missing nodes")


if __name__ == "__main__":
    main()
