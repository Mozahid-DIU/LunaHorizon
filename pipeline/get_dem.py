"""Download the elevation maps LunaHorizon needs into nasa-data/lola.

Nested LOLA polar grids, fine near the pole and coarser farther out, keep a 150 km horizon ray
from any south polar site on LOLA data. Two SLDEM2015 tiles (LOLA + JAXA SELENE/Kaguya, 512
pixels per degree) cover 30 S to 30 N, 0 to 45 E for Apollo 11; it straddles the equator.
Usage: python get_dem.py
"""
from pathlib import Path

import requests

from dem import LOLA_DIR, PRODUCTS, SLDEM_TILES

PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data"
POLAR = f"{PDS}/lola_gdr/polar/img"
TILES = f"{PDS}/sldem2015/tiles/float_img"
DEST = LOLA_DIR
CHUNK = 1 << 20


def download(url: str, target: Path) -> None:
    """Stream to disk, resuming a partial file; raise if the final size is wrong."""
    have = target.stat().st_size if target.exists() else 0
    head = requests.head(url, timeout=60)
    head.raise_for_status()
    total = int(head.headers["Content-Length"])
    if have == total:
        print(f"have {target.name}")
        return
    headers = {"Range": f"bytes={have}-"} if have else {}
    with requests.get(url, headers=headers, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        mode = "ab" if have and resp.status_code == 206 else "wb"
        with open(target, mode) as f:
            for chunk in resp.iter_content(CHUNK):
                f.write(chunk)
    size = target.stat().st_size
    if size != total:
        raise IOError(f"{target.name}: got {size} bytes, expected {total}")
    print(f"got  {target.name} ({size // CHUNK} MB)")


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for base, name in [(POLAR, p) for p in PRODUCTS] + [(TILES, t) for t in SLDEM_TILES]:
        for ext in ("lbl", "img"):
            download(f"{base}/{name}.{ext}", DEST / f"{name}.{ext}")


if __name__ == "__main__":
    main()
