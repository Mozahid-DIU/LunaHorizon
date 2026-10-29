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


def test_summary_counts_rows():
    total = sum(len(s["rows"]) for s in REPORT["sections"])
    assert REPORT["summary"]["checks"] == total
    assert REPORT["summary"]["passed"] == total
