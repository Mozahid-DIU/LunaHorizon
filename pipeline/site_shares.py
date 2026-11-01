"""Share of hours with Sun, Earth and Golden for each curated site, from its own horizon.

The map's pins show these values. Values are per mille of the hours 2026-2030, using the same
hourly rules as the Golden Window Map.

Usage: python site_shares.py        -> web/src/data/site-shares.json
"""
import json

from golden_grid import site_stats
from illumination import YEARS
from sites import load_sites
from subpoints import OUT_DIR

OUT_FILE = OUT_DIR.parent.parent / "src" / "data" / "site-shares.json"


def build_shares(sites: list[dict], years: tuple[int, ...] = YEARS) -> dict:
    shares = {}
    for site in sites:
        profile = json.loads((OUT_DIR / "horizon" / f"{site['id']}.json").read_text())["elevation_deg"]
        stats = site_stats(site["lat"], site["lon"], profile, years)
        shares[site["id"]] = {key: round(value * 1000) for key, value in stats.items()}
    return shares


def main() -> None:
    OUT_FILE.write_text(json.dumps(build_shares(load_sites()), indent=1) + "\n", encoding="utf-8")
    print(f"{OUT_FILE.name}: {len(load_sites())} sites")


if __name__ == "__main__":
    main()
