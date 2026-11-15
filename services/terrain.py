"""
---------------
OrbitalUV
---------------
Terrain analysis on the NASA LOLA south pole DEM (PGDA product 90).

The DEM is LDEM_80S_80MPP_ADJ.TIF: heights in metres, 80 m per pixel,
south polar stereographic. Everything here works in map metres.
"""

import numpy as np
import rasterio
from numba import njit, prange
from PIL import Image

from utils.geo import MOON_RADIUS_M
from utils.paths import DEM_FILE, require


class Dem:
    """Height grid plus the numbers needed to go from map metres to pixels."""

    def __init__(self, path=DEM_FILE):
        with rasterio.open(require(path)) as ds:
            self.z = ds.read(1).astype(np.float32)   # NaN where there is no data
            self.x0 = ds.transform.c                  # left edge
            self.y0 = ds.transform.f                  # top edge
            self.px = ds.transform.a                  # 80 m
        self.rows, self.cols = self.z.shape

    def args(self):
        # the numba functions take plain arrays and numbers, not objects
        return self.z, self.x0, self.y0, self.px, self.rows, self.cols

    def height(self, x, y):
        return float(height_at(*self.args(), x, y))

    def pixel(self, x, y):
        return int((self.y0 - y) / self.px - 0.5), int((x - self.x0) / self.px - 0.5)


@njit(inline="always")
def height_at(z, x0, y0, px, rows, cols, x, y):
    """Bilinear height at map point (x, y). NaN outside the DEM."""
    c = (x - x0) / px - 0.5
    r = (y0 - y) / px - 0.5
    if c < 0 or r < 0 or c >= cols - 1 or r >= rows - 1:
        return np.nan
    c0 = int(c)
    r0 = int(r)
    fc = c - c0
    fr = r - r0
    return ((z[r0, c0] * (1 - fc) + z[r0, c0 + 1] * fc) * (1 - fr)
            + (z[r0 + 1, c0] * (1 - fc) + z[r0 + 1, c0 + 1] * fc) * fr)


@njit(parallel=True)
def horizon_grid(z, x0, y0, px, rows, cols, xs, ys, naz, dmax, mast):
    """Horizon elevation (deg) in `naz` directions for many points.

    For every direction we walk away from the point and keep the highest
    angle to the terrain, taking the Moon's curvature into account
    (the d^2 / 2R drop). Steps grow with distance (2 %, at least 80 m).
    """
    n = xs.shape[0]
    out = np.full((n, naz), -90.0, np.float32)
    for i in prange(n):
        xa = xs[i]
        ya = ys[i]
        za = height_at(z, x0, y0, px, rows, cols, xa, ya) + mast
        rho = np.hypot(xa, ya)
        c = 2 * np.arctan(rho / (2 * MOON_RADIUS_M))
        k = 2.0 / (1.0 + np.cos(c))   # stereographic scale factor: ground metres -> map metres
        for a in range(naz):
            b = np.radians(a * 360.0 / naz)
            sx = np.sin(b)
            sy = np.cos(b)
            best = -1e9
            d = 80.0
            while d < dmax:
                h = height_at(z, x0, y0, px, rows, cols, xa + sx * d * k, ya + sy * d * k)
                if np.isnan(h):
                    break
                t = (h - za - d * d / (2 * MOON_RADIUS_M)) / d
                if t > best:
                    best = t
                d += max(80.0, d * 0.02)
            out[i, a] = np.degrees(np.arctan(best))
    return out


