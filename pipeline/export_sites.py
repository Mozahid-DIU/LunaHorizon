"""Copy the curated sites into the website, marking which ones have a terrain horizon.

Usage: python export_sites.py        -> web/src/data/sites.json
"""
import json

from sites import load_sites
from subpoints import OUT_DIR

OUT_FILE = OUT_DIR.parent.parent / "src" / "data" / "sites.json"
FIELDS = ("id", "name", "agency", "mission", "category", "lat", "lon", "landed", "source")


def build_site_list(sites: list[dict]) -> list[dict]:
    return [
        {**{key: site.get(key) for key in FIELDS}, "has_terrain": (OUT_DIR / "horizon" / f"{site['id']}.json").exists()}
        for site in sites
    ]


def main() -> None:
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(build_site_list(load_sites()), indent=1) + "\n", encoding="utf-8")
    print(f"{OUT_FILE.name}: {len(load_sites())} sites")


if __name__ == "__main__":
    main()
