"""Download the LRO LOLA south polar elevation maps LunaHorizon needs into nasa-data/lola.

Three nested polar stereographic grids: fine near the pole, coarser farther out, so a
150 km horizon ray from any south polar demo site stays on LOLA data.
Usage: python get_dem.py
"""
from pathlib import Path

import requests

from dem import LOLA_DIR, PRODUCTS  # ldem_875s_20m (87.5-90 S, 20 m), ldem_80s_80m, ldem_75s_120m

BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
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
    for name in PRODUCTS:
        for ext in ("lbl", "img"):
            download(f"{BASE}/{name}.{ext}", DEST / f"{name}.{ext}")


if __name__ == "__main__":
    main()