@njit(parallel=True)
def horizon_profiles(z, x0, y0, px, rows, cols, xs, ys, naz, dmax):
    """Same idea as horizon_grid but finer (40 m steps, 0.5 %), used for single spots."""
    n = xs.shape[0]
    out = np.full((n, naz), -90.0, np.float32)
    for q in prange(n * naz):
        i = q // naz
        a = q % naz
        xa = xs[i]
        ya = ys[i]
        za = height_at(z, x0, y0, px, rows, cols, xa, ya)
        rho = np.hypot(xa, ya)
        c = 2 * np.arctan(rho / (2 * MOON_RADIUS_M))
        k = 2.0 / (1.0 + np.cos(c))
        b = np.radians(a * 360.0 / naz)
        sx = np.sin(b)
        sy = np.cos(b)
        best = -1e9
        d = 40.0
        while d < dmax:
            h = height_at(z, x0, y0, px, rows, cols, xa + sx * d * k, ya + sy * d * k)
            if np.isnan(h):
                break
            t = (h - za - d * d / (2 * MOON_RADIUS_M)) / d
            if t > best:
                best = t
            d += max(40.0, d * 0.005)
        out[i, a] = np.degrees(np.arctan(best))
    return out


def slope_80m(dem):
    """Slope in degrees for every 80 m pixel."""
    gy, gx = np.gradient(dem.z, dem.px)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def grid_slope(dem, slope, gx, gy):
    """Slope of each analysis cell: median of the 7x7 pixels (560 m) around its centre."""
    cols = ((gx - dem.x0) / dem.px - 0.5).astype(int)
    rows = ((dem.y0 - gy) / dem.px - 0.5).astype(int)
    out = np.zeros((len(gy), len(gx)), np.float32)
    for i, r in enumerate(rows):
        block = np.stack([slope[r + dr, cols + dc] for dr in range(-3, 4) for dc in range(-3, 4)])
        out[i] = np.median(block, axis=0)
    return out


def point_slope(dem, slope, x, y):
    r, c = dem.pixel(x, y)
    return float(np.median(slope[r - 3:r + 4, c - 3:c + 4]))


def hillshade(dem, xmin, xmax, ymin, ymax, step, size=1020):
    """Shaded relief image (uint8) of the analysis area, lit from the north-west."""
    span = xmax - xmin + step
    res = span / size
    c0 = int((xmin - step / 2 - dem.x0) / dem.px)
    r0 = int((dem.y0 - (ymax + step / 2)) / dem.px)
    n = int(round(span / dem.px))
    sub = dem.z[r0:r0 + n, c0:c0 + n]
    zd = np.array(Image.fromarray(sub).resize((size, size), Image.BILINEAR), np.float32)
    gy, gx = np.gradient(zd, res)

    az, alt = np.radians(315), np.radians(35)
    nx, ny = -gx * 2.0, gy * 2.0          # x2 vertical exaggeration so small craters show up
    nz = np.ones_like(nx)
    norm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    lx, ly, lz = np.cos(alt) * np.sin(az), np.cos(alt) * np.cos(az), np.sin(alt)
    shade = np.clip((nx * lx + ny * ly + nz * lz) / norm, 0, 1)
    return (np.clip(shade ** 0.9, 0, 1) * 225 + 20).astype(np.uint8)


def browser_dem(dem, factor=5):
    """DEM averaged to 400 m and packed in an RGB image (16-bit height in R and G).

    The website uses it to draw sunlight and shadows. Encoding:
    value = round((height + 8000) * 4), 0 means no data.
    """
    nr = (dem.rows // factor) * factor
    nc = (dem.cols // factor) * factor
    small = dem.z[:nr, :nc].reshape(nr // factor, factor, nc // factor, factor).mean(axis=(1, 3))
    enc = np.clip(np.round((small + 8000.0) * 4), 1, 65535)
    enc[~np.isfinite(small)] = 0
    enc = enc.astype(np.uint16)
    rgb = np.stack([(enc >> 8).astype(np.uint8), (enc & 255).astype(np.uint8), np.zeros_like(enc, np.uint8)], -1)
    info = dict(x0=dem.x0, y0=dem.y0, px=dem.px * factor, nx=nc // factor, ny=nr // factor,
                offset=-8000.0, scale=0.25)
    return rgb, info
