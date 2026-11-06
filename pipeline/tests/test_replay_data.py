"""Mission Replay's data files must match NASA JPL Horizons at each real landing.

Reference az/el were fetched from the JPL Horizons API (horizons_ref.horizons_altaz, airless,
surface observer on body 301) on 6 Nov 2026, at the whole hour nearest each touchdown. The test
reads the generated files in web/public/data/replay, so it also catches a stale or broken file.
"""
import json
from datetime import datetime, timezone

import numpy as np
import pytest

from replay_data import OUT_DIR, REPLAY_YEARS
from subpoints import topocentric_altaz

TOL_DEG = 0.01

# name, lat, lon, UTC hour, body, JPL elevation, JPL azimuth
JPL = [
    ("apollo-11", 0.67416, 23.47314, "1969-07-20 20:00", "sun", 10.5533, 88.804),
    ("apollo-11", 0.67416, 23.47314, "1969-07-20 20:00", "earth", 59.2307, 272.161),
    ("chandrayaan-3", -69.3741, 32.32, "2023-08-23 13:00", "sun", 8.6835, 61.831),
    ("chandrayaan-3", -69.3741, 32.32, "2023-08-23 13:00", "earth", 12.9693, 318.995),
    ("im-1", -80.13, 1.44, "2024-02-22 23:00", "sun", 10.4620, 18.808),
    ("im-1", -80.13, 1.44, "2024-02-22 23:00", "earth", 15.4440, 1.587),
    ("im-2 touchdown", -84.7906, 29.1957, "2025-03-06 17:00", "sun", 2.4450, 65.924),
    ("im-2 touchdown", -84.7906, 29.1957, "2025-03-06 17:00", "earth", 11.1864, 335.833),
    ("blue-ghost-1", 18.5623, 61.8103, "2025-03-16 19:00", "sun", 0.5647, 269.794),
    ("blue-ghost-1", 18.5623, 61.8103, "2025-03-16 19:00", "earth", 27.1315, 263.669),
]


def _read(name: str, year: int) -> dict:
    return json.loads((OUT_DIR / f"{name}-{year}.json").read_text())


@pytest.mark.parametrize("name, lat, lon, hour, body, jpl_el, jpl_az", JPL)
def test_replay_files_match_jpl_horizons(name, lat, lon, hour, body, jpl_el, jpl_az):
    when = datetime.fromisoformat(hour).replace(tzinfo=timezone.utc)
    year = when.year
    index = int((when - datetime(year, 1, 1, tzinfo=timezone.utc)).total_seconds() // 3600)
    track = _read("subpoints", year)[body]
    az, el = topocentric_altaz([track["lat"][index]], [track["lon"][index]], [track["dist_km"][index]], lat, lon)
    assert abs(el[0] - jpl_el) < TOL_DEG
    assert abs((az[0] - jpl_az + 180) % 360 - 180) < TOL_DEG


@pytest.mark.parametrize("year", REPLAY_YEARS)
def test_each_replay_year_has_lined_up_files(year):
    sub, dsn = _read("subpoints", year), _read("dsn", year)
    hours = 24 * (366 if year % 4 == 0 else 365)
    assert sub["start"] == dsn["start"] == f"{year}-01-01T00:00Z"
    assert len(sub["sun"]["lat"]) == len(sub["earth"]["lon"]) == len(dsn["mask"]) == hours
    assert np.all(np.asarray(dsn["mask"]) <= 7)
