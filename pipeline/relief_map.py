"""Shaded relief image of the south polar region for the Atlas page, from the LOLA height maps.

The image covers the Golden Window Map's square in the same plane: the top faces longitude 0,
the right faces 90 E, and its edges sit exactly 300 km either side of the pole. The light is a
fixed raking light chosen to show craters; it is not the real sunlight at any time. Display only.

Usage: python relief_map.py        -> web/public/data/map/relief.webp
"""
import numpy as np
from PIL import Image

from best_lit_rim import _to_latlon
from dem import height_m
from golden_grid import RADIUS_KM
from subpoints import OUT_DIR

SIZE_PX = 1600
QUALITY = 55
RELIEF_EXAGGERATION = 3.0
LIGHT = (-0.62, 0.62, 0.48)    # east, north and up parts; from the upper left of the image
GAMMA = 0.9
OUT_FILE = OUT_DIR / "map" / "relief.webp"


def pixel_axis(size: int) -> np.ndarray:
    """Pixel centres in km; the outer edges of the first and last pixels sit on the map's edge."""
    return ((np.arange(size) + 0.5) / size * 2 - 1) * RADIUS_KM


def relief_nodes(size: int) -> tuple[np.ndarray, np.ndarray]:
    axis = pixel_axis(size)
    x_km, y_km = np.meshgrid(axis, -axis)
    return _to_latlon(x_km * 1000.0, y_km * 1000.0)


def shaded_relief(heights: np.ndarray, step_m: float) -> np.ndarray:
    """Brightness 0..1 from heights whose row 0 is the +y side."""
    row_slope, east_slope = np.gradient(heights, step_m)
    north_slope = -row_slope
    nx, ny = -east_slope * RELIEF_EXAGGERATION, -north_slope * RELIEF_EXAGGERATION
    lx, ly, lz = LIGHT
    return np.clip((nx * lx + ny * ly + lz) / np.sqrt(1 + nx**2 + ny**2), 0, 1)


def main() -> None:
    lat, lon = relief_nodes(SIZE_PX)
    heights = height_m(lat.ravel(), lon.ravel()).reshape(lat.shape)
    heights = np.where(np.isfinite(heights), heights, np.nanmedian(heights))
    shade = shaded_relief(heights, step_m=2 * RADIUS_KM * 1000.0 / SIZE_PX)
    pixels = np.uint8(np.round(shade**GAMMA * 255))
    OUT_FILE.parent.mkdir(exist_ok=True)
    Image.fromarray(pixels).save(OUT_FILE, quality=QUALITY, method=6)
    print(f"{OUT_FILE.name}: {OUT_FILE.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
