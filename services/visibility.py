"""
---------------
OrbitalUV
---------------
Is the Sun / Earth above the local horizon?

The Sun counts as visible when its centre is above the terrain.
The Earth counts as visible when any part of its disc is above the terrain
(apparent radius ~0.95 deg). We checked both rules against NASA's own
Earth visibility map (PGDA 69) and "any part of the disc" is the one that
matches it (mean difference 2.7 points vs 5.7 with the centre).
"""

import numpy as np
import pandas as pd
from numba import njit, prange

from utils.geo import vectors_to_azel, xy_to_latlon

EARTH_RADIUS_DEG = 0.95


@njit(inline="always")
def _horizon_at(h_row, bearing, naz):
    f = bearing / (360.0 / naz)
    a0 = int(f) % naz
    a1 = (a0 + 1) % naz
    w = f - int(f)
    return h_row[a0] * (1 - w) + h_row[a1] * w


@njit(parallel=True)
def visible_fraction(horizons, lat, lon, dirs, naz, extra):
    """Share of time a body is visible from each point, and its longest hidden run (in samples).

    dirs: unit vectors of the body for every time sample (Moon-fixed).
    extra: added to the body elevation (0 for the Sun centre, 0.95 for the Earth's top edge).
    """
    n = horizons.shape[0]
    steps = dirs.shape[0]
    frac = np.zeros(n, np.float32)
    longest = np.zeros(n, np.int32)
    for i in prange(n):
        p = np.radians(lat[i])
        l = np.radians(lon[i])
        ux = np.cos(p) * np.cos(l)
        uy = np.cos(p) * np.sin(l)
        uz = np.sin(p)
        ex = -np.sin(l)
        ey = np.cos(l)
        nx = -np.sin(p) * np.cos(l)
        ny = -np.sin(p) * np.sin(l)
        nz = np.cos(p)
        count = 0
        run = 0
        best = 0
        for t in range(steps):
            dx = dirs[t, 0]
            dy = dirs[t, 1]
            dz = dirs[t, 2]
            el = np.degrees(np.arcsin(dx * ux + dy * uy + dz * uz))
            az = np.degrees(np.arctan2(dx * ex + dy * ey, dx * nx + dy * ny + dz * nz))
            h = _horizon_at(horizons[i], (lon[i] + az) % 360.0, naz)
            if el + extra > h:
                count += 1
                run = 0
            else:
                run += 1
                if run > best:
                    best = run
        frac[i] = count / steps
        longest[i] = best
    return frac, longest


@njit(parallel=True)
def both_visible_fraction(horizons, lat, lon, sun_dirs, earth_dirs, naz):
    """Share of time the Sun and the Earth are visible at the same time."""
    n = horizons.shape[0]
    steps = sun_dirs.shape[0]
    frac = np.zeros(n, np.float32)
    for i in prange(n):
        p = np.radians(lat[i])
        l = np.radians(lon[i])
        ux, uy, uz = np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)
        ex, ey = -np.sin(l), np.cos(l)
        nx, ny, nz = -np.sin(p) * np.cos(l), -np.sin(p) * np.sin(l), np.cos(p)
        count = 0
        for t in range(steps):
            ok = True
            for body in range(2):
                if body == 0:
                    dx, dy, dz, extra = sun_dirs[t, 0], sun_dirs[t, 1], sun_dirs[t, 2], 0.0
                else:
                    dx, dy, dz, extra = earth_dirs[t, 0], earth_dirs[t, 1], earth_dirs[t, 2], EARTH_RADIUS_DEG
                el = np.degrees(np.arcsin(dx * ux + dy * uy + dz * uz))
                az = np.degrees(np.arctan2(dx * ex + dy * ey, dx * nx + dy * ny + dz * nz))
                h = _horizon_at(horizons[i], (lon[i] + az) % 360.0, naz)
                if not (el + extra > h):
                    ok = False
                    break
            if ok:
                count += 1
        frac[i] = count / steps
    return frac


def _longest_false_run(flags):
    run = best = 0
    for v in flags:
        run = 0 if v else run + 1
        best = max(best, run)
    return best


def spot_stats(x, y, horizon, ephem, step_hours=2):
    """Statistics of one spot from its fine horizon (720 directions) and the ephemeris table.

    ephem: dict with "times" (DatetimeIndex), "sun" and "earth" unit vectors.
    """
    lat, lon = xy_to_latlon(np.array([x]), np.array([y]))
    lat, lon = float(lat[0]), float(lon[0])
    naz = len(horizon)

    def horizon_towards(az):
        # local azimuth -> map bearing -> horizon height
        f = ((lon + az) % 360) / (360 / naz)
        a0 = f.astype(int) % naz
        a1 = (a0 + 1) % naz
        w = f - np.floor(f)
        return horizon[a0] * (1 - w) + horizon[a1] * w

    sun_az, sun_el = vectors_to_azel(ephem["sun"], lat, lon)
    earth_az, earth_el = vectors_to_azel(ephem["earth"], lat, lon)
    sun_vis = sun_el > horizon_towards(sun_az)
    earth_vis = earth_el + EARTH_RADIUS_DEG > horizon_towards(earth_az)

    times = ephem["times"]
    monthly = []
    for m in pd.period_range(times[0], times[-1], freq="M"):
        sel = (times >= m.start_time) & (times <= m.end_time)
        monthly.append([str(m), round(100 * sun_vis[sel].mean(), 1), round(100 * earth_vis[sel].mean(), 1)])

    return dict(
        lat=round(lat, 4), lon=round(lon, 4), x=round(x), y=round(y),
        sun=round(100 * sun_vis.mean(), 1),
        earth=round(100 * earth_vis.mean(), 1),
        both=round(100 * (sun_vis & earth_vis).mean(), 1),
        dark_h=int(_longest_false_run(sun_vis) * step_hours),
        earth_gap_h=int(_longest_false_run(earth_vis) * step_hours),
        monthly=monthly,
    )
