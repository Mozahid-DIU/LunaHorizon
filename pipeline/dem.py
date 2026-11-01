"""Read lunar elevation maps: LRO LOLA south polar grids and SLDEM2015 tiles.

Polar grids are PDS polar stereographic, 16-bit; the pole sits at (line_offset, sample_offset).
SLDEM2015 tiles are simple cylindrical, 32-bit floats in kilometres. Heights are returned in
metres above the 1737.4 km reference sphere, the same sphere the Sun/Earth geometry uses.
Pixel indices are 0-based.
"""
import re
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from ephemeris import NASA_DATA

LOLA_DIR = NASA_DATA / "lola"
MOON_RADIUS_M = 1737400.0
# finest first: height_m() uses the first grid that covers a point
PRODUCTS = ("ldem_875s_20m", "ldem_80s_80m", "ldem_75s_120m", "ldem_60s_240m")
# SLDEM2015: LOLA + JAXA SELENE/Kaguya at 512 pixels per degree, only the tiles the sites need
SLDEM_TILES = ("sldem2015_512_00n_30n_000_045_float", "sldem2015_512_30s_00s_000_045_float")


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


@dataclass(frozen=True)
class TileDem:
    name: str
    lines: int
    samples: int
    resolution: float  # pixels per degree
    line_offset: float
    sample_offset: float
    center_lon: float
    data: np.ndarray

    def pixel(self, lat, lon):
        """Fractional (line, sample) of points given in degrees (east-positive longitude)."""
        return self.line_offset - lat * self.resolution, self.sample_offset + (lon % 360 - self.center_lon) * self.resolution

    def height(self, lat, lon) -> np.ndarray:
        """Bilinear height in metres; NaN outside this tile.

        The half pixel at each edge holds the edge value, so neighbouring tiles leave no gap.
        """
        lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
        line, sample = self.pixel(lat, lon)
        ok = (line >= -0.5) & (line <= self.lines - 0.5) & (sample >= -0.5) & (sample <= self.samples - 0.5)
        out = np.full(lat.shape, np.nan)
        if not ok.any():
            return out
        line, sample = np.clip(line[ok], 0, self.lines - 1), np.clip(sample[ok], 0, self.samples - 1)
        i, j = np.minimum(line.astype(int), self.lines - 2), np.minimum(sample.astype(int), self.samples - 2)
        fi, fj = line - i, sample - j
        d = self.data
        top = d[i, j] * (1 - fj) + d[i, j + 1] * fj
        bottom = d[i + 1, j] * (1 - fj) + d[i + 1, j + 1] * fj
        out[ok] = (top * (1 - fi) + bottom * fi) * 1000.0
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


@lru_cache(maxsize=None)
def load_tile(name: str) -> TileDem:
    label = (LOLA_DIR / f"{name}.lbl").read_text(encoding="latin-1")
    if _label_value(label, "SAMPLE_TYPE") != "PC_REAL" or _label_value(label, "SAMPLE_BITS") != "32":
        raise ValueError(f"{name}: unexpected sample format")
    lines, samples = int(_label_value(label, "LINES")), int(_label_value(label, "LINE_SAMPLES"))
    data = np.memmap(LOLA_DIR / f"{name}.img", dtype="<f4", mode="r", shape=(lines, samples))
    return TileDem(
        name=name,
        lines=lines,
        samples=samples,
        resolution=float(_label_value(label, "MAP_RESOLUTION")),
        line_offset=float(_label_value(label, "LINE_PROJECTION_OFFSET")),
        sample_offset=float(_label_value(label, "SAMPLE_PROJECTION_OFFSET")),
        center_lon=float(_label_value(label, "CENTER_LONGITUDE")),
        data=data,
    )


def height_m(lat, lon) -> np.ndarray:
    """Height above the reference sphere from the finest map covering each point."""
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    out = np.full(lat.shape, np.nan)
    for load, names in ((load_dem, PRODUCTS), (load_tile, SLDEM_TILES)):
        for name in names:
            missing = np.isnan(out)
            if not missing.any():
                return out
            out[missing] = load(name).height(lat[missing], lon[missing])
    return out


def source_for(lat: float) -> str:
    """The maps behind a site's horizon, for crediting in its data file.

    Rays run 150 km (about 5 degrees of latitude), so a site between 70 S and 80 S uses both
    the 75 S map and the 60 S map.
    """
    if abs(lat) <= 30:
        return "SLDEM2015 (NASA LRO LOLA + JAXA SELENE/Kaguya, 512 pixels per degree)"
    if lat <= -80:
        return "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)"
    if lat <= -70:
        return "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m, ldem_60s_240m)"
    if lat <= -60:
        return "NASA LRO LOLA polar DEM (ldem_60s_240m)"
    raise ValueError(f"no elevation map at latitude {lat}")
