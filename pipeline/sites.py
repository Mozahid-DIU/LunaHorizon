"""Curated landing sites, each with an official coordinate source."""
import json
from pathlib import Path

SITES_FILE = Path(__file__).parent / "data" / "sites.json"


def load_sites() -> list[dict]:
    return json.loads(SITES_FILE.read_text(encoding="utf-8"))["sites"]
