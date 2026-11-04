"""The LOLA global map that covers sites outside the polar maps and the SLDEM2015 tiles."""
import numpy as np
import pytest

from dem import GLOBAL, LOLA_DIR, PRODUCTS, SLDEM_TILES, describe_maps, heights_and_maps, load_global, load_tile
from horizon import _distances, destination, horizon_profile

needs_global = pytest.mark.skipif(
    not all((LOLA_DIR / f"{name}.img").exists() for name in (*PRODUCTS, *SLDEM_TILES, *GLOBAL)),
    reason="maps not downloaded (run pipeline/get_dem.py)",
)
GLOBAL_BYTES = 23040 * 46080 * 2
needs_whole_global = pytest.mark.skipif(
    not (LOLA_DIR / "ldem_128.img").exists() or (LOLA_DIR / "ldem_128.img").stat().st_size != GLOBAL_BYTES,
    reason="the global map is still downloading",
)
APOLLO_11 = (0.67416, 23.47314)


def test_map_credits_name_each_map_family_once():
    assert describe_maps(["ldem_875s_20m", "ldem_80s_80m", "ldem_75s_120m"]) == "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)"
    assert describe_maps([SLDEM_TILES[1], SLDEM_TILES[0]]) == "SLDEM2015 (NASA LRO LOLA + JAXA SELENE/Kaguya, 512 pixels per degree)"
    assert describe_maps(["ldem_128"]) == "NASA LRO LOLA global map (ldem_128, 128 pixels per degree)"
    assert describe_maps([SLDEM_TILES[0], "ldem_128"]) == (
        "SLDEM2015 (NASA LRO LOLA + JAXA SELENE/Kaguya, 512 pixels per degree); NASA LRO LOLA global map (ldem_128, 128 pixels per degree)"
    )


def test_no_maps_is_an_error():
    with pytest.raises(ValueError):
        describe_maps([])


@needs_whole_global
def test_the_global_map_follows_its_label():
    dem = load_global("ldem_128")
    assert (dem.lines, dem.samples, dem.resolution, dem.scaling) == (23040, 46080, 128.0, 0.5)
    line, sample = dem.pixel(np.array([90 - 0.5 / 128]), np.array([0.5 / 128]))
    assert (line[0], sample[0]) == pytest.approx((0.0, 0.0), abs=1e-6)


@needs_whole_global
@pytest.mark.parametrize("row,col", [(0, 0), (11519, 23039), (23039, 46079), (8000, 300)])
def test_global_pixel_centres_return_the_stored_value_in_metres(row, col):
    dem = load_global("ldem_128")
    lat, lon = 90 - (row + 0.5) / 128, (col + 0.5) / 128
    assert dem.height(np.array([lat]), np.array([lon]))[0] == pytest.approx(dem.data[row, col] * 0.5, abs=1e-6)


@needs_global
def test_finer_maps_still_come_first():
    _, used = heights_and_maps(np.array([-85.0, *APOLLO_11[:1]]), np.array([30.0, APOLLO_11[1]]))
    assert "ldem_128" not in used
    _, used = heights_and_maps(np.array([-45.0]), np.array([177.0]))
    assert used == ["ldem_128"]


@needs_global
def test_every_point_on_the_moon_now_has_a_height():
    lat = np.linspace(-89.9, 89.9, 300)
    lon = np.linspace(-179.9, 180.0, 300)
    heights, _ = heights_and_maps(*[a.ravel() for a in np.meshgrid(lat, lon)])
    assert np.all(np.isfinite(heights))


@needs_global
@pytest.mark.parametrize("lat,lon", [(0.67, 23.47), (-9.0, 15.5), (20.19, 30.77), (12.0, 5.0)])
def test_the_global_map_agrees_with_sldem2015_on_the_ground(lat, lon):
    coarse = load_global("ldem_128").height(np.array([lat]), np.array([lon]))[0]
    fine = np.nanmax([load_tile(t).height(np.array([lat]), np.array([lon]))[0] for t in SLDEM_TILES])
    assert coarse == pytest.approx(fine, abs=60)


def _sldem(la, lo):
    return np.nanmax([load_tile(t).height(la, lo) for t in SLDEM_TILES], axis=0)


def _beyond(lat, lon, height_fn, min_m):
    """The skyline from terrain at least min_m away, to separate near ground from far."""
    from horizon import LANDER_HEIGHT_M, MOON_RADIUS_M

    dist = _distances()
    lats, lons = destination(lat, lon, np.arange(360.0)[:, None], dist[None, :])
    h = height_fn(lats.ravel(), lons.ravel()).reshape(lats.shape)
    r_obs = MOON_RADIUS_M + height_fn(np.array([lat]), np.array([lon]))[0] + LANDER_HEIGHT_M
    theta = dist / MOON_RADIUS_M
    elev = np.degrees(np.arctan2((MOON_RADIUS_M + h) * np.cos(theta) - r_obs, (MOON_RADIUS_M + h) * np.sin(theta)))
    return np.where(dist[None, :] >= min_m, elev, -90.0).max(axis=1)


@needs_global
def test_the_global_map_is_not_offset():
    """Shifting the coarse map by any part of a pixel only makes it agree worse with SLDEM2015."""
    lons = np.linspace(APOLLO_11[1] - 0.3, APOLLO_11[1] + 0.3, 2000)
    lats = np.full_like(lons, APOLLO_11[0])
    fine = _sldem(lats, lons)
    rms = {shift: np.sqrt(np.mean((load_global("ldem_128").height(lats, lons + shift / 128) - fine) ** 2)) for shift in (-1, -0.5, 0, 0.5, 1)}
    assert min(rms, key=rms.get) == 0


@needs_global
def test_far_skylines_agree_and_near_ground_is_where_the_coarse_map_differs():
    """Measured at Apollo 11, the one site where both maps exist on flat mare.

    The coarse map's pixels are 237 m wide, so slopes within a few hundred metres are smoothed.
    The Sky page tells visitors this, with the figure checked here.
    """
    coarse = load_global("ldem_128").height
    whole = np.abs(horizon_profile(*APOLLO_11, coarse) - horizon_profile(*APOLLO_11, _sldem))
    beyond_1km = np.abs(_beyond(*APOLLO_11, coarse, 1000) - _beyond(*APOLLO_11, _sldem, 1000))
    far = np.abs(_beyond(*APOLLO_11, coarse, 2000) - _beyond(*APOLLO_11, _sldem, 2000))
    # "up to about 2 degrees, mostly from ground within 1 km", as the Sky page says
    assert 1.5 < whole.max() < 2.5
    assert beyond_1km.max() < whole.max() / 4
    assert far.max() < 0.2


@needs_global
@pytest.mark.parametrize("lat,lon", [(26.13, 3.63), (-45.44, 177.6), (41.64, -153.99), (-13.3, 25.25)])
def test_horizon_rays_never_leave_the_maps(lat, lon):
    rays_lat, rays_lon = destination(lat, lon, np.arange(360.0)[:, None], _distances()[None, :])
    heights, _ = heights_and_maps(rays_lat.ravel(), rays_lon.ravel())
    assert np.all(np.isfinite(heights))
