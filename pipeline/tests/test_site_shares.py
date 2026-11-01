"""Map pins show each site's share of hours from its own horizon, never from the map grid."""
import json

import pytest

from site_shares import OUT_FILE, build_shares
from sites import load_sites


def test_every_terrain_site_gets_shares_within_physical_limits():
    shares = build_shares(load_sites(), years=(2027,))
    assert set(shares) == {s["id"] for s in load_sites()}
    for share in shares.values():
        assert 0 <= share["golden"] <= min(share["lit"], share["earth"]) <= 1000


def test_published_shackleton_sunlight():
    site = next(s for s in load_sites() if s["id"] == "shackleton-rim")
    assert build_shares([site])["shackleton-rim"]["lit"] == pytest.approx(848, abs=1)


def test_file_in_the_website_is_up_to_date():
    assert json.loads(OUT_FILE.read_text(encoding="utf-8")) == build_shares(load_sites())
