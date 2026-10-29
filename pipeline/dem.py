"""Read LRO LOLA south polar elevation maps (PDS polar stereographic, 16-bit).

Heights are metres above the 1737.4 km reference sphere, the same sphere the Sun/Earth
geometry uses. Pixel indices are 0-based; the pole sits at (line_offset, sample_offset).
"""
import re
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from ephemeris import NASA_DATA

LOLA_DIR = NASA_DATA / "lola"
MOON_RADIUS_M = 1737400.0
# finest first: height_m() uses the first grid that covers a point
PRODUCTS = ("ldem_875s_20m", "ldem_80s_80m", "ldem_75s_120m")


@dataclass(frozen=True)
class PolarDem:
    name: str
    lines: int
    samples: int
    scale_m: float
    line_offset: float
    sample_offset: float
    scaling: float
    max_lat: float
    data: np.ndarray

    def pixel(self, lat, lon):
        """Fractional (line, sample) of points given in degrees (east-positive longitude)."""
        r = 2 * MOON_RADIUS_M * np.tan(np.pi / 4 + np.radians(lat) / 2)
        lam = np.radians(lon)
        line = self.line_offset - r * np.cos(lam) / self.scale_m
        sample = self.sample_offset + r * np.sin(lam) / self.scale_m
        return line, sample

    def height(self, lat, lon) -> np.ndarray:
        """Bilinear height in metres; NaN outside this grid."""
        lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
        line, sample = self.pixel(lat, lon)
        i0, j0 = np.floor(line).astype(int), np.floor(sample).astype(int)
        ok = (i0 >= 0) & (i0 < self.lines - 1) & (j0 >= 0) & (j0 < self.samples - 1) & (lat <= self.max_lat)
        out = np.full(lat.shape, np.nan)
        if not ok.any():
            return out
        i, j = i0[ok], j0[ok]
        fi, fj = line[ok] - i, sample[ok] - j
        d = self.data
        top = d[i, j] * (1 - fj) + d[i, j + 1] * fj
        bottom = d[i + 1, j] * (1 - fj) + d[i + 1, j + 1] * fj
        out[ok] = (top * (1 - fi) + bottom * fi) * self.scaling
        return out


def _label_value(text: str, key: str) -> str:
    match = re.search(rf"^\s*{key}\s*=\s*([^\s<]+)", text, re.MULTILINE)
    if not match:
        raise ValueError(f"{key} missing from label")
    return match.group(1).strip("'\"")


@lru_cache(maxsize=None)
def load_dem(name: str) -> PolarDem:
    label = (LOLA_DIR / f"{name}.lbl").read_text(encoding="latin-1")
    if _label_value(label, "SAMPLE_TYPE") != "LSB_INTEGER" or _label_value(label, "SAMPLE_BITS") != "16":
        raise ValueError(f"{name}: unexpected sample format")
    lines, samples = int(_label_value(label, "LINES")), int(_label_value(label, "LINE_SAMPLES"))
    data = np.memmap(LOLA_DIR / f"{name}.img", dtype="<i2", mode="r", shape=(lines, samples))
    return PolarDem(
        name=name,
        lines=lines,
        samples=samples,
        scale_m=float(_label_value(label, "MAP_SCALE")),
        line_offset=float(_label_value(label, "LINE_PROJECTION_OFFSET")),
        sample_offset=float(_label_value(label, "SAMPLE_PROJECTION_OFFSET")),
        scaling=float(_label_value(label, "SCALING_FACTOR")),
        max_lat=float(_label_value(label, "MAXIMUM_LATITUDE")),
        data=data,
    )


def height_m(lat, lon) -> np.ndarray:
    """Height above the reference sphere from the finest LOLA grid covering each point."""
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    out = np.full(lat.shape, np.nan)
    for name in PRODUCTS:
        missing = np.isnan(out)
        if not missing.any():
            break
        out[missing] = load_dem(name).height(lat[missing], lon[missing])
    return out
