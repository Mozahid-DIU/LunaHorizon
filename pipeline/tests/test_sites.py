"""Every curated site must have valid coordinates and an official source."""
import pytest

from sites import load_sites

REQUIRED = {"id", "name", "agency", "mission", "category", "lat", "lon", "source", "source_note"}
CATEGORIES = {"apollo", "clps", "other-nations", "artemis"}


def test_demo_sites_present():
    ids = {s["id"] for s in load_sites()}
    assert {"apollo-11", "chandrayaan-3", "im-1", "im-2", "shackleton-rim"} <= ids


def test_ids_unique():
    ids = [s["id"] for s in load_sites()]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("site", load_sites(), ids=lambda s: s["id"])
def test_site_is_valid(site):
    assert REQUIRED <= site.keys()
    assert -90 <= site["lat"] <= 90
    assert -180 < site["lon"] <= 180
    assert site["category"] in CATEGORIES
    assert site["source"].startswith("https://")
    assert site["source_note"].strip()
