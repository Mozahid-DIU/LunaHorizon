"""Sun and Earth azimuth/elevation seen from a point on the Moon, using NASA SPICE data via Skyfield.

Azimuth is measured from north through east (0-360 deg). Elevation is relative to the
local spherical (flat) horizon; terrain is handled separately. The Moon has no atmosphere,
so no refraction correction is applied.
"""
from functools import lru_cache
from pathlib import Path

from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

KERNELS = Path(__file__).parent / "data" / "kernels"


@lru_cache(maxsize=1)
def _context():
    load = Loader(str(KERNELS))
    ts = load.timescale(builtin=True)
    eph = load("de440s.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")
    return ts, eph, pc, frame


def _times(ts, utc_strings):
    parts = []
    for s in utc_strings:
        date, _, clock = s.partition(" ")
        y, m, d = (int(x) for x in date.split("-"))
        hh, mm = (int(x) for x in (clock or "00:00").split(":")[:2])
        parts.append((y, m, d, hh, mm))
    years, months, days, hours, minutes = zip(*parts)
    return ts.utc(list(years), list(months), list(days), list(hours), list(minutes))


def sun_earth_altaz(lat_deg, lon_deg, utc_strings):
    """Return {"sun": {"az": [...], "el": [...]}, "earth": {...}} for the given UTC times."""
    ts, eph, pc, frame = _context()
    t = _times(ts, utc_strings)
    site = eph["moon"] + pc.build_latlon_degrees(frame, lat_deg, lon_deg)
    result = {}
    for name, target in (("sun", eph["sun"]), ("earth", eph["earth"])):
        alt, az, _ = site.at(t).observe(target).apparent().altaz()
        result[name] = {"az": list(az.degrees), "el": list(alt.degrees)}
    return result
