"""
---------------
OrbitalUV
---------------
Plan B for the 1 km horizons, for when you don't have the LOLA GeoTIFF.

The proper way is `python build_data.py horizons`, which traces them on
the 80 m LOLA map (181 MB, see SOURCES.md). This script uses instead the
400 m copy of the same map that travels inside site.json. It works without
downloading anything, but the horizons come out lower on average (about
0.3 deg), so the date maps show a bit more Sun and Earth than they should.
The files are marked as approximate and the website says so.

    python scripts/rebuild_date_horizons.py              writes to data/work/horizons_400m/
    python scripts/rebuild_date_horizons.py --replace    overwrites web/data (only if the 80 m files are lost)
"""

import base64
import io
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import date_maps                     # noqa: E402
from services.terrain import horizon_grid          # noqa: E402
from utils.paths import WEB_DATA_DIR, WORK_DIR     # noqa: E402


def site_dem():
    """The 400 m DEM stored in site.json, as the arrays horizon_grid expects."""
    with open(WEB_DATA_DIR / "site.json") as f:
        d = json.load(f)["dem"]
    rgb = np.array(Image.open(io.BytesIO(base64.b64decode(d["src"].split(",", 1)[1]))))
    code = rgb[:, :, 0].astype(np.uint16) * 256 + rgb[:, :, 1]
    z = code.astype(np.float32) * d["scale"] + d["offset"]
    z[code == 0] = np.nan                            # 0 means no data
    return z, d["x0"], d["y0"], d["px"], d["ny"], d["nx"]


def main():
    out_dir = WEB_DATA_DIR if "--replace" in sys.argv else WORK_DIR / "horizons_400m"
    gx, gy = date_maps.axes()
    xx, yy = np.meshgrid(gx, gy)

    t0 = time.time()
    print(f"tracing {xx.size} cells x {date_maps.N_DIRECTIONS} directions on the 400 m DEM...")
    h = horizon_grid(*site_dem(), xx.ravel(), yy.ravel(),
                     date_maps.N_DIRECTIONS, date_maps.MAX_DISTANCE, 0.0)
    print(f"done in {time.time() - t0:.0f} s")

    date_maps.write(h, out_dir=out_dir, dem_resolution_m=400, approximate=True,
                    source="400 m copy of LOLA LDEM_80S_80MPP_ADJ (NASA PGDA 90) from site.json, "
                           "horizons traced up to 150 km")
    print(f"written to {out_dir}")


if __name__ == "__main__":
    main()
