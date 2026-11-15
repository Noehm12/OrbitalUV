"""
---------------
OrbitalUV
---------------
Horizons for the "maps for your dates" feature.

The website can't trace horizons for the whole map on the fly, so we
trace them here once: one cell per km (381 x 381), 90 directions. With
those, the browser only has to check, for each instant of the user's
dates, whether the Sun and the Earth are above each cell's horizon.

Stored as raw bytes (horizons_1km.bin), cell by cell from the top-left
corner, 90 directions per cell: value = (horizon + 6.5 deg) * 10, so
0.1 deg steps from -6.5 to +19 deg. Higher horizons are clipped at 19 deg;
even at the map corners (~81 S) the Earth stays below ~17 deg, so a
clipped cell is simply never in view.

We used to pack this into a PNG, but image tools and chat uploads
sometimes resize PNGs, and a resized horizon image is silently wrong.
A plain byte file either has the right length or it is rejected.
"""

import json

import numpy as np

from services.terrain import horizon_grid
from utils.paths import WEB_DATA_DIR, WORK_DIR

STEP = 1000.0
HALF_SIZE = 190000.0
N_DIRECTIONS = 90
MAX_DISTANCE = 150000.0
OFFSET, SCALE = -6.5, 0.1
CACHE = WORK_DIR / "horizons_1km.npy"
LOLA_SOURCE = "LOLA LDEM_80S_80MPP_ADJ (NASA PGDA 90), 80 m, horizons traced up to 150 km"


def axes():
    gx = np.arange(-HALF_SIZE, HALF_SIZE + 1, STEP)
    gy = np.arange(HALF_SIZE, -HALF_SIZE - 1, -STEP)
    return gx, gy


def compute(dem):
    gx, gy = axes()
    xx, yy = np.meshgrid(gx, gy)
    return horizon_grid(*dem.args(), xx.ravel(), yy.ravel(), N_DIRECTIONS, MAX_DISTANCE, 0.0)


def load_or_compute(dem, force=False):
    if CACHE.exists() and not force:
        return np.load(CACHE)
    h = compute(dem)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.save(CACHE, h)
    return h


def quantize(h):
    return np.clip(np.round((h - OFFSET) / SCALE), 0, 255).astype(np.uint8)


def read(out_dir=WEB_DATA_DIR):
    """Horizons back in degrees, shape (cells, directions), plus the metadata."""
    with open(out_dir / "horizons_1km.json") as f:
        meta = json.load(f)
    q = np.fromfile(out_dir / meta["binary"], dtype=np.uint8)
    return q.reshape(-1, meta["naz"]).astype(np.float32) * meta["scale"] + meta["offset"], meta


def write(h, out_dir=WEB_DATA_DIR, source=LOLA_SOURCE, dem_resolution_m=80, approximate=False):
    """Save the horizons and their metadata. Cells with no terrain under them are marked invalid."""
    gx, gy = axes()
    if h.shape != (len(gx) * len(gy), N_DIRECTIONS):
        raise ValueError(f"expected {len(gx) * len(gy)} x {N_DIRECTIONS} horizons, got {h.shape}")
    valid = np.all(np.isfinite(h) & (h > -90), axis=1)
    q = quantize(np.where(np.isfinite(h), h, 90.0))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "horizons_1km.bin").write_bytes(q.tobytes())
    meta = dict(
        binary="horizons_1km.bin", nx=len(gx), ny=len(gy), step=STEP,
        x0=float(gx[0]), y0=float(gy[0]),          # centre of the top-left cell
        naz=N_DIRECTIONS, offset=OFFSET, scale=SCALE,
        source=source, dem_resolution_m=dem_resolution_m,
    )
    if not valid.all():
        (out_dir / "horizons_1km_valid.bin").write_bytes(valid.astype(np.uint8).tobytes())
        meta["valid"] = "horizons_1km_valid.bin"
    else:
        (out_dir / "horizons_1km_valid.bin").unlink(missing_ok=True)
    if approximate:
        meta["approximate"] = True
    with open(out_dir / "horizons_1km.json", "w") as f:
        json.dump(meta, f, indent=2)
    return out_dir / "horizons_1km.bin"
