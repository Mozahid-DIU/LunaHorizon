"""Download the NASA NAIF SPICE kernels LunaHorizon needs into nasa-data/spice."""
from pathlib import Path

import requests

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
FILES = [
    "spk/planets/de440s.bsp",               # planet positions (JPL DE440, short span)
    "pck/moon_pa_de421_1900-2050.bpc",       # Moon orientation incl. libration
    "fk/satellites/moon_080317.tf",          # Moon frame definitions (ME / PA)
    "pck/a_old_versions/pck00008.tpc",       # planetary constants used by Skyfield's Moon frame
]
DEST = Path(__file__).parent.parent / "nasa-data" / "spice"


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for rel in FILES:
        target = DEST / rel.rsplit("/", 1)[-1]
        if target.exists():
            print(f"have {target.name}")
            continue
        resp = requests.get(f"{BASE}/{rel}", timeout=600)
        resp.raise_for_status()
        target.write_bytes(resp.content)
        print(f"got  {target.name} ({len(resp.content) // 1024} KB)")


if __name__ == "__main__":
    main()
