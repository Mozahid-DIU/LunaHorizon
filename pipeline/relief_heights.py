"""Heights of the Atlas map's square for the browser, so it can light the terrain from the real Sun.

The square and its pixels are the same as relief_map.py's image: the top faces longitude 0, the
right faces 90 E, and the edges sit 300 km either side of the pole. Each height is stored in
16 bits across a PNG's red (high byte) and green (low byte) channels, scaled between the minimum
and maximum written to heights.json. Display only; the engine's numbers never read this file.

Usage: python relief_heights.py   -> web/public/data/map/heights.png and heights.json
"""
import json

import numpy as np
from PIL import Image

from dem import MOON_RADIUS_M, height_m
from golden_grid import RADIUS_KM
from relief_map import relief_nodes
from subpoints import OUT_DIR

SIZE_PX = 1024
LEVELS = 65535
OUT_PNG = OUT_DIR / "map" / "heights.png"
OUT_JSON = OUT_DIR / "map" / "heights.json"


def pack(heights: np.ndarray) -> tuple[np.ndarray, float, float]:
    """RGB pixels holding each height in 16 bits, and the heights that 0 and 65535 stand for."""
    low, high = float(np.min(heights)), float(np.max(heights))
    levels = np.round((heights - low) / (high - low) * LEVELS).astype(np.uint32)
    rgb = np.zeros(heights.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = levels >> 8
    rgb[..., 1] = levels & 0xFF
    return rgb, low, high


def unpack(rgb: np.ndarray, low: float, high: float) -> np.ndarray:
    levels = rgb[..., 0].astype(np.float64) * 256 + rgb[..., 1]
    return low + levels / LEVELS * (high - low)


def main() -> None:
    lat, lon = relief_nodes(SIZE_PX)
    heights = height_m(lat.ravel(), lon.ravel()).reshape(lat.shape)
    heights = np.where(np.isfinite(heights), heights, np.nanmedian(heights))
    rgb, low, high = pack(heights)
    Image.fromarray(rgb, "RGB").save(OUT_PNG, optimize=True)
    meta = {
        "size_px": SIZE_PX,
        "radius_km": RADIUS_KM,
        "moon_radius_m": MOON_RADIUS_M,
        "min_m": round(low, 2),
        "max_m": round(high, 2),
        "source": "NASA LRO LOLA polar DEMs, same square as relief.webp",
    }
    OUT_JSON.write_text(json.dumps(meta, indent=1))
    print(f"{OUT_PNG.name}: {OUT_PNG.stat().st_size / 1024:.0f} KB, {low:.0f} to {high:.0f} m")


if __name__ == "__main__":
    main()
