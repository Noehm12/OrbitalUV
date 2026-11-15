import numpy as np
import pandas as pd
import pytest

from services.ephemeris import interpolate, read_web_table
from utils.geo import MOON_RADIUS_M, vectors_to_azel
from utils.paths import NAIF_KERNELS, NASA_DIR, WEB_DATA_DIR

SHACKLETON = dict(lat=-89.3136, lon=-114.1022, height_km=1.690)


def _azel_from_table(rows, step, when, site):
    v = interpolate(rows, step, when.timestamp() * 1000)
    lat, lon = site["lat"], site["lon"]
    p, l = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    observer = up * (MOON_RADIUS_M / 1000 + site["height_km"])
    out = []
    for body in (v[:3], v[3:]):
        d = body - observer
        az, el = vectors_to_azel((d / np.linalg.norm(d))[None, :], lat, lon)
        out += [az[0], el[0]]
    return out


@pytest.mark.skipif(not (WEB_DATA_DIR / "ephem_6h.json").exists(), reason="run build_data.py ephem first")
def test_web_table_matches_jpl_horizons():
    rows, step = read_web_table()
    jpl = pd.read_csv(NASA_DIR / "JPL_Horizons_Shackleton_12h.csv", parse_dates=["time"])
    worst = 0.0
    for r in jpl.itertuples():
        when = r.time.tz_localize("UTC")
        saz, sel, eaz, eel = _azel_from_table(rows, step, when, SHACKLETON)
        worst = max(worst, abs(sel - r.sun_el), abs(eel - r.earth_el),
                    abs((saz - r.sun_az + 180) % 360 - 180), abs((eaz - r.earth_az + 180) % 360 - 180))
    assert worst < 0.001


@pytest.mark.skipif(not all((NASA_DIR / k).exists() for k in NAIF_KERNELS), reason="NAIF kernels not downloaded")
def test_naif_kernels_reproduce_naif_example():
    from services.ephemeris import check_kernels, load_kernels
    ok, value = check_kernels(load_kernels())
    assert ok, value
