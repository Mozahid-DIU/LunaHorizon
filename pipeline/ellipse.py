"""Landing ellipse: terrain horizons at 25 points around a target, because landers miss.

The points are the target plus 8 compass directions on 3 rings, so the app can show a 100 m,
500 m or 1 km landing zone. The rings are circles: a real ellipse depends on the approach
direction, which is not known for a general site.

Usage: python ellipse.py            -> web/public/data/horizon/<site>-ellipse.json
"""
import json

import numpy as np

from horizon import LANDER_HEIGHT_M, MAX_DISTANCE_M, destination, horizon_profile
from subpoints import OUT_DIR

RINGS_M = (100, 500, 1000)
BEARINGS_DEG = (0, 45, 90, 135, 180, 225, 270, 315)


def ellipse_points(lat: float, lon: float) -> list[dict]:
    """The target first, then each ring from north through east."""
    points = [{"ring_m": 0, "bearing_deg": 0, "lat": lat, "lon": lon}]
    for ring in RINGS_M:
        for bearing in BEARINGS_DEG:
            p_lat, p_lon = destination(lat, lon, float(bearing), float(ring))
            points.append({"ring_m": ring, "bearing_deg": bearing, "lat": float(p_lat), "lon": float(p_lon)})
    return points


def _with_horizon(point: dict, height_fn) -> dict:
    ground = float(height_fn(np.array([point["lat"]]), np.array([point["lon"]]))[0])
    profile = horizon_profile(point["lat"], point["lon"], height_fn)
    return {
        **point,
        "lat": round(point["lat"], 6),
        "lon": round(point["lon"], 6),
        "ground_m": round(ground, 1),
        "elevation_deg": np.round(profile, 3).tolist(),
    }


def build_ellipse(site: dict, height_fn) -> dict:
    return {
        "site": site["id"],
        "lat": site["lat"],
        "lon": site["lon"],
        "rings_m": list(RINGS_M),
        "observer_height_m": LANDER_HEIGHT_M,
        "max_distance_km": MAX_DISTANCE_M / 1000,
        "az_step_deg": 1,
        "points": [_with_horizon(p, height_fn) for p in ellipse_points(site["lat"], site["lon"])],
        "source": "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)",
    }


def main() -> None:
    from dem import height_m
    from sites import load_sites

    out = OUT_DIR / "horizon"
    out.mkdir(parents=True, exist_ok=True)
    for site in load_sites():
        if not np.isfinite(height_m(np.array([site["lat"]]), np.array([site["lon"]]))[0]):
            print(f"skip {site['id']}: outside LOLA polar coverage")
            continue
        try:
            data = build_ellipse(site, height_m)
        except ValueError as error:
            print(f"skip {site['id']}: {error}")
            continue
        (out / f"{site['id']}-ellipse.json").write_text(json.dumps(data, separators=(",", ":")))
        ground = [p["ground_m"] for p in data["points"]]
        print(f"{site['id']}: 25 points, ground {min(ground):.0f} to {max(ground):.0f} m")


if __name__ == "__main__":
    main()
