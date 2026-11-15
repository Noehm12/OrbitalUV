"""
---------------
OrbitalUV
---------------
Folder layout used by the data scripts.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NASA_DIR = ROOT / "data" / "nasa"    # files downloaded from NASA (see SOURCES.md)
WORK_DIR = ROOT / "data" / "work"    # intermediate results, safe to delete
WEB_DATA_DIR = ROOT / "web" / "data" # what the website loads

DEM_FILE = NASA_DIR / "LDEM_80S_80MPP_ADJ.TIF"
SUN_VISIBILITY_FILE = NASA_DIR / "AVGVISIB_75S_120M_201608.TIF"
EARTH_VISIBILITY_FILE = NASA_DIR / "AVGVISIB_75S_120M_201608_EARTH.TIF"
PERMANENT_SHADOW_FILE = NASA_DIR / "LPSR_75S_120M_201608.TIF"
HORIZONS_TABLE_FILE = NASA_DIR / "JPL_Horizons_deGerlache_2h.csv"
IAU_NAMES_FILE = NASA_DIR / "iau_features_south.csv"

NAIF_KERNELS = [
    "naif0012.tls",
    "moon_de440_250416.tf",
    "moon_pa_de440_200625.bpc",
    "de440s.bsp",
]


def require(path):
    """Stop with a clear message if an input file is missing."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"Missing input file: {path}\n"
            "Download it from the link in SOURCES.md and put it in data/nasa/."
        )
    return path
