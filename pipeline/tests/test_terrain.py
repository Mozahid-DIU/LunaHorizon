"""3D terrain tiles: grid layout, height encoding, and that the tiles reproduce the horizon."""
import json

import numpy as np
import pytest

from dem import LOLA_DIR, PRODUCTS
from horizon import LANDER_HEIGHT_M, MOON_RADIUS_M, destination, horizon_profile
from illumination import lit_fraction
from subpoints import OUT_DIR
from terrain import HEIGHT_SCALE_M, LEVELS, NODATA, build_terrain, encode_heights, grid_points
from test_horizon import SITE, wall

SITE_DICT = {"id": "x", "lat": SITE[0], "lon": SITE[1]}


def flat(lat, lon):
    return np.zeros(np.shape(lat))


def read_level(manifest, blob, index):
    level = manifest["levels"][index]
    n = level["size"]
    return np.frombuffer(blob, dtype="<i2", count=n * n, offset=level["offset_bytes"]).reshape(n, n)


def skyline(manifest, blob, n_azimuths=360):
    """Highest terrain angle per azimuth using only the tile data and the documented layout."""
    best = np.full(n_azimuths, -90.0)
    ground = manifest["ground_m"]
    r_obs = MOON_RADIUS_M + ground + manifest["observer_height_m"]
    for i, level in enumerate(manifest["levels"]):
        half, step = level["half_size_m"], level["step_m"]
        axis = np.arange(level["size"]) * step - half
        x, y = np.meshgrid(axis, -axis)
        values = read_level(manifest, blob, i)
        ok = (values != manifest["nodata"]) & (np.hypot(x, y) > 0)
        dist = np.hypot(x, y)[ok]
        h = values[ok] * manifest["height_scale_m"] + ground
        theta, r_t = dist / MOON_RADIUS_M, MOON_RADIUS_M + h
        angle = np.degrees(np.arctan2(r_t * np.cos(theta) - r_obs, r_t * np.sin(theta)))
        az = np.degrees(np.arctan2(x[ok], y[ok])) % 360
        np.maximum.at(best, np.round(az * n_azimuths / 360).astype(int) % n_azimuths, angle)
    return best


def test_grid_is_centred_with_north_up_and_east_right():
    lat, lon, x, y = grid_points(*SITE, half_size_m=1000, step_m=500)
    assert lat.shape == (5, 5)
    assert (lat[2, 2], lon[2, 2]) == pytest.approx(SITE, abs=1e-9)
    assert (x[2, 0], x[2, 4]) == (-1000, 1000)
    assert (y[0, 2], y[4, 2]) == (1000, -1000)
    north = destination(*SITE, 0.0, 1000.0)
    east = destination(*SITE, 90.0, 1000.0)
    assert (lat[0, 2], lon[0, 2]) == pytest.approx((float(north[0]), float(north[1])), abs=1e-9)
    assert (lat[2, 4], lon[2, 4]) == pytest.approx((float(east[0]), float(east[1])), abs=1e-9)


def test_grid_corner_is_the_diagonal_distance_along_the_surface():
    lat, lon, _, _ = grid_points(*SITE, half_size_m=3000, step_m=3000)
    expected = destination(*SITE, 45.0, 3000 * np.sqrt(2))
    assert (lat[0, 2], lon[0, 2]) == pytest.approx((float(expected[0]), float(expected[1])), abs=1e-9)


def test_heights_are_stored_relative_to_the_site_in_half_metres():
    values = encode_heights(np.array([100.0, 100.5, 99.0, 1100.0]), ground_m=100.0)
    assert values.dtype == np.dtype("<i2")
    assert values.tolist() == [0, 1, -2, 2000]
    assert HEIGHT_SCALE_M == 0.5


def test_missing_terrain_becomes_nodata():
    assert encode_heights(np.array([np.nan, 0.0]), ground_m=0.0).tolist() == [NODATA, 0]


def test_heights_too_large_for_16_bits_are_an_error():
    with pytest.raises(ValueError):
        encode_heights(np.array([20_000.0]), ground_m=0.0)


def test_each_level_is_301_square_and_the_file_has_exactly_the_stated_bytes():
    manifest, blob = build_terrain(SITE_DICT, flat)
    assert [(lv["half_size_m"], lv["step_m"], lv["oversample"]) for lv in manifest["levels"]] == list(LEVELS)
    assert all(lv["size"] == 301 for lv in manifest["levels"])
    assert [lv["offset_bytes"] for lv in manifest["levels"]] == [0, 181202, 362404]
    assert len(blob) == 3 * 301 * 301 * 2


def test_the_site_is_height_zero_and_a_slope_keeps_its_direction():
    def tilted(lat, lon):
        return (np.asarray(lat) - SITE[0]) * 1000.0  # rises towards the north

    manifest, blob = build_terrain(SITE_DICT, tilted)
    near = read_level(manifest, blob, 0)
    assert near[150, 150] == 0
    assert near[0, 150] > 0 > near[300, 150]
    assert abs(int(near[150, 0])) < abs(int(near[0, 150]))


