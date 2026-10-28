"""Our Sun/Earth azimuth-elevation must match JPL Horizons within 0.1 degrees."""
import json
from pathlib import Path

import numpy as np
import pytest

from ephemeris import sun_earth_altaz
from horizons_ref import horizons_altaz

FIXTURES = Path(__file__).parent / "fixtures"
TOL_DEG = 0.1

# (name, lat, lon) — east-positive longitude, degrees
SITES = [
    ("apollo-11", 0.674, 23.473),
    ("chandrayaan-3", -69.37, 32.32),
    ("shackleton-rim", -89.45, 222.69),
]
TIMES = ["2027-01-01 00:00", "2027-03-15 06:00", "2027-07-04 12:00", "2028-11-20 18:00"]


def angle_diff(a, b):
    """Smallest difference between two angles in degrees."""
    return abs((a - b + 180) % 360 - 180)


def reference(name, lat, lon, body):
    FIXTURES.mkdir(exist_ok=True)
    path = FIXTURES / f"horizons-{name}-{body}.json"
    if not path.exists():
        rows = horizons_altaz(body, lat, lon, TIMES)
        path.write_text(json.dumps(rows, indent=1))
    return json.loads(path.read_text())


@pytest.mark.parametrize("name,lat,lon", SITES)
@pytest.mark.parametrize("body", ["sun", "earth"])
def test_matches_horizons(name, lat, lon, body):
    ref = reference(name, lat, lon, body)
    ours = sun_earth_altaz(lat, lon, TIMES)[body]
    for i, row in enumerate(ref):
        el_diff = abs(ours["el"][i] - row["el"])
        az_diff = angle_diff(ours["az"][i], row["az"])
        # azimuth is ill-defined near the zenith, so weight it by cos(elevation)
        az_err = az_diff * np.cos(np.radians(row["el"]))
        assert el_diff < TOL_DEG, f"{name} {body} {TIMES[i]}: elevation off by {el_diff:.4f} deg"
        assert az_err < TOL_DEG, f"{name} {body} {TIMES[i]}: azimuth off by {az_diff:.4f} deg"
