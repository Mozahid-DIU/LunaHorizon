"""SLDEM2015 tile reader and the maps for Apollo 11 and Chandrayaan-3."""
import json

import numpy as np
import pytest

from dem import LOLA_DIR, PRODUCTS, SLDEM_TILES, TileDem, height_m, load_dem, load_tile
from horizon import horizon_profile, maps_for
from subpoints import OUT_DIR

APOLLO_11 = (0.67416, 23.47314)
CHANDRAYAAN_3 = (-69.3741, 32.32)
needs_maps = pytest.mark.skipif(
    not all((LOLA_DIR / f"{name}.img").exists() for name in (*PRODUCTS, *SLDEM_TILES)),
    reason="maps not downloaded (run pipeline/get_dem.py)",
)


def tile(data, north=2.0, west=10.0, resolution=2):
    """A small tile laid out like the PDS files: heights in km, row 0 at the north edge."""
    data = np.asarray(data, dtype=float)
    return TileDem(
        name="test",
        lines=data.shape[0],
        samples=data.shape[1],
        resolution=resolution,
        line_offset=north * resolution - 0.5,
        sample_offset=(180 - west) * resolution - 0.5,
        center_lon=180.0,
        data=data,
    )


def test_pixel_centres_follow_the_pds_layout():
    dem = tile(np.zeros((4, 4)))  # 2 N to 0 N, 10 E to 12 E, half-degree pixels
    line, sample = dem.pixel(np.array([1.75]), np.array([10.25]))
    assert (line[0], sample[0]) == pytest.approx((0.0, 0.0))
    line, sample = dem.pixel(np.array([0.25]), np.array([11.75]))
    assert (line[0], sample[0]) == pytest.approx((3.0, 3.0))


def test_heights_are_metres_and_interpolate_between_pixels():
    dem = tile([[1.0, 2.0], [3.0, 4.0]], north=1.0, west=0.0, resolution=1)
    assert dem.height(np.array([0.5]), np.array([0.5]))[0] == pytest.approx(1000.0)
    assert dem.height(np.array([0.0]), np.array([1.0]))[0] == pytest.approx(2500.0)


def test_negative_longitudes_wrap_to_the_tile():
    dem = tile(np.full((4, 4), 1.0), north=2.0, west=350.0)
    assert dem.height(np.array([1.0]), np.array([-9.0]))[0] == pytest.approx(1000.0)


def test_edge_half_pixel_is_covered_so_two_tiles_leave_no_gap_at_the_equator():
    north = tile(np.full((4, 4), 1.0), north=2.0, west=10.0)
    assert north.height(np.array([0.01]), np.array([11.0]))[0] == pytest.approx(1000.0)


def test_outside_a_tile_is_nan():
    dem = tile(np.zeros((4, 4)))
    assert np.isnan(dem.height(np.array([2.1]), np.array([11.0]))[0])
    assert np.isnan(dem.height(np.array([-0.1]), np.array([11.0]))[0])
    assert np.isnan(dem.height(np.array([1.0]), np.array([12.1]))[0])


@needs_maps
def test_each_site_names_the_maps_its_rays_reach():
    assert maps_for(*APOLLO_11) == "SLDEM2015 (NASA LRO LOLA + JAXA SELENE/Kaguya, 512 pixels per degree)"
    # rays from 69.4 S reach only 74.3 S, short of the 75 S map
    assert maps_for(*CHANDRAYAAN_3) == "NASA LRO LOLA polar DEM (ldem_60s_240m)"
    # rays from 85 S stop at about 80.05 S, inside the 80 S map
    assert maps_for(-85.0, 30.0) == "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m)"


@needs_maps
def test_apollo_11_ground_is_mare_level():
    # regression value from SLDEM2015, compared with the separate LOLA global grid when generated
    h = height_m(np.array([APOLLO_11[0]]), np.array([APOLLO_11[1]]))[0]
    assert h == pytest.approx(-1930, abs=5)


@needs_maps
def test_real_tiles_follow_their_labels():
    north, south = load_tile(SLDEM_TILES[0]), load_tile(SLDEM_TILES[1])
    assert (north.lines, north.samples) == (south.lines, south.samples) == (15360, 23040)
    line, sample = north.pixel(np.array([30.0 - 0.5 / 512]), np.array([0.5 / 512]))
    assert (line[0], sample[0]) == pytest.approx((0.0, 0.0), abs=1e-6)
    line, _ = south.pixel(np.array([-0.5 / 512]), np.array([1.0]))
    assert line[0] == pytest.approx(0.0, abs=1e-6)


@needs_maps
@pytest.mark.parametrize("index,north", [(0, 30.0), (1, 0.0)])
@pytest.mark.parametrize("row,col", [(0, 0), (7000, 13000), (15359, 23039)])
def test_pixel_centres_return_the_stored_value(index, north, row, col):
    dem = load_tile(SLDEM_TILES[index])
    lat, lon = north - (row + 0.5) / 512, (col + 0.5) / 512
    assert dem.height(np.array([lat]), np.array([lon]))[0] == pytest.approx(dem.data[row, col] * 1000.0, abs=1e-3)


@needs_maps
def test_the_equator_seam_has_no_gap():
    lon = np.linspace(19.0, 28.0, 400)
    assert np.all(np.isfinite(height_m(np.zeros(400), lon)))
    assert np.all(np.isfinite(height_m(np.full(400, -0.25 / 512), lon)))


@needs_maps
@pytest.mark.parametrize("lat,lon", [(-76.0, 30.0), (-77.0, 200.0), (-76.5, -60.0)])
def test_the_60s_map_agrees_with_the_75s_map_where_they_overlap(lat, lon):
    fine = load_dem("ldem_75s_120m").height(np.array([lat]), np.array([lon]))[0]
    coarse = load_dem("ldem_60s_240m").height(np.array([lat]), np.array([lon]))[0]
    assert fine == pytest.approx(coarse, abs=30)


@needs_maps
@pytest.mark.parametrize("site", [APOLLO_11, CHANDRAYAAN_3])
def test_every_horizon_direction_reaches_terrain_out_to_the_limit(site):
    from horizon import _distances, destination

    lat, lon = destination(*site, np.arange(360.0)[:, None], _distances()[None, :])
    assert np.all(np.isfinite(height_m(lat.ravel(), lon.ravel())))


@needs_maps
@pytest.mark.parametrize("site_id,site", [("apollo-11", APOLLO_11), ("chandrayaan-3", CHANDRAYAAN_3)])
def test_generated_horizon_is_the_terrain_skyline(site_id, site):
    data = json.loads((OUT_DIR / "horizon" / f"{site_id}.json").read_text())
    assert len(data["elevation_deg"]) == 360
    assert data["source"] == maps_for(*site)
    assert np.array(data["elevation_deg"]) == pytest.approx(horizon_profile(*site, height_m), abs=0.001)
    assert -3 < min(data["elevation_deg"]) and max(data["elevation_deg"]) < 15
