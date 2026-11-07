"""Height maps for the film's surface shots, from the LOLA polar maps (display only).

Two squares, each a 16-bit PNG with metres in heights.json: the Shackleton rim (the second
mission's site) and a crater floor near it (the first mission's site, in the story).
Usage: python film_terrain.py   -> video/film/assets/terrain-<name>.png + terrain.json
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from best_lit_rim import _to_latlon
from dem import MOON_RADIUS_M, height_m

OUT = Path(__file__).parent.parent / "video" / "film" / "assets"
SIZE = 1024
AREAS = {
    # name: (lat, lon, half-width in km)
    "rim": (-89.78, -156.18, 12.0),
    "floor": (-89.66, -129.6, 12.0),
}


def square(lat0: float, lon0: float, half_km: float) -> np.ndarray:
    """Heights on a square in the polar stereographic plane centred on (lat0, lon0)."""
    r = 2 * MOON_RADIUS_M * np.tan(np.pi / 4 + np.radians(lat0) / 2)
    cx, cy = r * np.sin(np.radians(lon0)), r * np.cos(np.radians(lon0))
    axis = (np.arange(SIZE) + 0.5) / SIZE * 2 - 1
    gx, gy = np.meshgrid(cx + axis * half_km * 1000, cy - axis * half_km * 1000)
    lat, lon = _to_latlon(gx.ravel(), gy.ravel())
    h = height_m(lat, lon).reshape(SIZE, SIZE)
    return np.where(np.isfinite(h), h, np.nanmedian(h))


def main() -> None:
    meta = {}
    for name, (lat, lon, half_km) in AREAS.items():
        h = square(lat, lon, half_km)
        low, high = float(h.min()), float(h.max())
        # 16 bits split over red (high byte) and green (low byte): a browser canvas reads 8 bits per channel
        levels = np.round((h - low) / (high - low) * 65535).astype(np.uint32)
        rgb = np.zeros(h.shape + (3,), dtype=np.uint8)
        rgb[..., 0] = levels >> 8
        rgb[..., 1] = levels & 0xFF
        Image.fromarray(rgb, "RGB").save(OUT / f"terrain-{name}.png")
        meta[name] = {"lat": lat, "lon": lon, "half_km": half_km, "size_px": SIZE, "min_m": low, "max_m": high, "centre_m": float(h[SIZE // 2, SIZE // 2])}
        print(name, f"{low:.0f}..{high:.0f} m, centre {meta[name]['centre_m']:.0f} m")
    (OUT / "terrain.json").write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
