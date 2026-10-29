"""Terrain horizon: synthetic terrain with known answers, then a sanity check on real LOLA data."""
import numpy as np
import pytest

from dem import LOLA_DIR, PRODUCTS
from horizon import MOON_RADIUS_M, destination, horizon_profile

SITE = (-85.0, 30.0)
H0 = 2.0  # observer (lander) height above the ground


def flat(lat, lon):
    return np.zeros(np.shape(lat))


def wall(distance_km, height_m, az_deg, half_width_deg=0.6):
    """A ring segment of constant height at a given distance and bearing from SITE."""
    def height(lat, lon):
        lat, lon = np.asarray(lat), np.asarray(lon)
        phi1, phi2 = np.radians(SITE[0]), np.radians(lat)
        dlon = np.radians(lon - SITE[1])
        cos_c = np.sin(phi1) * np.sin(phi2) + np.cos(phi1) * np.cos(phi2) * np.cos(dlon)
        dist_km = np.arccos(np.clip(cos_c, -1, 1)) * MOON_RADIUS_M / 1000
        bearing = np.degrees(np.arctan2(np.sin(dlon) * np.cos(phi2),
                                        np.cos(phi1) * np.sin(phi2) - np.sin(phi1) * np.cos(phi2) * np.cos(dlon)))
        off = np.abs((bearing - az_deg + 180) % 360 - 180)
        on = (dist_km >= distance_km) & (dist_km <= distance_km + 1.0) & (off <= half_width_deg)
        return np.where(on, height_m, 0.0)
    return height


def dip(h0=H0):
    """How far the true horizon of a smooth sphere sits below 0 deg for an eye h0 above it."""
    return -np.degrees(np.arccos(MOON_RADIUS_M / (MOON_RADIUS_M + h0)))


def exact_elevation(distance_km, height_m, h0=H0):
    """Elevation of a point at height_m, distance_km along the sphere, seen from h0 above it."""
    theta = distance_km * 1000 / MOON_RADIUS_M
    r_obs, r_tgt = MOON_RADIUS_M + h0, MOON_RADIUS_M + height_m
    return np.degrees(np.arctan2(r_tgt * np.cos(theta) - r_obs, r_tgt * np.sin(theta)))


def test_destination_moves_along_bearing():
    lat, lon = destination(0.0, 0.0, np.array([0.0, 90.0]), np.array([1.0, 1.0]) * MOON_RADIUS_M * np.pi / 180)
    assert lat == pytest.approx([1.0, 0.0], abs=1e-9)
    assert lon == pytest.approx([0.0, 1.0], abs=1e-9)


def test_flat_ground_gives_geometric_dip():
    # from 2 m up, a smooth Moon's horizon is 0.087 deg below level
    h = horizon_profile(*SITE, flat, observer_height_m=H0)
    assert h.shape == (360,)
    assert dip() == pytest.approx(-0.087, abs=0.001)
    assert np.all(np.abs(h - dip()) < 0.002)


def test_near_wall_gives_exact_angle():
    h = horizon_profile(*SITE, wall(10, 1000, 90), observer_height_m=H0)
    assert h[90] == pytest.approx(exact_elevation(10, 1000), abs=0.02)
    assert h[270] == pytest.approx(dip(), abs=0.002)  # opposite side stays clear


def test_far_wall_sinks_below_horizon_with_curvature():
    # a flat-Moon formula would give +0.57 deg; the curved Moon hides most of it
    expected = exact_elevation(100, 1000)
    assert expected < -1.0
    h = horizon_profile(*SITE, wall(100, 1000, 180), observer_height_m=H0)
    assert h[180] == pytest.approx(dip(), abs=0.002)


def test_observer_height_lowers_horizon():
    low = horizon_profile(*SITE, wall(10, 1000, 45), observer_height_m=2)[45]
    high = horizon_profile(*SITE, wall(10, 1000, 45), observer_height_m=500)[45]
    assert high < low


@pytest.mark.skipif(not all((LOLA_DIR / f"{p}.img").exists() for p in PRODUCTS), reason="LOLA DEMs not downloaded")
def test_real_terrain_matches_brute_force():
    """On real LOLA data, the adaptive ray sampling must find the same skyline as 5 m steps."""
    from dem import height_m

    lat, lon = -89.9851, -50.22
    h = horizon_profile(lat, lon, height_m)
    assert np.all(np.isfinite(h)) and h.min() > -5 and h.max() < 30
    r_obs = MOON_RADIUS_M + height_m(np.array([lat]), np.array([lon]))[0] + H0
    d = np.arange(5.0, 20_000.0, 5.0)
    for az in (0, 90, 180, int(np.argmax(h)), 270):
        la, lo = destination(lat, lon, np.full(d.shape, float(az)), d)
        r_t = MOON_RADIUS_M + height_m(la, lo)
        theta = d / MOON_RADIUS_M
        brute = np.degrees(np.arctan2(r_t * np.cos(theta) - r_obs, r_t * np.sin(theta))).max()
        # brute force only looks 20 km out, so it is a lower bound for the full 150 km horizon;
        # sampling can never overestimate, so this catches skipped peaks
        assert h[az] >= brute - 0.3, f"az {az}: {h[az]:.2f} vs brute {brute:.2f}"
