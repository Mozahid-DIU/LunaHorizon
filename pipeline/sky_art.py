"""Lander's-eye terrain art for Sky View: a 360 degree panorama of each site from the height maps.

Columns run around the compass from north through east. Rows use the same softened elevation
scale as the web page, which stretches the view near the horizon: asinh(elevation / softness).
The light comes from the viewer, because one image has to serve every date; it is not the real
sunlight at any time. Display only: the page trims the top of this art to the engine's horizon.

Usage: python sky_art.py        -> web/public/data/sky/<site>.webp, web/src/data/sky-art.json
"""
import json

import numpy as np
from PIL import Image

from dem import height_m
from horizon import LANDER_HEIGHT_M, MOON_RADIUS_M, _distances, destination
from sites import load_sites
from subpoints import OUT_DIR

SOFTNESS_DEG = 4.0
EL_BOTTOM = -8.0
EL_TOP = 12.0              # above the highest skyline of any demo site (IM-1, 10.9 degrees)
WIDTH_PX = 2880
HEIGHT_PX = 640
QUALITY = 60
BATCH_COLUMNS = 160
FLAT_LEVEL = 0.32
FACING_GAIN = 1.5
SIDE_GAIN = 1.5
FAR_FADE = 0.3
NEAR_LEVEL = 0.12
NEAR_FADE_M = 8000.0       # the height maps are too coarse to show close ground in detail
BASE = 0.05
OUT_DIR_SKY = OUT_DIR / "sky"
META_FILE = OUT_DIR.parent.parent / "src" / "data" / "sky-art.json"
META = {"softness_deg": SOFTNESS_DEG, "el_bottom": EL_BOTTOM, "el_top": EL_TOP, "width": WIDTH_PX, "height": HEIGHT_PX}


def column_azimuths(width: int) -> np.ndarray:
    return (np.arange(width) + 0.5) * 360.0 / width


def row_elevations(height: int) -> np.ndarray:
    top, bottom = np.arcsinh(np.array([EL_TOP, EL_BOTTOM]) / SOFTNESS_DEG)
    return np.sinh(top + (np.arange(height) + 0.5) / height * (bottom - top)) * SOFTNESS_DEG


def _shade(heights: np.ndarray, step_rad: float, dist: np.ndarray) -> np.ndarray:
    """How directly each ground sample faces the viewer, 0..1, faded with distance."""
    curved = heights - dist**2 / (2 * MOON_RADIUS_M)
    along = np.gradient(curved, dist, axis=1)
    across = np.gradient(curved, axis=0) / (dist * step_rad) if len(heights) > 1 else 0.0
    # the light sits behind the viewer and a little to one side, so slopes show as relief
    facing = FLAT_LEVEL + (along * FACING_GAIN + across * SIDE_GAIN) / np.sqrt(1 + along**2 + across**2)
    fade = 1 - FAR_FADE * np.clip(dist / dist[-1], 0, 1) ** 0.5
    near = NEAR_LEVEL + (1 - NEAR_LEVEL) * np.clip(dist / NEAR_FADE_M, 0, 1)
    return np.clip(facing, 0, 1) * fade * near


def panorama(lat: float, lon: float, height_fn, width: int = WIDTH_PX, height: int = HEIGHT_PX, observer_height_m: float = LANDER_HEIGHT_M) -> np.ndarray:
    """Brightness 0..1 by row and column; 0 where no terrain reaches that direction."""
    ground = float(height_fn(np.array([lat]), np.array([lon]))[0])
    dist = _distances()
    azimuths = column_azimuths(width)
    rows = row_elevations(height)
    observer_r = MOON_RADIUS_M + ground + observer_height_m
    theta = dist / MOON_RADIUS_M
    image = np.zeros((height, width))

    for start in range(0, width, BATCH_COLUMNS):
        az = azimuths[start : start + BATCH_COLUMNS]
        lats, lons = destination(lat, lon, az[:, None], dist[None, :])
        heights = np.nan_to_num(height_fn(lats.ravel(), lons.ravel()).reshape(lats.shape), nan=ground)
        target_r = MOON_RADIUS_M + heights
        elevation = np.degrees(np.arctan2(target_r * np.cos(theta) - observer_r, target_r * np.sin(theta)))
        light = _shade(heights, np.radians(360.0 / width), dist)
        for i in range(len(az)):
            skyline = np.maximum.accumulate(elevation[i])
            nearest = np.searchsorted(skyline, rows)
            is_terrain = nearest < len(dist)
            image[is_terrain, start + i] = BASE + (1 - BASE) * light[i, nearest[is_terrain]]
    return image


def main() -> None:
    OUT_DIR_SKY.mkdir(exist_ok=True)
    for site in load_sites():
        pixels = np.uint8(np.round(panorama(site["lat"], site["lon"], height_m) * 255))
        path = OUT_DIR_SKY / f"{site['id']}.webp"
        Image.fromarray(pixels).save(path, quality=QUALITY, method=6)
        print(f"{path.name}: {path.stat().st_size / 1024:.0f} KB")
    META_FILE.write_text(json.dumps(META, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
