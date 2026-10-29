"""LOLA polar DEM reader: projection and heights checked against independent facts."""
import numpy as np
import pytest

from dem import LOLA_DIR, PRODUCTS, height_m, load_dem

pytestmark = pytest.mark.skipif(
    not all((LOLA_DIR / f"{p}.img").exists() for p in PRODUCTS),
    reason="LOLA DEMs not downloaded (run pipeline/get_dem.py)",
)

SHACKLETON_CENTRE = (-89.67, 129.78)  # IAU Gazetteer


def test_pole_maps_to_grid_centre():
    dem = load_dem("ldem_875s_20m")
    line, sample = dem.pixel(np.array([-90.0]), np.array([0.0]))
    assert line[0] == pytest.approx(dem.line_offset)
    assert sample[0] == pytest.approx(dem.sample_offset)


def test_im1_landing_elevation_matches_lroc():
    # LROC: Odysseus came to rest at 80.13 S, 1.44 E, 2579 m elevation
    h = height_m(np.array([-80.13]), np.array([1.44]))[0]
    assert h == pytest.approx(2579, abs=150)


def _offset(lat, lon, dx_km, dy_km):
    """Move a point by (dx, dy) km in the south polar stereographic plane."""
    two_r = 2 * 1737.4
    r = two_r * np.tan(np.pi / 4 + np.radians(lat) / 2)
    x, y = r * np.sin(np.radians(lon)) + dx_km, r * np.cos(np.radians(lon)) + dy_km
    return np.degrees(2 * np.arctan(np.hypot(x, y) / two_r) - np.pi / 2), np.degrees(np.arctan2(x, y))


def test_shackleton_floor_is_deep():
    lat, lon = SHACKLETON_CENTRE
    floor = height_m(np.array([lat]), np.array([lon]))[0]
    # four points 15 km from the centre, outside the ~10.5 km rim radius
    ring = [_offset(lat, lon, dx, dy) for dx, dy in ((15, 0), (-15, 0), (0, 15), (0, -15))]
    ring_h = height_m(np.array([p[0] for p in ring]), np.array([p[1] for p in ring]))
    # Shackleton is ~4 km deep rim to floor; a mirrored projection lands on high ground instead
    assert floor < -2000, f"floor {floor:.0f} m"
    assert np.all(ring_h - floor > 2500), f"ring {ring_h.round()} vs floor {floor:.0f}"


@pytest.mark.parametrize("lat,lon", [(-88.0, 45.0), (-88.5, -120.0), (-89.2, 200.0)])
def test_overlapping_dems_agree(lat, lon):
    fine = load_dem("ldem_875s_20m").height(np.array([lat]), np.array([lon]))[0]
    coarse = load_dem("ldem_80s_80m").height(np.array([lat]), np.array([lon]))[0]
    assert fine == pytest.approx(coarse, abs=120)


def test_outside_coverage_is_nan():
    assert np.isnan(load_dem("ldem_875s_20m").height(np.array([-80.0]), np.array([0.0]))[0])


def test_height_picks_finest_available():
    assert not np.isnan(height_m(np.array([-76.0]), np.array([10.0]))[0])
    assert np.isnan(height_m(np.array([-60.0]), np.array([10.0]))[0])
