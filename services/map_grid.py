"""
---------------
OrbitalUV
---------------
Sunlight and Earth visibility for every 500 m cell of the map.

761 x 761 cells (380 km square centred on the pole), horizon in 180
directions up to 150 km away, checked against the JPL Horizons table
(5,112 instants, Nov 2026 - Dec 2027). This is the slow step (~10 min),
so the result is cached in data/work/grid.npz.
"""

import numpy as np

from services.terrain import height_at, horizon_grid
from services.visibility import EARTH_RADIUS_DEG, both_visible_fraction, visible_fraction
from utils.geo import xy_to_latlon
from utils.paths import WORK_DIR

STEP = 500.0
HALF_SIZE = 190000.0
N_DIRECTIONS = 180
MAX_DISTANCE = 150000.0
CACHE = WORK_DIR / "grid.npz"


def grid_axes():
    gx = np.arange(-HALF_SIZE, HALF_SIZE + 1, STEP)
    gy = np.arange(HALF_SIZE, -HALF_SIZE - 1, -STEP)   # top row first, like an image
    return gx, gy


def compute(dem, ephem, step_hours=2):
    gx, gy = grid_axes()
    xx, yy = np.meshgrid(gx, gy)
    xs, ys = xx.ravel(), yy.ravel()
    lat, lon = xy_to_latlon(xs, ys)

    horizons = horizon_grid(*dem.args(), xs, ys, N_DIRECTIONS, MAX_DISTANCE, 0.0)
    sun, sun_dark = visible_fraction(horizons, lat, lon, ephem["sun"], N_DIRECTIONS, 0.0)
    earth, earth_dark = visible_fraction(horizons, lat, lon, ephem["earth"], N_DIRECTIONS, EARTH_RADIUS_DEG)
    both = both_visible_fraction(horizons, lat, lon, ephem["sun"], ephem["earth"], N_DIRECTIONS)
    z = np.array([height_at(*dem.args(), x, y) for x, y in zip(xs, ys)], np.float32)

    shape = xx.shape
    return dict(
        gx=gx, gy=gy, z=z.reshape(shape),
        sun=sun.reshape(shape), earth=earth.reshape(shape), both=both.reshape(shape),
        sun_dark_h=(sun_dark * step_hours).reshape(shape),
        earth_dark_h=(earth_dark * step_hours).reshape(shape),
        lat=lat.reshape(shape), lon=lon.reshape(shape),
    )


def load_or_compute(dem, ephem, force=False):
    if CACHE.exists() and not force:
        with np.load(CACHE) as f:
            return {k: f[k] for k in f.files}
    grid = compute(dem, ephem)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE, **grid)
    return grid
