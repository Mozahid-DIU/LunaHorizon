"""Golden Window Map: grid layout and the lit / Earth / Golden shares at each node."""
import json

import numpy as np
import pytest

from dem import load_dem, LOLA_DIR, PRODUCTS
from golden_grid import build_grid, grid_nodes, site_stats
from illumination import lit_fraction
from subpoints import OUT_DIR, topocentric_altaz

LOW = np.full(360, -90.0)
HIGH = np.full(360, 90.0)
IM2 = (-84.78, 29.13)


def test_grid_is_square_and_centred_on_the_pole():
    nodes = grid_nodes(radius_km=20, step_km=5)
    assert nodes["size"] == 9
    assert nodes["lat"][4, 4] == pytest.approx(-90.0)
    assert (nodes["x_km"][4, 0], nodes["x_km"][4, 8]) == (-20, 20)
    assert (nodes["y_km"][0, 4], nodes["y_km"][8, 4]) == (20, -20)


def test_nodes_outside_the_circle_are_excluded():
    nodes = grid_nodes(radius_km=20, step_km=5)
    assert not nodes["inside"][0, 0]
    assert nodes["inside"][0, 4] and nodes["inside"][4, 0] and nodes["inside"][4, 4]


@pytest.mark.skipif(not (LOLA_DIR / f"{PRODUCTS[2]}.lbl").exists(), reason="LOLA labels not downloaded")
def test_nodes_land_on_the_lola_map_where_the_grid_says():
    """Row and column must run the same way as the DEM, so the map lines up with LOLA images."""
    dem = load_dem(PRODUCTS[2])
    nodes = grid_nodes(radius_km=300, step_km=50)
    line, sample = dem.pixel(nodes["lat"], nodes["lon"])
    assert sample - dem.sample_offset == pytest.approx(nodes["x_km"] * 1000 / dem.scale_m, abs=1e-6)
    assert dem.line_offset - line == pytest.approx(nodes["y_km"] * 1000 / dem.scale_m, abs=1e-6)


def test_terrain_above_everything_means_no_sun_and_no_earth():
    assert site_stats(*IM2, HIGH, [2027]) == {"lit": 0.0, "earth": 0.0, "golden": 0.0}


def test_lit_share_equals_the_existing_illumination_code():
    assert site_stats(*IM2, LOW, [2027])["lit"] == 1.0
    profile = np.linspace(-1, 2, 360)
    assert site_stats(*IM2, profile, [2027])["lit"] == pytest.approx(lit_fraction(*IM2, profile, [2027]))


def test_far_side_never_sees_earth():
    stats = site_stats(0.0, 180.0, np.zeros(360), [2027])
    assert stats["earth"] == 0.0 and stats["golden"] == 0.0
    assert stats["lit"] == pytest.approx(0.5, abs=0.05)


def test_golden_is_lit_and_earth_and_a_dsn_station_hour_by_hour():
    data = json.loads((OUT_DIR / "subpoints-2027.json").read_text())
    mask = np.array(json.loads((OUT_DIR / "dsn-2027.json").read_text())["mask"])
    profile = np.zeros(360)
    tracks = {b: tuple(np.array(data[b][k]) for k in ("lat", "lon", "dist_km")) for b in ("sun", "earth")}
    _, sun_el = topocentric_altaz(*tracks["sun"], *IM2)
    _, earth_el = topocentric_altaz(*tracks["earth"], *IM2)
    expected = np.mean((sun_el > 0) & (earth_el > 0) & (mask > 0))

    stats = site_stats(*IM2, profile, [2027])
    assert stats["golden"] == pytest.approx(expected, abs=1e-12)
    assert 0 < stats["golden"] < min(stats["lit"], stats["earth"])


def test_build_grid_stores_per_mille_values_and_nulls_outside():
    calls = []

    def profile_fn(lat, lon):
        calls.append((lat, lon))
        return LOW

    data = build_grid(profile_fn, radius_km=20, step_km=10, years=[2027])
    assert data["size"] == 5 and data["step_km"] == 10
    assert len(data["golden"]) == 25
    assert data["lit"][0] is None  # the corner is outside the circle
    assert data["lit"][12] == 1000  # pole with no terrain: Sun always above -90 deg
    assert len(calls) == sum(v is not None for v in data["lit"])
    assert all(isinstance(v, int) for v in data["golden"] if v is not None)


def test_rows_are_stored_north_first():
    seen = []

    def profile_fn(lat, lon):
        seen.append((lat, lon))
        return HIGH if lon == 0 and lat > -90 else LOW  # only the +y arm is walled in

    data = build_grid(profile_fn, radius_km=20, step_km=10, years=[2027])
    assert data["lit"][2] == 0  # row 0, middle column: +y
    assert data["lit"][22] == 1000  # last row, middle column: -y


def test_generated_map_is_sane():
    path = OUT_DIR / "map" / "golden-grid.json"
    if not path.exists():
        pytest.skip("map not generated")
    data = json.loads(path.read_text())
    n = data["size"]
    for key in ("lit", "earth", "golden"):
        assert len(data[key]) == n * n
    for lit, earth, golden in zip(data["lit"], data["earth"], data["golden"]):
        if lit is None:
            assert earth is None and golden is None
        else:
            assert 0 <= golden <= min(lit, earth) <= 1000
