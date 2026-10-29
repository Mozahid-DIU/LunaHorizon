"""DSN visibility of the Moon: checked against JPL Horizons and physical sanity limits."""
import json

import numpy as np
import pytest

from dsn import ELEVATION_MASK_DEG, STATIONS, build_year, moon_elevation
from ephemeris import NASA_DATA
from horizons_ref import horizons_altaz

TIMES = ["2027-01-01 00:00", "2027-03-15 06:00", "2027-07-04 12:00", "2028-11-20 18:00"]
FIXTURES = NASA_DATA / "horizons"


def reference(station):
    path = FIXTURES / f"horizons-dsn-{station['id']}-moon.json"
    if not path.exists():
        rows = horizons_altaz("moon", station["lat"], station["lon"], TIMES, observer="earth", alt_km=station["alt_km"])
        path.write_text(json.dumps(rows, indent=1))
    return json.loads(path.read_text())


@pytest.mark.parametrize("station", STATIONS, ids=lambda s: s["id"])
def test_moon_elevation_matches_horizons(station):
    ref = reference(station)
    ours = moon_elevation(station, TIMES)
    for i, row in enumerate(ref):
        assert abs(ours[i] - row["el"]) < 0.05, f"{station['id']} {TIMES[i]}"


def test_year_mask_is_hourly_bitmask():
    year = build_year(2027)
    mask = np.array(year["mask"])
    assert year["start"] == "2027-01-01T00:00Z"
    assert year["elevation_mask_deg"] == ELEVATION_MASK_DEG
    assert len(mask) == 365 * 24
    assert mask.min() >= 0 and mask.max() <= 0b111


def test_coverage_is_plausible():
    mask = np.array(build_year(2027)["mask"])
    for bit, station in enumerate(STATIONS):
        share = np.mean(mask & (1 << bit) > 0)
        # each complex sees the Moon above 10 deg for roughly a third to a half of the time
        assert 0.25 < share < 0.6, f"{station['id']}: {share:.2f}"
    anyone = np.mean(mask > 0)
    # three complexes ~120 deg apart cover most, but not all, hours
    assert 0.7 < anyone < 1.0, f"any station: {anyone:.2f}"
