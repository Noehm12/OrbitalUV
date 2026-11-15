"""
---------------
OrbitalUV
---------------
Writes web/data/raw_*.bin and rasters.json from web/data/site.json.

    python scripts/export_raster_bytes.py

build_data.py site already does this; run it by hand only if you changed
site.json some other way.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.site_data import export_rasters   # noqa: E402
from utils.paths import WEB_DATA_DIR             # noqa: E402


def main():
    with open(WEB_DATA_DIR / "site.json") as f:
        site = json.load(f)
    for name, layer in export_rasters(site, WEB_DATA_DIR).items():
        print(f"{name:5s} {layer['width']} x {layer['height']}  -> {layer['file']}")


if __name__ == "__main__":
    main()
