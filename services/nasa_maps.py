"""
---------------
OrbitalUV
---------------
NASA illumination maps (PGDA product 69, Mazarico et al. 2011).

AVGVISIB_75S_120M_201608        average sunlight, 18.6 years, hourly
AVGVISIB_75S_120M_201608_EARTH  average Earth visibility
LPSR_75S_120M_201608            permanently shadowed regions
All at 120 m per pixel, same polar projection as the LOLA DEM.
"""

import numpy as np
import rasterio

from utils.geo import xy_to_latlon
from utils.paths import require


def read_map(path):
    """Read a PGDA 69 GeoTIFF applying its scale/offset. Returns (values, transform)."""
    with rasterio.open(require(path)) as ds:
        a = ds.read(1).astype(np.float64)
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
        a = a * ds.scales[0] + ds.offsets[0]
        return a, ds.transform


def sample_on_grid(values, transform, grid_x, grid_y):
    """Average of the 5x5 pixels (600 m) around each 500 m cell centre."""
    cols = (grid_x.ravel() - transform.c) / transform.a - 0.5
    rows = (grid_y.ravel() - transform.f) / transform.e - 0.5
    c0 = np.clip(np.round(cols).astype(int), 0, values.shape[1] - 1)
    r0 = np.clip(np.round(rows).astype(int), 0, values.shape[0] - 1)
    total = np.zeros(c0.size)
    count = np.zeros(c0.size)
    for dr in range(-2, 3):
        for dc in range(-2, 3):
            v = values[np.clip(r0 + dr, 0, values.shape[0] - 1), np.clip(c0 + dc, 0, values.shape[1] - 1)]
            ok = np.isfinite(v)
            total[ok] += v[ok]
            count[ok] += 1
    return (total / np.maximum(count, 1)).reshape(grid_x.shape)


def as_percent(a):
    # the visibility maps come as fractions 0-1
    return a * 100.0 if np.nanmax(a) <= 1.0001 else a


def compare(ours, nasa, mask):
    """Difference statistics between our map and NASA's (percentage points)."""
    d = (ours - nasa)[mask]
    return dict(
        n=int(mask.sum()),
        mean_abs=round(float(np.mean(np.abs(d))), 2),
        rmse=round(float(np.sqrt(np.mean(d ** 2))), 2),
        bias=round(float(np.mean(d)), 2),
        r=round(float(np.corrcoef(ours[mask], nasa[mask])[0, 1]), 3),
        p90_abs=round(float(np.percentile(np.abs(d), 90)), 2),
    )


def best_lit_spot(sun_full, transform, half_size=190000):
    """Sunniest 120 m pixel of the NASA map inside our square area."""
    rr, cc = np.mgrid[0:sun_full.shape[0], 0:sun_full.shape[1]]
    fx = transform.c + (cc + 0.5) * transform.a
    fy = transform.f + (rr + 0.5) * transform.e
    inside = (np.abs(fx) < half_size) & (np.abs(fy) < half_size)
    k = np.unravel_index(np.nanargmax(np.where(inside, sun_full, -1)), sun_full.shape)
    x, y = float(fx[k]), float(fy[k])
    lat, lon = xy_to_latlon(np.array([x]), np.array([y]))
    return dict(sun=round(float(sun_full[k]), 1), lat=round(float(lat[0]), 3), lon=round(float(lon[0]), 3), x=x, y=y)
