"""
---------------
OrbitalUV
---------------
Where are the Sun and the Earth, seen from the Moon?

Two sources, both from NASA:
  * NAIF kernels (DE440 + lunar orientation), read with SPICE. They give
    positions for any date; we write a table every 6 h for 2025-2040 that
    the website interpolates (web/data/ephem_6h.json).
  * The JPL Horizons table in data/nasa/, used for the long-term map
    statistics (Nov 2026 - Dec 2027, every 2 h).
"""

import base64
import datetime as dt
import json

import numpy as np
import pandas as pd

from services.horizons import DE_GERLACHE, load_sun_earth_table
from utils.geo import azel_to_vectors, local_frame
from utils.paths import HORIZONS_TABLE_FILE, NAIF_KERNELS, NASA_DIR, WEB_DATA_DIR, require

TABLE_START = dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc)
TABLE_END = dt.datetime(2041, 1, 1, tzinfo=dt.timezone.utc)

# Example printed by NAIF inside moon_de440_250416.tf: Earth seen from the Moon,
# 2022 SEP 30 TDB, MOON_ME frame, no corrections (km)
NAIF_EXAMPLE = [374008.654, -23435.970, 10141.334]


def load_kernels():
    import spiceypy as sp
    for name in NAIF_KERNELS:
        sp.furnsh(str(require(NASA_DIR / name)))
    return sp


def check_kernels(sp):
    """Run NAIF's own example; if this fails the kernels are wrong or incomplete."""
    state = sp.spkezr("EARTH", sp.str2et("2022 SEP 30 TDB"), "MOON_ME", "NONE", "MOON")[0]
    return np.allclose(state[:3], NAIF_EXAMPLE, atol=0.002), state[:3]


def sun_earth_at(sp, unix_ms):
    """Sun and Earth position (km) from the Moon's centre, MOON_ME frame, as seen (light time + aberration)."""
    utc = dt.datetime.fromtimestamp(unix_ms / 1000, dt.timezone.utc)
    et = sp.str2et(utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3])
    sun = sp.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")[0]
    earth = sp.spkpos("EARTH", et, "MOON_ME", "LT+S", "MOON")[0]
    return np.concatenate([sun, earth])


def build_web_table(step_hours=6, out_dir=WEB_DATA_DIR):
    """Write the Sun/Earth table the website uses (float32, base64 inside a JSON file)."""
    sp = load_kernels()
    ok, value = check_kernels(sp)
    if not ok:
        raise RuntimeError(f"NAIF example check failed: got {value}, expected {NAIF_EXAMPLE}")

    t0 = TABLE_START.timestamp() * 1000
    t1 = TABLE_END.timestamp() * 1000
    step_ms = step_hours * 3600e3
    n = int((t1 - t0) // step_ms) + 1
    rows = np.array([sun_earth_at(sp, t0 + i * step_ms) for i in range(n)]).astype("<f4")

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"ephem_{step_hours:g}h.json"
    meta = {
        "t0_utc": "2025-01-01T00:00:00Z", "step_hours": step_hours, "n": n,
        "columns": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z"], "units": "km",
        "frame": "MOON_ME (DE440, ME421-aligned)", "origin": "Moon centre", "correction": "LT+S",
        "dtype": "float32 little-endian", "kernels": NAIF_KERNELS,
        "source": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
        "encoding": "base64 of float32 little-endian, row-major (n x 6)",
        "data": base64.b64encode(rows.tobytes()).decode(),
    }
    with open(path, "w") as f:
        json.dump(meta, f)
    return path, n


def map_directions(path=HORIZONS_TABLE_FILE):
    """Sun and Earth unit vectors (Moon-fixed) for every row of the JPL Horizons table.

    The table is for one observer (de Gerlache rim). Turning its az/el into
    vectors lets us reuse it for every point of the map; the Sun is so far
    away that the observer position does not matter, and for the Earth the
    shift across the mapped area is under 0.05 deg.
    """
    table = load_sun_earth_table(require(path))
    frame = local_frame(DE_GERLACHE["lat"], DE_GERLACHE["lon"])
    return {
        "times": pd.DatetimeIndex(table["time"]),
        "sun": azel_to_vectors(table.sun_az.values, table.sun_el.values, frame).astype(np.float64),
        "earth": azel_to_vectors(table.earth_az.values, table.earth_el.values, frame).astype(np.float64),
    }


def read_web_table(path=WEB_DATA_DIR / "ephem_6h.json"):
    with open(require(path)) as f:
        meta = json.load(f)
    rows = np.frombuffer(base64.b64decode(meta["data"]), dtype="<f4").reshape(-1, 6).astype(np.float64)
    return rows, meta["step_hours"] * 3600e3


def interpolate(rows, step_ms, unix_ms):
    """Same Catmull-Rom interpolation as web/js/lunar.js (moonFixed)."""
    u = (unix_ms - TABLE_START.timestamp() * 1000) / step_ms
    i = min(int(np.floor(u)), len(rows) - 2)
    f = u - i
    p0, p1, p2, p3 = rows[max(i - 1, 0)], rows[i], rows[i + 1], rows[min(i + 2, len(rows) - 1)]
    return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f ** 2
                  + (3 * p1 - p0 - 3 * p2 + p3) * f ** 3)
