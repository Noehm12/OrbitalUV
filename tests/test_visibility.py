import numpy as np
import pandas as pd

from services.visibility import EARTH_RADIUS_DEG, spot_stats, visible_fraction
from utils.geo import azel_to_vectors, latlon_to_xy, local_frame

LAT, LON = -88.0, 30.0


def _dirs(el_list, az=90.0):
    el = np.array(el_list, float)
    return azel_to_vectors(np.full(el.size, az), el, local_frame(LAT, LON))


def test_sun_needs_its_centre_above_the_horizon():
    horizon = np.zeros((1, 180), np.float32)   # flat 0 deg all around
    dirs = _dirs([1.0, -0.2, 3.0, -2.0])
    frac, longest = visible_fraction(horizon, np.array([LAT]), np.array([LON]), dirs, 180, 0.0)
    assert frac[0] == 0.5
    assert longest[0] == 1


def test_earth_counts_when_part_of_the_disc_shows():
    horizon = np.zeros((1, 180), np.float32)
    dirs = _dirs([-0.5, -2.0])                  # centre below, top edge above / everything below
    frac, _ = visible_fraction(horizon, np.array([LAT]), np.array([LON]), dirs, 180, EARTH_RADIUS_DEG)
    assert frac[0] == 0.5


def test_spot_stats_with_a_wall_to_the_east():
    horizon = np.zeros(720, np.float32)
    horizon[:] = -1.0
    x, y = latlon_to_xy(LAT, LON)
    times = pd.date_range("2027-01-01", periods=6, freq="2h")
    ephem = {
        "times": times,
        "sun": _dirs([2, 2, -3, -3, -3, 2]),
        "earth": _dirs([5, 5, 5, 5, 5, 5], az=180.0),
    }
    s = spot_stats(x, y, horizon, ephem)
    assert s["sun"] == 50.0
    assert s["earth"] == 100.0
    assert s["both"] == 50.0
    assert s["dark_h"] == 6            # three 2 h steps in a row
    assert s["monthly"] == [["2027-01", 50.0, 100.0]]
