import pytest

from services.horizons import HorizonsError, parse_observer_csv, query_params


def test_parse_observer_csv_skips_default_presence_columns():
    sample = '''\n$$SOE\n2026-Nov-14 00:00,*, ,123.4567,-2.5000,\n2026-Nov-14 01:00,m, ,140.0000,5.2500,\n$$EOE\n'''
    frame = parse_observer_csv(sample)
    assert len(frame) == 2
    assert round(frame.loc[0, "azimuth_deg"], 4) == 123.4567
    assert round(frame.loc[0, "elevation_deg"], 4) == -2.5
    assert round(frame.loc[1, "azimuth_deg"], 4) == 140.0
    assert round(frame.loc[1, "elevation_deg"], 4) == 5.25


def test_parse_observer_csv_reads_dates():
    sample = "$$SOE\n 2026-Nov-01 02:00, , ,352.042148,  2.761280,\n$$EOE"
    frame = parse_observer_csv(sample)
    assert str(frame.loc[0, "time"]) == "2026-11-01 02:00:00"
    assert frame.loc[0, "elevation_deg"] == pytest.approx(2.76128)


def test_parse_observer_csv_needs_data_block():
    with pytest.raises(HorizonsError):
        parse_observer_csv("API error: no ephemeris")


def test_query_uses_a_site_on_the_moon():
    p = query_params("10", -67.9321, -88.6834, 1.794, "2026-11-01", "2026-11-02", "2h")
    assert p["CENTER"] == "'coord@301'"
    assert p["SITE_COORD"] == "'-67.9321,-88.6834,1.794'"
    assert p["QUANTITIES"] == "'4'"
