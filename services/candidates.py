"""
---------------
OrbitalUV
---------------
Choosing landing spots on the 500 m grid.

A cell can be a spot if it is flat enough (median slope <= 10 deg over
560 m), south of 84 S (the Artemis III regions are all within 6 deg of the
pole) and far enough from the DEM border for its horizon to be complete.
"""

import numpy as np

MAX_SLOPE_DEG = 10
MAX_LAT = -84


def usable_cells(slope, z, lat, grid_x, grid_y):
    ok = (slope <= MAX_SLOPE_DEG) & np.isfinite(z)
    # skip 3 cells at the edges of the grid
    edge = np.zeros(slope.shape, bool)
    edge[3:-3, 3:-3] = True
    # horizons are traced up to 150 km; past 260 km from the pole they would leave the DEM
    xx, yy = np.meshgrid(grid_x, grid_y)
    inside = np.hypot(xx, yy) < 260000
    return ok & edge & inside & (lat <= MAX_LAT)


def pick(metric, mask, n, min_sep_km, grid_x, grid_y):
    """Best `n` cells by `metric`, at least `min_sep_km` apart from each other."""
    shape = metric.shape
    m = np.where(mask, metric, -1).ravel().copy()
    order = np.argsort(-m)
    xx = np.broadcast_to(grid_x[None, :], shape).ravel()
    yy = np.broadcast_to(grid_y[:, None], shape).ravel()
    chosen = []
    for i in order:
        if m[i] < 0:
            break
        if all(np.hypot(xx[i] - xx[j], yy[i] - yy[j]) > min_sep_km * 1000 for j in chosen):
            chosen.append(i)
        if len(chosen) >= n:
            break
    return chosen


def calculator_candidates(both, nasa_sun, nasa_earth, mask, grid_x, grid_y):
    """Spots the website analyses for the user's dates (~315).

    Taken from three rankings so no good area is missed:
    our "Sun and Earth at once" map, NASA's sunlight map and NASA's Earth map.
    """
    xx, yy = np.meshgrid(grid_x, grid_y)
    xx, yy = xx.ravel(), yy.ravel()
    sun = np.nan_to_num(nasa_sun)
    earth = np.nan_to_num(nasa_earth)
    chosen = []

    def add(metric, n):
        for i in pick(metric, mask, n, 2.5, grid_x, grid_y):
            if all(np.hypot(xx[i] - xx[j], yy[i] - yy[j]) > 2000 for j in chosen):
                chosen.append(i)

    add(both, 260)
    add(sun, 80)
    add(earth + 0.1 * sun, 40)   # small sunlight bonus to break ties between 100 % Earth cells
    return chosen


def reference_lists(both, nasa_sun, nasa_earth, mask, grid_x, grid_y):
    """Short lists shown on the "More" screen."""
    sun = np.nan_to_num(nasa_sun)
    earth = np.nan_to_num(nasa_earth)
    return {
        "both": pick(both, mask, 10, 8, grid_x, grid_y),
        "sun": pick(sun, mask, 8, 8, grid_x, grid_y),
        "earth": pick(earth + 0.1 * sun, mask, 8, 8, grid_x, grid_y),
    }
