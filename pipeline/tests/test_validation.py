"""The Validation Panel data: every check present, every difference within its tolerance."""
import pytest

from validation import build_validation

REPORT = build_validation()


def test_has_all_sections():
    ids = [s["id"] for s in REPORT["sections"]]
    assert ids == ["horizons-sun-earth", "browser-engine", "dsn-moon", "terrain"]


@pytest.mark.parametrize("section", REPORT["sections"], ids=lambda s: s["id"])
def test_every_row_passes(section):
    assert section["rows"], "section has no rows"
    for row in section["rows"]:
        assert row["pass"], row


def test_horizons_section_covers_three_sites_both_bodies():
    rows = next(s for s in REPORT["sections"] if s["id"] == "horizons-sun-earth")["rows"]
    assert {r["site"] for r in rows} == {"apollo-11", "chandrayaan-3", "south-pole-89s"}
    assert {r["body"] for r in rows} == {"sun", "earth"}
    assert len(rows) == 24


def test_every_lander_lroc_measured_has_a_ground_height_check():
    rows = next(s for s in REPORT["sections"] if s["id"] == "terrain")["rows"]
    checked = [r["check"] for r in rows if r["check"].startswith("Ground height at")]
    assert len(checked) == 11
    for name in ("IM-1 Odysseus", "Chang'e 4", "Chang'e 6", "SLIM", "Blue Ghost Mission 1", "Chandrayaan-2 Vikram", "Surveyor 3"):
        assert any(name in check for check in checked), name
    for row in rows:
        if row["check"].startswith("Ground height at"):
            assert row["unit"] == "m" and row["tolerance"] == 150
            assert row["reference_source"].startswith("NASA/GSFC/Arizona State University, LROC (lroc.im-ldi.com/images/")


def test_browser_section_covers_every_curated_site():
    from sites import load_sites

    rows = next(s for s in REPORT["sections"] if s["id"] == "browser-engine")["rows"]
    assert {r["site"] for r in rows} == {s["id"] for s in load_sites()}


def test_summary_counts_rows():
    total = sum(len(s["rows"]) for s in REPORT["sections"])
    assert REPORT["summary"]["checks"] == total
    assert REPORT["summary"]["passed"] == total
