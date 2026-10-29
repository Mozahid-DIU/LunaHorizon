"""Our Sun/Earth azimuth-elevation must match JPL Horizons within 0.1 degrees."""
import json

import numpy as np
import pytest

from ephemeris import sun_earth_altaz
from horizons_ref import horizons_altaz
from validation import ANGLE_TOL_DEG, HORIZONS_DIR, HORIZONS_SITES, TIMES

FIXTURES = HORIZONS_DIR
TOL_DEG = ANGLE_TOL_DEG
SITES = HORIZONS_SITES


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
