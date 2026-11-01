"""Cut the LOLA polar height maps into small tiles, so the browser can compute a horizon anywhere.

A custom site needs full detail only close by. Checked at 32 points from 65 S to the pole against the
full maps: the finest map within 10 km, 240 m or finer within 40 km and 480 m out to 150 km gives
a worst horizon error of 0.061 degrees and 0.14% of sunlit hours in 2027.

Each tile holds the map's own 16-bit values, as differences along each row, gzipped. Neighbouring
tiles share one row and column, so any point can be blended inside a single tile. Coverage stops
at 65 S: rays run 150 km (about 5 degrees), and further north they would leave the maps.

Usage: python height_tiles.py        -> web/public/data/heights/
"""
import gzip
import json

import numpy as np

from best_lit_rim import _to_latlon
from dem import MOON_RADIUS_M, PRODUCTS, height_m, load_dem
from subpoints import OUT_DIR

TILE_CELLS = 512
COVERAGE_LAT = -65.0
FAR_STEP_M = 480.0
FAR_REACH_M = 1_800_000.0
FAR_SCALING = 0.5
NEAR_RADIUS_M = 10_000.0
MID_RADIUS_M = 40_000.0
HEIGHTS_DIR = OUT_DIR / "heights"
MANIFEST = HEIGHTS_DIR / "manifest.json"
# a map is only read where no finer map covers the point, so its middle need not be stored
KEEP_NORTH_OF = {"ldem_75s_120m": -80.0, "ldem_60s_240m": -75.0}
MARGIN_DEG = 0.1


def encode_tile(block: np.ndarray) -> bytes:
    deltas = np.diff(block.astype(np.int32), axis=1, prepend=0).astype("<i2")
    return gzip.compress(deltas.tobytes(), 9, mtime=0)


def decode_tile(blob: bytes, width: int) -> np.ndarray:
    deltas = np.frombuffer(gzip.decompress(blob), dtype="<i2").reshape(-1, width)
    return np.cumsum(deltas.astype(np.int32), axis=1).astype(np.int16)


def tile_window(row: int, column: int, lines: int, samples: int) -> tuple[int, int, int, int]:
    """Top, bottom, left, right of a tile; the bottom and right are exclusive."""
    top, left = row * TILE_CELLS, column * TILE_CELLS
    return top, min(top + TILE_CELLS + 1, lines), left, min(left + TILE_CELLS + 1, samples)


def _corner_latitudes(dem, row: int, column: int) -> np.ndarray:
    top, bottom, left, right = tile_window(row, column, dem.lines, dem.samples)
    lines, samples = np.meshgrid([top, bottom - 1], [left, right - 1])
    x = (samples.ravel() - dem.sample_offset) * dem.scale_m
    y = (dem.line_offset - lines.ravel()) * dem.scale_m
    return _to_latlon(x, y)[0]


def is_kept(dem, row: int, column: int, keep_north_of: float | None) -> bool:
    """False for tiles lying wholly in the area a finer map serves, or outside the map's own limit."""
    top, bottom, left, right = tile_window(row, column, dem.lines, dem.samples)
    if bottom - top < 2 or right - left < 2:
        return False
    corners = _corner_latitudes(dem, row, column)
    centre_x = (dem.sample_offset - left) / (right - left)
    centre_y = (dem.line_offset - top) / (bottom - top)
    holds_pole = 0 <= centre_x <= 1 and 0 <= centre_y <= 1
    northmost = corners.max()
    southmost = -90.0 if holds_pole else corners.min()
    if keep_north_of is not None and northmost < keep_north_of - MARGIN_DEG:
        return False
    return southmost <= dem.max_lat


def far_plane_axis() -> np.ndarray:
    count = int(FAR_REACH_M // FAR_STEP_M)
    return np.arange(-count, count + 1) * FAR_STEP_M


def far_grid_heights(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    lat, lon = _to_latlon(x, y)
    return height_m(lat, lon)


def _write_map_tiles(name: str) -> dict:
    dem = load_dem(name)
    folder = HEIGHTS_DIR / name
    folder.mkdir(parents=True, exist_ok=True)
    kept = []
    for row in range(dem.lines // TILE_CELLS + 1):
        for column in range(dem.samples // TILE_CELLS + 1):
            if not is_kept(dem, row, column, KEEP_NORTH_OF.get(name)):
                continue
            top, bottom, left, right = tile_window(row, column, dem.lines, dem.samples)
            (folder / f"{row}_{column}.i2z").write_bytes(encode_tile(np.asarray(dem.data[top:bottom, left:right])))
            kept.append([row, column])
    return {
        "name": name,
        "lines": dem.lines,
        "samples": dem.samples,
        "scale_m": dem.scale_m,
        "line_offset": dem.line_offset,
        "sample_offset": dem.sample_offset,
        "scaling": dem.scaling,
        "max_lat": dem.max_lat,
        "tiles": kept,
    }


def _write_far_tiles() -> dict:
    axis = far_plane_axis()
    size = len(axis)
    folder = HEIGHTS_DIR / "far"
    folder.mkdir(parents=True, exist_ok=True)
    kept = []
    for row in range((size - 1) // TILE_CELLS + 1):
        for column in range((size - 1) // TILE_CELLS + 1):
            top, bottom, left, right = tile_window(row, column, size, size)
            if bottom - top < 2 or right - left < 2:
                continue
            x, y = np.meshgrid(axis[left:right], -axis[top:bottom])
            heights = far_grid_heights(x.ravel(), y.ravel()).reshape(x.shape)
            if not np.isfinite(heights).any():
                continue
            filled = np.where(np.isfinite(heights), heights, np.nanmedian(heights))
            (folder / f"{row}_{column}.i2z").write_bytes(encode_tile(np.round(filled / FAR_SCALING).astype(np.int16)))
            kept.append([row, column])
    centre = float((size - 1) // 2)
    return {
        "name": "far",
        "lines": size,
        "samples": size,
        "scale_m": FAR_STEP_M,
        "line_offset": centre,
        "sample_offset": centre,
        "scaling": FAR_SCALING,
        "max_lat": COVERAGE_LAT + 10.0,
        "tiles": kept,
    }


def main() -> None:
    products = [_write_map_tiles(name) for name in PRODUCTS]
    products.append(_write_far_tiles())
    MANIFEST.write_text(
        json.dumps(
            {
                "tile_cells": TILE_CELLS,
                "coverage_lat": COVERAGE_LAT,
                "near_radius_m": NEAR_RADIUS_M,
                "mid_radius_m": MID_RADIUS_M,
                "moon_radius_m": MOON_RADIUS_M,
                "products": products,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    total = sum(f.stat().st_size for f in HEIGHTS_DIR.rglob("*") if f.is_file())
    count = sum(1 for f in HEIGHTS_DIR.rglob("*.i2z"))
    largest = max(f.stat().st_size for f in HEIGHTS_DIR.rglob("*.i2z"))
    print(f"{count} tiles, {total / 1e6:.0f} MB, largest {largest / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
