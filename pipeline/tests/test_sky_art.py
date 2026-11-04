"""Sky View terrain art: rows and columns must mean exactly what the web page assumes."""
import json

import numpy as np
import pytest
from PIL import Image

from sites import load_sites
from sky_art import EL_BOTTOM, EL_TOP, HEIGHT_PX, META_FILE, META, SOFTNESS_DEG, WIDTH_PX, column_azimuths, panorama, row_elevations
from subpoints import OUT_DIR


def wall(height_m_at: float = 500.0, at_m: float = 5000.0):
    """Flat ground with a wall to the north only."""

    def height(lat, lon):
        lat = np.asarray(lat, float)
        distance = (lat - 0.0) * np.pi / 180 * 1737400.0
        return np.where((distance > at_m) & (distance < at_m + 500), height_m_at, 0.0)

    return height


def test_columns_run_around_the_compass_from_north():
    az = column_azimuths(720)
    assert az[0] == 0.25 and az[-1] == 359.75
    assert np.allclose(np.diff(az), 0.5)


def test_rows_are_even_steps_of_the_softened_scale_from_top_to_bottom():
    el = row_elevations(100)
    assert el[0] < EL_TOP and el[-1] > EL_BOTTOM
    assert (np.diff(el) < 0).all()
    assert np.allclose(np.diff(np.arcsinh(el / SOFTNESS_DEG)), np.diff(np.arcsinh(el / SOFTNESS_DEG))[0])


def test_terrain_appears_only_towards_the_wall_and_only_up_to_its_angle():
    image = panorama(0.0, 0.0, wall(), width=72, height=120, observer_height_m=2.0)
    el = row_elevations(120)
    wall_angle = np.degrees(np.arctan2(500.0 - 2.0, 5000.0))
    north = image[:, 0]
    south = image[:, 36]
    assert north[(el > wall_angle + 1)].max() == 0
    assert north[(el > 1) & (el < wall_angle - 1)].max() > 0
    assert south[el > 1].max() == 0


def test_the_art_reaches_above_every_published_skyline():
    highest = max(max(json.loads((OUT_DIR / "horizon" / f"{s['id']}.json").read_text())["elevation_deg"]) for s in load_sites())
    assert EL_TOP > highest + 1


def _skyline_at(lat: float, lon: float, azimuths: np.ndarray) -> np.ndarray:
    """The terrain skyline in exactly these directions, from the same maps and geometry as horizon.py."""
    from dem import height_m
    from horizon import LANDER_HEIGHT_M, MOON_RADIUS_M, _distances, destination

    dist = _distances()
    lats, lons = destination(lat, lon, azimuths[:, None], dist[None, :])
    heights = height_m(lats.ravel(), lons.ravel()).reshape(lats.shape)
    r_obs = MOON_RADIUS_M + height_m(np.array([lat]), np.array([lon]))[0] + LANDER_HEIGHT_M
    theta = dist / MOON_RADIUS_M
    elev = np.degrees(np.arctan2((MOON_RADIUS_M + heights) * np.cos(theta) - r_obs, (MOON_RADIUS_M + heights) * np.sin(theta)))
    return np.nanmax(elev, axis=1)


@pytest.mark.parametrize("site", load_sites(), ids=lambda s: s["id"])
def test_the_top_of_each_image_follows_the_skyline(site):
    image = np.asarray(Image.open(OUT_DIR / "sky" / f"{site['id']}.webp").convert("L"))
    rows = row_elevations(HEIGHT_PX)
    columns = np.arange(0, WIDTH_PX, 8)
    top = rows[np.argmax(image[:, columns] > 8, axis=0)]
    azimuths = column_azimuths(WIDTH_PX)[columns]
    expected = _skyline_at(site["lat"], site["lon"], azimuths)
    assert abs(np.mean(top - expected)) < 0.05
    # WebP compression blurs a steep skyline edge upward a little (0.47 degrees at Apollo 17's
    # massif); the page trims the art to the engine's horizon, so this is never shown
    assert np.max(np.abs(top - expected)) < 0.5


@pytest.mark.parametrize("site", load_sites(), ids=lambda s: s["id"])
def test_the_published_one_degree_horizon_stays_close_between_its_samples(site):
    """The engine reads the skyline every 1 degree and joins the points with straight lines.

    A sharp peak between two samples is lowered by that. This measures how much, so the limit is
    known: it matters only in steep terrain such as the Apollo 17 valley.
    """
    profile = json.loads((OUT_DIR / "horizon" / f"{site['id']}.json").read_text())["elevation_deg"]
    azimuths = np.arange(0.5, 360, 1.0)
    between = _skyline_at(site["lat"], site["lon"], azimuths)
    joined = np.interp(azimuths, np.arange(361), [*profile, profile[0]])
    assert np.max(np.abs(between - joined)) < 0.8


def test_metadata_given_to_the_website_is_up_to_date():
    assert json.loads(META_FILE.read_text(encoding="utf-8")) == META
    assert META == {"softness_deg": SOFTNESS_DEG, "el_bottom": EL_BOTTOM, "el_top": EL_TOP, "width": WIDTH_PX, "height": HEIGHT_PX}
