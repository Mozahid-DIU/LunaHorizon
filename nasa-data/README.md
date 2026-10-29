# NASA and partner data

All source data LunaHorizon uses lives in this folder. Large files are not stored in git; download them with the scripts listed below.

| Folder / file | What it is | Provider | In git? | How to get it |
|---|---|---|---|---|
| `spice/de440s.bsp` | Planetary ephemeris DE440 (positions of Sun, Earth, Moon) | NASA JPL / NAIF | No (32 MB) | `python pipeline/get_kernels.py` |
| `spice/moon_pa_de421_1900-2050.bpc` | Moon orientation, including libration | NASA JPL / NAIF | No (1.7 MB) | `python pipeline/get_kernels.py` |
| `spice/moon_080317.tf` | Moon reference frames (Mean Earth / Principal Axis) | NASA JPL / NAIF | Yes | `python pipeline/get_kernels.py` |
| `spice/pck00008.tpc` | Planetary constants (Moon radius) | NASA JPL / NAIF | Yes | `python pipeline/get_kernels.py` |
| `horizons/*.json` | Sun and Earth azimuth/elevation seen from lunar sites, used to validate our engine | NASA JPL Horizons API | Yes | Created automatically by `pytest` if missing |
| `sites.json` | Landing site coordinates, each with its official source | NASA NSSDCA, NASA/ASU LROC, IAU Gazetteer (USGS) | Yes | Curated by the team |
| `lola/` *(coming)* | LRO LOLA polar elevation maps and SLDEM2015 (LOLA + JAXA Kaguya) | NASA LRO / PDS, JAXA | No (large) | Download script added in M2 |

Data we compute from these files (hourly Sun/Earth sub-points, terrain horizons) is written to `web/public/data/`, where the web app loads it.

Sources:
- NAIF generic kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- NSSDCA lunar landing sites: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html
- LROC: https://lroc.im-ldi.com
- IAU Gazetteer of Planetary Nomenclature: https://planetarynames.wr.usgs.gov
- LOLA (PDS Geosciences): https://pds-geosciences.wustl.edu/missions/lro/lola.htm
