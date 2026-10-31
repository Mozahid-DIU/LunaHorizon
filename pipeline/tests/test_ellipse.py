"""Landing ellipse: where the 25 points sit, and that each gets its own correct horizon."""
import json

import numpy as np
import pytest

from ellipse import BEARINGS_DEG, RINGS_M, build_ellipse, ellipse_points
from horizon import MOON_RADIUS_M, horizon_profile
from subpoints import OUT_DIR
from test_horizon import SITE, dip, wall


def arc_m(lat1, lon1, lat2, lon2):
    """Great-circle distance, worked with the haversine formula (independent of destination())."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * MOON_RADIUS_M * np.arcsin(np.sqrt(a))


def flat(lat, lon):
    return np.zeros(np.shape(lat))


def test_there_are_25_points_starting_at_the_centre():
    points = ellipse_points(*SITE)
    assert len(points) == 25
    assert points[0] == {"ring_m": 0, "bearing_deg": 0, "lat": SITE[0], "lon": SITE[1]}


def test_eight_points_on_each_ring():
    points = ellipse_points(*SITE)
    for ring in RINGS_M:
        assert sorted(p["bearing_deg"] for p in points if p["ring_m"] == ring) == sorted(BEARINGS_DEG)


@pytest.mark.parametrize("lat,lon", [SITE, (-89.7804, -156.18), (-84.0, 179.99)])
def test_each_point_is_the_ring_distance_from_the_centre(lat, lon):
    for p in ellipse_points(lat, lon)[1:]:
        assert arc_m(lat, lon, p["lat"], p["lon"]) == pytest.approx(p["ring_m"], abs=0.01)
        assert -180 <= p["lon"] < 180


def test_points_on_a_ring_are_evenly_spread_around_the_centre():
    ring = [p for p in ellipse_points(*SITE) if p["ring_m"] == 1000]
    neighbours = [arc_m(a["lat"], a["lon"], b["lat"], b["lon"]) for a, b in zip(ring, ring[1:] + ring[:1])]
    expected = 2 * 1000 * np.sin(np.radians(22.5))
    assert neighbours == pytest.approx([expected] * 8, abs=0.5)


def test_bearings_point_the_right_way_on_the_compass():
    at = {p["bearing_deg"]: p for p in ellipse_points(*SITE) if p["ring_m"] == 1000}
    assert at[0]["lat"] > SITE[0] > at[180]["lat"]
    assert at[90]["lon"] > SITE[1] > at[270]["lon"]


def test_flat_ground_gives_the_same_horizon_everywhere():
    data = build_ellipse({"id": "x", "lat": SITE[0], "lon": SITE[1]}, flat)
    assert len(data["points"]) == 25
    for p in data["points"]:
        assert len(p["elevation_deg"]) == 360
        assert np.all(np.abs(np.array(p["elevation_deg"]) - dip()) < 0.002)


def test_centre_matches_the_site_horizon_and_ring_points_see_their_own_skyline():
    terrain = wall(10, 1000, 90)
    data = build_ellipse({"id": "x", "lat": SITE[0], "lon": SITE[1]}, terrain)
    centre = data["points"][0]
    assert centre["elevation_deg"] == pytest.approx(horizon_profile(*SITE, terrain).tolist(), abs=0.001)

    at = lambda bearing: next(p for p in data["points"] if p["ring_m"] == 1000 and p["bearing_deg"] == bearing)
    # 1 km towards the wall it looks taller, 1 km away it looks shorter
    assert at(90)["elevation_deg"][90] > centre["elevation_deg"][90] + 0.3
    assert at(270)["elevation_deg"][90] < centre["elevation_deg"][90] - 0.3


def test_output_records_the_layout_and_each_point_ground_height():
    data = build_ellipse({"id": "x", "lat": SITE[0], "lon": SITE[1]}, lambda la, lo: np.full(np.shape(la), 250.0))
    assert data["site"] == "x"
    assert data["rings_m"] == list(RINGS_M)
    assert data["az_step_deg"] == 1
    assert all(p["ground_m"] == 250.0 for p in data["points"])


def test_a_point_without_terrain_is_an_error_not_a_silent_gap():
    def half_map(lat, lon):
        return np.where(np.asarray(lon) > SITE[1], np.nan, 0.0)

    with pytest.raises(ValueError):
        build_ellipse({"id": "x", "lat": SITE[0], "lon": SITE[1]}, half_map)


@pytest.mark.parametrize("site", ["shackleton-rim", "im-1", "im-2"])
def test_generated_file_centre_equals_the_published_site_horizon(site):
    path = OUT_DIR / "horizon" / f"{site}-ellipse.json"
    if not path.exists():
        pytest.skip("ellipse data not generated")
    data = json.loads(path.read_text())
    single = json.loads((OUT_DIR / "horizon" / f"{site}.json").read_text())
    assert len(data["points"]) == 25
    assert data["points"][0]["elevation_deg"] == single["elevation_deg"]
    assert data["points"][0]["ground_m"] == single["ground_m"]
    for stored, expected in zip(data["points"], ellipse_points(data["lat"], data["lon"])):
        assert (stored["ring_m"], stored["bearing_deg"]) == (expected["ring_m"], expected["bearing_deg"])
        assert stored["lat"] == pytest.approx(expected["lat"], abs=1e-6)
        assert stored["lon"] == pytest.approx(expected["lon"], abs=1e-6)
        assert len(stored["elevation_deg"]) == 360
