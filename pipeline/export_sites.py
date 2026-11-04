"""Copy the curated sites into the website, marking which ones have a terrain horizon.

Usage: python export_sites.py        -> web/src/data/sites.json
"""
import json

from sites import load_sites
from subpoints import OUT_DIR

OUT_FILE = OUT_DIR.parent.parent / "src" / "data" / "sites.json"
FIELDS = ("id", "name", "agency", "mission", "category", "lat", "lon", "landed", "source")


def _near_source(site_id: str) -> str | None:
    path = OUT_DIR / "horizon" / f"{site_id}.json"
    return json.loads(path.read_text())["near_source"] if path.exists() else None


def build_site_list(sites: list[dict]) -> list[dict]:
    """Each site, whether it has a terrain horizon, and whether its close ground comes from the coarse global map."""
    listed = []
    for site in sites:
        near = _near_source(site["id"])
        listed.append({
            **{key: site.get(key) for key in FIELDS},
            "has_terrain": near is not None,
            "is_coarse_terrain": near is not None and "global map" in near,
        })
    return listed


def main() -> None:
    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(build_site_list(load_sites()), indent=1) + "\n", encoding="utf-8")
    print(f"{OUT_FILE.name}: {len(load_sites())} sites")


if __name__ == "__main__":
    main()