@pytest.mark.parametrize("distance_km,height_m", [(1, 100), (10, 1000), (100, 15000)])
def test_tiles_reproduce_a_wall_at_each_level_on_raised_ground(distance_km, height_m):
    raised = lambda lat, lon: wall(distance_km, height_m, 90, half_width_deg=5.0)(lat, lon) + 300.0
    manifest, blob = build_terrain(SITE_DICT, raised)
    assert manifest["ground_m"] == 300.0
    sky = skyline(manifest, blob)
    true = horizon_profile(*SITE, raised)
    assert sky[90] == pytest.approx(true[90], abs=0.15)
    assert sky[270] == pytest.approx(true[270], abs=0.15)  # the wall is east, not mirrored west


def test_coarse_levels_keep_a_peak_narrower_than_their_step():
    # 200 m radius, 100.5 km east of the site: halfway between two 1 km grid nodes
    peak_lat, peak_lon = (float(v) for v in destination(*SITE, 90.0, 100_500.0))

    def peak(lat, lon):
        p1, p2 = np.radians(peak_lat), np.radians(np.asarray(lat))
        a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(np.asarray(lon) - peak_lon) / 2) ** 2
        return np.where(2 * MOON_RADIUS_M * np.arcsin(np.sqrt(a)) < 200, 15000.0, 0.0)

    manifest, blob = build_terrain(SITE_DICT, peak)
    assert read_level(manifest, blob, 2).max() == 30000


def test_missing_terrain_stays_missing_in_the_tiles():
    def no_far_south(lat, lon):
        return np.where(np.asarray(lat) < SITE[0] - 1, np.nan, 0.0)

    manifest, blob = build_terrain(SITE_DICT, no_far_south)
    far = read_level(manifest, blob, 2)
    assert far[300, 150] == NODATA
    assert far[0, 150] == 0


def test_manifest_ground_is_the_exact_reference_of_the_tiles():
    manifest, blob = build_terrain(SITE_DICT, lambda la, lo: np.full(np.shape(la), 100.26))
    assert manifest["ground_m"] == 100.3
    assert np.all(read_level(manifest, blob, 0) == 0)


@pytest.mark.parametrize("site", ["shackleton-rim", "im-1", "im-2"])
def test_generated_tiles_match_the_published_horizon(site):
    meta_path = OUT_DIR / "terrain" / f"{site}.json"
    if not meta_path.exists():
        pytest.skip("terrain data not generated")
    manifest = json.loads(meta_path.read_text())
    blob = (OUT_DIR / "terrain" / f"{site}.bin").read_bytes()
    single = json.loads((OUT_DIR / "horizon" / f"{site}.json").read_text())

    assert len(blob) == sum(lv["size"] ** 2 * 2 for lv in manifest["levels"])
    assert manifest["ground_m"] == single["ground_m"]
    assert manifest["observer_height_m"] == LANDER_HEIGHT_M

    diff = skyline(manifest, blob) - np.array(single["elevation_deg"])
    assert np.median(np.abs(diff)) < 0.15
    assert np.percentile(np.abs(diff), 95) < 0.7
    # what matters for the display: sunlight from the tiles agrees with the horizon
    tiles = lit_fraction(manifest["lat"], manifest["lon"], skyline(manifest, blob), [2027])
    published = lit_fraction(manifest["lat"], manifest["lon"], np.array(single["elevation_deg"]), [2027])
    assert abs(tiles - published) < 0.005


@pytest.mark.parametrize("site", ["shackleton-rim", "im-1", "im-2"])
@pytest.mark.parametrize("index", [0, 1, 2])
def test_each_generated_level_decodes_to_real_terrain_at_its_own_nodes(site, index):
    """Catches a wrong offset or size for one level, which the skyline can hide."""
    if not all((LOLA_DIR / f"{p}.img").exists() for p in PRODUCTS):
        pytest.skip("LOLA DEMs not downloaded")
    meta_path = OUT_DIR / "terrain" / f"{site}.json"
    if not meta_path.exists():
        pytest.skip("terrain data not generated")
    from dem import height_m

    manifest = json.loads(meta_path.read_text())
    blob = (OUT_DIR / "terrain" / f"{site}.bin").read_bytes()
    level = manifest["levels"][index]
    lat, lon, _, _ = grid_points(manifest["lat"], manifest["lon"], level["half_size_m"], level["step_m"])
    stored = read_level(manifest, blob, index)[::7, ::7]
    node = height_m(lat[::7, ::7].ravel(), lon[::7, ::7].ravel()).reshape(stored.shape)
    # at the map edge a node can be off the map while samples around it are on it
    known = (stored != manifest["nodata"]) & np.isfinite(node)
    decoded = stored[known] * manifest["height_scale_m"] + manifest["ground_m"]
    if level["oversample"] == 1:
        assert np.abs(decoded - node[known]).max() <= 0.3
    else:
        # coarse nodes hold the highest point around them, never less than the node itself
        assert np.all(decoded >= node[known] - 0.3)
        assert np.median(decoded - node[known]) < 4 * level["step_m"]
