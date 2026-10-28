"""Fetch reference azimuth/elevation from the JPL Horizons API for an observer on the Moon."""
import requests

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODY_ID = {"sun": "10", "earth": "399"}


def horizons_altaz(body, lat, lon, times):
    """Return [{"time", "az", "el"}] for each UTC time string, observer at (lat, lon) on the Moon."""
    rows = []
    for t in times:
        params = {
            "format": "json",
            "COMMAND": f"'{BODY_ID[body]}'",
            "EPHEM_TYPE": "'OBSERVER'",
            "CENTER": "'coord@301'",
            "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{lon % 360},{lat},0'",
            "TLIST": f"'{t}'",
            "TIME_TYPE": "'UT'",
            "QUANTITIES": "'4'",
            "ANG_FORMAT": "'DEG'",
            "CSV_FORMAT": "'YES'",
        }
        resp = requests.get(API, params=params, timeout=60)
        resp.raise_for_status()
        text = resp.json()["result"]
        body_text = text.split("$$SOE")[1].split("$$EOE")[0].strip()
        fields = [f.strip() for f in body_text.splitlines()[0].split(",")]
        numbers = [f for f in fields[1:] if _is_number(f)]
        az, el = float(numbers[0]), float(numbers[1])
        rows.append({"time": t, "az": az, "el": el})
    return rows


def _is_number(s):
    try:
        float(s)
        return True
    except ValueError:
        return False
