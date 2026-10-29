"""Find the best-lit point on the Shackleton crater rim (2026-2030, Sun centre above terrain).

1. Coarse: 250 m grid in the 8-14 km ring around the IAU crater centre; keep the highest 3%.
2. Score each by sunlit fraction using its full LOLA terrain horizon.
3. Fine: 40 m grid within 600 m of the coarse winner.
Usage: python best_lit_rim.py   (prints the result; takes a few minutes)
"""
import numpy as np

from dem import MOON_RADIUS_M, height_m
from horizon import horizon_profile
from illumination import lit_fraction

CENTRE = (-89.67, 129.78)        # IAU Gazetteer, Shackleton
RING_KM = (8.0, 14.0)
TOP_SHARE = 0.03


def _to_xy(lat, lon):
    r = 2 * MOON_RADIUS_M * np.tan(np.pi / 4 + np.radians(lat) / 2)
    return r * np.sin(np.radians(lon)), r * np.cos(np.radians(lon))


def _to_latlon(x, y):
    r = np.hypot(x, y)
    return np.degrees(2 * np.arctan(r / (2 * MOON_RADIUS_M)) - np.pi / 2), np.degrees(np.arctan2(x, y))


def _grid(cx, cy, half_m, step_m):
    g = np.arange(-half_m, half_m + step_m, step_m)
    gx, gy = np.meshgrid(cx + g, cy + g)
    return gx.ravel(), gy.ravel()


def _score(lats, lons):
    return np.array([lit_fraction(la, lo, horizon_profile(la, lo, height_m)) for la, lo in zip(lats, lons)])


def main() -> None:
    cx, cy = _to_xy(*CENTRE)
    x, y = _grid(cx, cy, RING_KM[1] * 1000, 250)
    dist = np.hypot(x - cx, y - cy) / 1000
    x, y = x[(dist >= RING_KM[0]) & (dist <= RING_KM[1])], y[(dist >= RING_KM[0]) & (dist <= RING_KM[1])]
    lat, lon = _to_latlon(x, y)
    h = height_m(lat, lon)
    keep = h >= np.nanquantile(h, 1 - TOP_SHARE)
    lat, lon, x, y = lat[keep], lon[keep], x[keep], y[keep]
    print(f"coarse: scoring {len(lat)} high rim points")
    score = _score(lat, lon)
    best = int(np.argmax(score))
    print(f"coarse best {lat[best]:.4f}, {lon[best]:.3f}: {score[best]:.1%}")

    fx, fy = _grid(x[best], y[best], 600, 40)
    flat, flon = _to_latlon(fx, fy)
    print(f"fine: scoring {len(flat)} points")
    fscore = _score(flat, flon)
    i = int(np.argmax(fscore))
    ground = float(height_m(np.array([flat[i]]), np.array([flon[i]]))[0])
    dist_km = np.hypot(fx[i] - cx, fy[i] - cy) / 1000
    print(f"BEST {flat[i]:.4f}, {flon[i]:.3f}  lit {fscore[i]:.1%}  ground {ground:.0f} m  {dist_km:.1f} km from IAU centre")
    top = np.argsort(score)[::-1][:5]
    print("coarse top 5:", [(round(lat[k], 4), round(lon[k], 2), f"{score[k]:.0%}") for k in top])


if __name__ == "__main__":
    main()
