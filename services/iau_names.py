"""
---------------
OrbitalUV
---------------
Official names of craters and mountains near the south pole.

From the IAU Gazetteer of Planetary Nomenclature (USGS), saved in
data/nasa/iau_features_south.csv (everything south of 83 S).
"""

import csv

import numpy as np

from utils.geo import latlon_to_xy
from utils.paths import IAU_NAMES_FILE, require


def load_features(path=IAU_NAMES_FILE):
    features = []
    with open(require(path)) as f:
        for row in csv.DictReader(f):
            x, y = latlon_to_xy(float(row["lat"]), float(row["lon"]))
            features.append(dict(
                name=row["name"], d=float(row["diameter_km"]), type=row["type"],
                lat=float(row["lat"]), lon=float(row["lon"]), x=round(x), y=round(y), id=int(row["id"]),
            ))
    return features


def nearest(features, x, y, min_diameter_km=5):
    """(distance km, name, type) of the closest named feature centre. Tiny craters are skipped."""
    best = None
    for f in features:
        if f["d"] < min_diameter_km:
            continue
        d = np.hypot(x - f["x"], y - f["y"]) / 1000
        if best is None or d < best[0]:
            best = (d, f["name"], f["type"])
    return best
