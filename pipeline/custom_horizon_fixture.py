"""Reference horizons from the full height maps, for checking the browser's tile-based horizon.

Usage: python custom_horizon_fixture.py        -> web/src/lib/__fixtures__/custom-horizon.json
"""
import json

import numpy as np

from dem import height_m
from height_tiles import COVERAGE_LAT
from horizon import horizon_profile
from subpoints import OUT_DIR

OUT_FILE = OUT_DIR.parent.parent / "src" / "lib" / "__fixtures__" / "custom-horizon.json"
SEED = 2026
SOUTH_POINTS = 14
NORTH_POINTS = 8
FIXED = ((-89.9, 40.0), (-88.0, 100.0), (-87.5, -60.0), (-80.0, 120.0), (-75.0, -30.0), (COVERAGE_LAT, 10.0))


def points() -> list[tuple[float, float]]:
    rng = np.random.default_rng(SEED)
    south = [(round(float(rng.uniform(-89.5, -80)), 3), round(float(rng.uniform(-180, 180)), 3)) for _ in range(SOUTH_POINTS)]
    north = [(round(float(rng.uniform(-80, COVERAGE_LAT)), 3), round(float(rng.uniform(-180, 180)), 3)) for _ in range(NORTH_POINTS)]
    return [*FIXED, *south, *north]


def main() -> None:
    rows = [
        {"lat": lat, "lon": lon, "ground_m": round(float(height_m(np.array([lat]), np.array([lon]))[0]), 3),
         "elevation_deg": np.round(horizon_profile(lat, lon, height_m), 4).tolist()}
        for lat, lon in points()
    ]
    OUT_FILE.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT_FILE.name}: {len(rows)} points")


if __name__ == "__main__":
    main()
