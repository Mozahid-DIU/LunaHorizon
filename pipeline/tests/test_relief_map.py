"""The relief image must line up with the map grid and be lit from the upper left."""
import numpy as np

from golden_grid import grid_nodes
from relief_map import RADIUS_KM, pixel_axis, relief_nodes, shaded_relief


def test_pixels_fill_the_map_square_exactly():
    axis = pixel_axis(600)
    assert axis[0] == -RADIUS_KM + 0.5 and axis[-1] == RADIUS_KM - 0.5
    assert np.allclose(np.diff(axis), 1.0)


def test_top_of_the_image_faces_longitude_0_and_the_right_faces_90_east():
    lat, lon = relief_nodes(601)  # odd, so the middle row and column sit on the axes
    assert abs(lon[0, 300]) < 1e-9
    assert abs(lon[300, -1] - 90) < 1e-9
    assert lat[0, 300] == lat[300, -1]


def test_a_pixel_at_a_grid_node_has_that_nodes_coordinates():
    grid = grid_nodes()
    lat, lon = relief_nodes(601)
    assert lat[300, 300] == grid["lat"][60, 60] == -90
    # the node 150 km along +x; the pixel centre lies within half a pixel of it (0.016° of latitude)
    assert abs(lat[300, 450] - grid["lat"][60, 90]) < 0.02
    assert abs(lon[300, 450] - grid["lon"][60, 90]) < 1e-9


def bowl(n: int = 201) -> np.ndarray:
    axis = np.linspace(-1, 1, n) * 1000.0
    x, y = np.meshgrid(axis, -axis)
    return (x**2 + y**2) / 2000.0


def test_slope_facing_the_light_is_brighter_than_the_slope_facing_away():
    shade = shaded_relief(bowl(), step_m=10.0)
    # in a bowl the lower-right wall faces up and left, towards the light
    assert shade[150, 150] > shade[50, 50]


def test_shade_stays_between_0_and_1_and_flat_ground_is_uniform():
    assert ((s := shaded_relief(bowl(), step_m=10.0)) >= 0).all() and (s <= 1).all()
    flat = shaded_relief(np.zeros((20, 20)), step_m=10.0)
    assert np.ptp(flat) == 0
