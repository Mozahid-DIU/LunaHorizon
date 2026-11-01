"""Height tiles must give back the source maps exactly, so the browser's terrain can be trusted."""
import gzip
import json

import numpy as np
import pytest

from dem import load_dem, PRODUCTS
from height_tiles import COVERAGE_LAT, FAR_STEP_M, MANIFEST, TILE_CELLS, decode_tile, encode_tile, far_grid_heights, far_plane_axis, is_kept, tile_window


def test_encoding_round_trips_exact_values():
    block = np.array([[0, 5, -3], [7, -32000, 32000], [1, 1, 1]], dtype=np.int16)
    assert np.array_equal(decode_tile(encode_tile(block), 3), block)


def test_encoded_tile_is_plain_gzip_of_row_differences():
    block = np.array([[10, 12], [20, 19]], dtype=np.int16)
    raw = np.frombuffer(gzip.decompress(encode_tile(block)), dtype="<i2")
    assert raw.tolist() == [10, 2, 20, -1]


def test_tiles_share_their_edges_so_any_point_can_be_blended_inside_one_tile():
    first = tile_window(0, 0, 20000, 20000)
    second = tile_window(0, 1, 20000, 20000)
    assert first == (0, TILE_CELLS + 1, 0, TILE_CELLS + 1)
    assert second[2] == TILE_CELLS


def test_last_tile_stops_at_the_map_edge():
    assert tile_window(0, 2, 100, 2 * TILE_CELLS + 7)[3] == 2 * TILE_CELLS + 7


def test_tile_is_kept_only_where_its_map_is_the_one_used():
    dem = load_dem("ldem_60s_240m")
    pole_cell = dem.lines // 2 // TILE_CELLS
    assert not is_kept(dem, pole_cell, pole_cell, keep_north_of=-75.0)
    # the middle of the map's left edge lies on the 60 S ring
    assert is_kept(dem, pole_cell, 0, keep_north_of=-75.0)


def test_every_point_a_map_serves_has_its_tile_stored():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for name, north, south in (("ldem_75s_120m", -75.0, -80.0), ("ldem_60s_240m", -60.05, -75.0)):
        product = next(p for p in data["products"] if p["name"] == name)
        stored = {tuple(tile) for tile in product["tiles"]}
        lat, lon = np.meshgrid(np.linspace(south, north, 400), np.arange(-180.0, 180.0, 0.25))
        dem = load_dem(name)
        line, sample = dem.pixel(lat.ravel(), lon.ravel())
        i, j = np.floor(line).astype(int), np.floor(sample).astype(int)
        # at its very edge a map has no blendable cell, and the next map serves the point
        inside = (i >= 0) & (i < dem.lines - 1) & (j >= 0) & (j < dem.samples - 1)
        needed = set(zip((i[inside] // TILE_CELLS).tolist(), (j[inside] // TILE_CELLS).tolist()))
        assert needed and needed <= stored


def test_far_grid_sits_on_480_m_multiples():
    axis = far_plane_axis()
    assert np.allclose(axis % FAR_STEP_M, 0)
    assert axis[0] < 0 < axis[-1]


def test_far_heights_equal_the_maps_at_a_node():
    from best_lit_rim import _to_latlon
    from dem import height_m

    x, y = np.array([48_000.0]), np.array([96_000.0])
    lat, lon = _to_latlon(x, y)
    assert far_grid_heights(x, y)[0] == pytest.approx(float(height_m(lat, lon)[0]))


def test_manifest_lists_every_map_with_its_real_scale():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert [p["name"] for p in data["products"]] == [*PRODUCTS, "far"]
    assert data["coverage_lat"] == COVERAGE_LAT
    for product in data["products"][:-1]:
        dem = load_dem(product["name"])
        assert (product["lines"], product["samples"], product["scale_m"]) == (dem.lines, dem.samples, dem.scale_m)
        assert (product["line_offset"], product["sample_offset"]) == (dem.line_offset, dem.sample_offset)


@pytest.mark.parametrize("name", PRODUCTS)
def test_a_stored_tile_equals_the_source_map(name):
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    product = next(p for p in data["products"] if p["name"] == name)
    row, column = product["tiles"][len(product["tiles"]) // 2]
    dem = load_dem(name)
    path = MANIFEST.parent / name / f"{row}_{column}.i2z"
    top, bottom, left, right = tile_window(row, column, dem.lines, dem.samples)
    stored = decode_tile(path.read_bytes(), right - left)
    assert np.array_equal(stored, np.asarray(dem.data[top:bottom, left:right]))
