import numpy as np
import pytest

from utils.geo import azel_to_vectors, latlon_to_xy, local_frame, vectors_to_azel, xy_to_latlon


def test_pole_is_the_origin():
    lat, lon = xy_to_latlon(np.array([0.0]), np.array([1e-6]))
    assert lat[0] == pytest.approx(-90.0)


def test_latlon_round_trip():
    for lat, lon in [(-89.67, 129.78), (-85.33, -42.13), (-84.0, 0.0)]:
        x, y = latlon_to_xy(lat, lon)
        la, lo = xy_to_latlon(np.array([x]), np.array([y]))
        assert la[0] == pytest.approx(lat, abs=1e-9)
        assert lo[0] == pytest.approx(lon, abs=1e-9)


def test_longitude_zero_points_up_the_map():
    x, y = latlon_to_xy(-85.0, 0.0)
    assert x == pytest.approx(0.0, abs=1e-6)
    assert y > 0


def test_azel_round_trip():
    lat, lon = -88.68, -67.93
    az = np.array([0.0, 45.0, 200.0, 359.0])
    el = np.array([0.0, 2.5, -1.0, 7.0])
    vec = azel_to_vectors(az, el, local_frame(lat, lon))
    az2, el2 = vectors_to_azel(vec, lat, lon)
    assert np.allclose((az2 - az + 180) % 360 - 180, 0)   # 0 and 360 are the same direction
    assert np.allclose(el2, el)
