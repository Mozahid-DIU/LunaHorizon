"""Terrain horizon: the elevation angle of the skyline in each compass direction from a site.

For every azimuth (1 deg steps, from north through east) we march along the great circle out
to 150 km and keep the highest angle to any terrain point. The angle uses exact spherical
geometry, so lunar curvature is included. The Moon has no atmosphere: no refraction.

Usage: python horizon.py            -> web/public/data/horizon/<site>.json for sites with LOLA coverage
"""
import json

import numpy as np

from subpoints import MOON_RADIUS_KM, OUT_DIR

MOON_RADIUS_M = MOON_RADIUS_KM * 1000
MAX_DISTANCE_M = 150_000.0
FIRST_STEP_M = 10.0
STEP_GROWTH = 1.002          # sample spacing grows 0.2% per step: ~20 m at 10 km, ~300 m at 150 km
LANDER_HEIGHT_M = 2.0        # eye height of the lander's panels / antenna above the ground


def _distances() -> np.ndarray:
    n = int(np.ceil(np.log(MAX_DISTANCE_M / FIRST_STEP_M) / np.log(STEP_GROWTH))) + 1
    return np.minimum(FIRST_STEP_M * STEP_GROWTH ** np.arange(n), MAX_DISTANCE_M)


def destination(lat, lon, bearing_deg, distance_m):
    """Point reached from (lat, lon) along a great circle; arrays broadcast. Degrees in and out."""
    phi1, lam1 = np.radians(lat), np.radians(lon)
    theta, delta = np.radians(bearing_deg), np.asarray(distance_m) / MOON_RADIUS_M
    sin_phi2 = np.sin(phi1) * np.cos(delta) + np.cos(phi1) * np.sin(delta) * np.cos(theta)
    phi2 = np.arcsin(np.clip(sin_phi2, -1, 1))
    lam2 = lam1 + np.arctan2(np.sin(theta) * np.sin(delta) * np.cos(phi1), np.cos(delta) - np.sin(phi1) * sin_phi2)
    lon2 = (np.degrees(lam2) + 180) % 360 - 180
    return np.degrees(phi2), lon2


def horizon_profile(lat, lon, height_fn, observer_height_m=LANDER_HEIGHT_M, n_azimuths=360):
    """Horizon elevation (deg) for azimuths 0, 360/n, ... Terrain outside the DEM is ignored."""
    ground = float(height_fn(np.array([lat]), np.array([lon]))[0])
    if not np.isfinite(ground):
        raise ValueError(f"no terrain data at {lat}, {lon}")
    r_obs = MOON_RADIUS_M + ground + observer_height_m

    dist = _distances()
    az = np.arange(n_azimuths) * 360.0 / n_azimuths
    lats, lons = destination(lat, lon, az[:, None], dist[None, :])
    heights = height_fn(lats.ravel(), lons.ravel()).reshape(lats.shape)

    theta = dist / MOON_RADIUS_M
    r_tgt = MOON_RADIUS_M + heights
    elev = np.degrees(np.arctan2(r_tgt * np.cos(theta) - r_obs, r_tgt * np.sin(theta)))
    return np.nanmax(np.where(np.isfinite(elev), elev, -90.0), axis=1)


def build_site(site: dict, height_fn) -> dict:
    profile = horizon_profile(site["lat"], site["lon"], height_fn)
    return {
        "site": site["id"],
        "lat": site["lat"],
        "lon": site["lon"],
        "ground_m": round(float(height_fn(np.array([site["lat"]]), np.array([site["lon"]]))[0]), 1),
        "observer_height_m": LANDER_HEIGHT_M,
        "max_distance_km": MAX_DISTANCE_M / 1000,
        "az_step_deg": 1,
        "elevation_deg": np.round(profile, 3).tolist(),
        "source": "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)",
    }


def main() -> None:
    from dem import height_m
    from sites import load_sites

    out = OUT_DIR / "horizon"
    out.mkdir(parents=True, exist_ok=True)
    for site in load_sites():
        if not np.isfinite(height_m(np.array([site["lat"]]), np.array([site["lon"]]))[0]):
            print(f"skip {site['id']}: outside LOLA polar coverage (spherical horizon used)")
            continue
        data = build_site(site, height_m)
        (out / f"{site['id']}.json").write_text(json.dumps(data, separators=(",", ":")))
        e = np.array(data["elevation_deg"])
        print(f"{site['id']}: ground {data['ground_m']:.0f} m, horizon {e.min():.2f} to {e.max():.2f} deg")


if __name__ == "__main__":
    main()
