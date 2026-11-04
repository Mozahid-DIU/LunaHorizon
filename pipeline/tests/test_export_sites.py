"""The website's site list must stay identical to the curated source."""
import json

from export_sites import FIELDS, OUT_FILE, build_site_list
from sites import load_sites
from subpoints import OUT_DIR


def test_site_list_copies_each_curated_site_exactly():
    exported = build_site_list(load_sites())
    assert [s["id"] for s in exported] == [s["id"] for s in load_sites()]
    for out, source in zip(exported, load_sites()):
        assert set(out) == set(FIELDS) | {"has_terrain", "is_coarse_terrain", "has_ellipse"}
        assert all(out[key] == source.get(key) for key in FIELDS)


def test_terrain_flag_follows_the_horizon_file():
    sites = [{key: "x" for key in FIELDS} | {"id": "not-a-real-site"}, *load_sites()]
    exported = {s["id"]: s for s in build_site_list(sites)}
    assert exported["not-a-real-site"]["has_terrain"] is False
    assert exported["im-2"]["has_terrain"] is True


def test_coarse_flag_marks_sites_whose_close_ground_is_on_the_global_map():
    exported = {s["id"]: s for s in build_site_list(load_sites())}
    assert exported["change-4"]["is_coarse_terrain"] is True
    assert exported["apollo-12"]["is_coarse_terrain"] is True
    # Apollo 15's far rays reach the global map, but its close ground is on SLDEM2015
    for fine in ("apollo-11", "apollo-15", "apollo-16", "apollo-17", "slim", "shackleton-rim", "chandrayaan-2"):
        assert exported[fine]["is_coarse_terrain"] is False, fine
    for site in exported.values():
        horizon = json.loads((OUT_DIR / "horizon" / f"{site['id']}.json").read_text())
        assert site["is_coarse_terrain"] == ("global map" in horizon["near_source"])


def test_ellipse_flag_follows_the_ellipse_file():
    exported = {s["id"]: s for s in build_site_list(load_sites())}
    assert {id for id, s in exported.items() if s["has_ellipse"]} == {"im-1", "im-2", "shackleton-rim"}


def test_file_in_the_website_is_up_to_date():
    assert json.loads(OUT_FILE.read_text(encoding="utf-8")) == build_site_list(load_sites())


def test_each_terrain_site_matches_its_horizon_coordinates():
    for site in build_site_list(load_sites()):
        if site["has_terrain"]:
            horizon = json.loads((OUT_DIR / "horizon" / f"{site['id']}.json").read_text())
            assert (horizon["lat"], horizon["lon"]) == (site["lat"], site["lon"])
