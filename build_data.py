"""
---------------
OrbitalUV
---------------
Rebuilds everything in web/data from the NASA files in data/nasa.

    python build_data.py            ephemeris table + site data
    python build_data.py ephem      only web/data/ephem_6h.json (needs the NAIF kernels)
    python build_data.py site       only web/data/site.json and raw_*.bin (needs the LOLA and PGDA 69 files)
    python build_data.py horizons   only web/data/horizons_1km.bin/.json (needs the LOLA file)
    python build_data.py team       copy config/team.json to the website
    python build_data.py csv        readable tables of the spots in data/exports/
    python build_data.py site --fresh   ignore the cached grid in data/work

The map grid takes about 10 minutes the first time; after that it is
read from data/work/grid.npz.
"""

import json
import shutil
import sys
import time

from utils.paths import ROOT, WEB_DATA_DIR


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def build_ephemeris():
    from services.ephemeris import build_web_table
    log("Sun/Earth table from NAIF kernels")
    path, n = build_web_table()
    log(f"  {n} rows -> {path}")


def build_site(fresh=False):
    from services import map_grid, site_data
    from services.ephemeris import map_directions
    from services.terrain import Dem

    log("loading LOLA DEM")
    dem = Dem()
    ephem = map_directions()
    log(f"JPL Horizons table: {len(ephem['times'])} instants, {ephem['times'][0]} -> {ephem['times'][-1]}")

    if fresh or not map_grid.CACHE.exists():
        log("map grid (slow, ~10 min)")
    grid = map_grid.load_or_compute(dem, ephem, force=fresh)

    site = site_data.build(dem, grid, ephem, log=log)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = WEB_DATA_DIR / "site.json"
    with open(path, "w") as f:
        json.dump(site, f)
    log(f"  {path.stat().st_size // 1024} KB -> {path}")
    site_data.export_rasters(site, WEB_DATA_DIR)
    log("  map layers -> web/data/raw_*.bin + rasters.json")


def build_horizons(fresh=False):
    from services import date_maps
    from services.terrain import Dem

    log("1 km horizons for the date maps (~1 min)")
    h = date_maps.load_or_compute(Dem(), force=fresh)
    path = date_maps.write(h)
    log(f"  {path.stat().st_size // 1024} KB -> {path}")


def copy_team():
    shutil.copy(ROOT / "config" / "team.json", WEB_DATA_DIR / "team.json")
    log("config/team.json -> web/data/team.json")


def export_csv():
    import csv
    out = ROOT / "data" / "exports"
    out.mkdir(parents=True, exist_ok=True)
    with open(WEB_DATA_DIR / "site.json") as f:
        site = json.load(f)

    cols = ["lat", "lon", "x", "y", "z", "slope", "near", "near_km", "nasa_sun", "nasa_earth"]
    with open(out / "candidate_spots.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for c in site["cands"]:
            w.writerow([c[k] for k in cols])

    cols = ["lat", "lon", "x", "y", "z", "slope", "near", "near_km", "nasa_sun", "nasa_earth",
            "sun", "earth", "both", "dark_h", "earth_gap_h", "psr", "kinds"]
    with open(out / "reference_spots.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for p in site["points"]:
            w.writerow([" ".join(p[k]) if k == "kinds" else p[k] for k in cols])

    with open(out / "reference_spots_monthly.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["lat", "lon", "month", "sun", "earth"])
        for p in site["points"]:
            for month, sun, earth in p["monthly"]:
                w.writerow([p["lat"], p["lon"], month, sun, earth])

    with open(out / "validation.json", "w") as f:
        json.dump(dict(validation=site["meta"]["validation"], best_lit=site["meta"]["best_lit"],
                       permanent_shadow_pct=site["meta"]["pct_psr"]), f, indent=2)
    log(f"tables -> {out}")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "all"
    fresh = "--fresh" in sys.argv
    if what in ("all", "ephem"):
        build_ephemeris()
    if what in ("all", "site"):
        build_site(fresh)
    if what in ("all", "horizons"):
        build_horizons(fresh)
    if what in ("all", "team"):
        copy_team()
    if what in ("all", "csv"):
        export_csv()
