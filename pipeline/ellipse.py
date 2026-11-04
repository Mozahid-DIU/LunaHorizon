"""Landing ellipse: terrain horizons at 25 points around a target, because landers miss.

The points are the target plus 8 compass directions on 3 rings, so the app can show a 100 m,
500 m or 1 km landing zone. The rings are circles: a real ellipse depends on the approach
direction, which is not known for a general site. Where a lander is known to have come down
away from its target (IM-2 Athena), that point gets a horizon too.

Usage: python ellipse.py            -> web/public/data/horizon/<site>-ellipse.json
"""
import json

import numpy as np

from horizon import LANDER_HEIGHT_M, MAX_DISTANCE_M, MOON_RADIUS_M, destination, horizon_profile
from subpoints import OUT_DIR

RINGS_M = (100, 500, 1000)
BEARINGS_DEG = (0, 45, 90, 135, 180, 225, 270, 315)


ELLIPSE_MAX_LAT = -80.0


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


def _distance_and_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[int, int]:
    """Great-circle distance in whole metres and initial bearing in whole degrees from north."""
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    distance = 2 * MOON_RADIUS_M * np.arcsin(np.sqrt(a))
    bearing = np.degrees(np.arctan2(np.sin(dl) * np.cos(p2), np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl))) % 360
    return int(round(float(distance))), int(round(float(bearing))) % 360


def _touchdown(site: dict, height_fn) -> dict:
    point = site["touchdown"]
    distance_m, bearing_deg = _distance_and_bearing(site["lat"], site["lon"], point["lat"], point["lon"])
    return {
        **_with_horizon({"lat": point["lat"], "lon": point["lon"]}, height_fn),
        "lat": point["lat"],
        "lon": point["lon"],
        "distance_m": distance_m,
        "bearing_deg": bearing_deg,
        "date": point["date"],
        "source": point["source"],
    }


def build_ellipse(site: dict, height_fn) -> dict:
    extra = {"touchdown": _touchdown(site, height_fn)} if "touchdown" in site else {}
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
        **extra,
    }


def main() -> None:
    from dem import height_m
    from sites import load_sites

    out = OUT_DIR / "horizon"
    out.mkdir(parents=True, exist_ok=True)
    for site in load_sites():
        # the 25 points need the fine polar maps; the global map is too coarse for metres apart
        if site["lat"] > ELLIPSE_MAX_LAT:
            print(f"skip {site['id']}: outside the fine LOLA polar maps")
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
