"""Sub-solar / sub-Earth points must reproduce the full ephemeris for any site.

The browser computes az/el from these points, so this is the contract it relies on.
"""
import numpy as np
import pytest

from ephemeris import sun_earth_altaz
from sites import load_sites
from subpoints import build_year, subpoints, topocentric_altaz

TOL_DEG = 0.01
RNG = np.random.default_rng(42)
RANDOM_TIMES = [
    f"{y}-{m:02d}-{d:02d} {h:02d}:00"
    for y, m, d, h in zip(
        RNG.integers(2026, 2031, 10), RNG.integers(1, 13, 10), RNG.integers(1, 29, 10), RNG.integers(0, 24, 10)
    )
]


def angle_diff(a, b):
    return np.abs((np.asarray(a) - np.asarray(b) + 180) % 360 - 180)


@pytest.mark.parametrize("site", load_sites(), ids=lambda s: s["id"])
@pytest.mark.parametrize("body", ["sun", "earth"])
def test_subpoints_reproduce_ephemeris(site, body):
    sub = subpoints(RANDOM_TIMES)[body]
    az, el = topocentric_altaz(sub["lat"], sub["lon"], sub["dist_km"], site["lat"], site["lon"])
    ref = sun_earth_altaz(site["lat"], site["lon"], RANDOM_TIMES)[body]
    el_err = np.abs(el - np.array(ref["el"]))
    az_err = angle_diff(az, ref["az"]) * np.cos(np.radians(ref["el"]))
    assert el_err.max() < TOL_DEG, f"elevation off by {el_err.max():.5f} deg"
    assert az_err.max() < TOL_DEG, f"azimuth off by {az_err.max():.5f} deg"


def test_target_overhead():
    az, el = topocentric_altaz([10.0], [20.0], [1e9], 10.0, 20.0)
    assert el[0] == pytest.approx(90, abs=1e-6)


def test_target_on_east_horizon():
    az, el = topocentric_altaz([0.0], [90.0], [1e12], 0.0, 0.0)
    assert el[0] == pytest.approx(0, abs=1e-6)
    assert az[0] == pytest.approx(90, abs=1e-6)


def test_physical_ranges():
    sub = subpoints(RANDOM_TIMES)
    # lunar equator is tilted ~1.54 deg to the ecliptic
    assert np.all(np.abs(sub["sun"]["lat"]) < 1.7)
    # optical libration keeps Earth within ~7-8 deg of the sub-Earth mean point
    assert np.all(np.abs(sub["earth"]["lat"]) < 7.5)
    assert np.all(np.abs(sub["earth"]["lon"]) < 8.5)
    assert np.all((sub["earth"]["dist_km"] > 350_000) & (sub["earth"]["dist_km"] < 410_000))


def test_build_year_is_hourly():
    year = build_year(2028)  # leap year
    assert year["start"] == "2028-01-01T00:00Z"
    assert year["step_hours"] == 1
    for body in ("sun", "earth"):
        for key in ("lat", "lon", "dist_km"):
            assert len(year[body][key]) == 366 * 24
