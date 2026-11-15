"""
---------------
OrbitalUV
---------------
Builds web/data/site.json, the file the website loads.

It contains:
  meta      map extent, validation against NASA, best lit spot...
  img       map layers packed as images (relief, NASA sunlight/Earth, our maps)
  dem       400 m DEM for the shadow simulation in the browser
  features  IAU names
  cands     candidate spots for the calculator + their horizons (candH)
  points    reference spots for the "More" screen
"""

import base64

import numpy as np

from services import candidates, iau_names, nasa_maps, terrain
from services.map_grid import HALF_SIZE, STEP
from services.visibility import spot_stats
from utils.geo import xy_to_latlon
from utils.images import jpeg_data_url, png_data_url
from utils.paths import EARTH_VISIBILITY_FILE, PERMANENT_SHADOW_FILE, SUN_VISIBILITY_FILE

N_DIRECTIONS_FINE = 720      # one every 0.5 deg
MAX_DISTANCE = 150000.0


def _byte_percent(a):
    # 0-100 % -> 0-200 (half-point steps), 255 = no data
    out = np.clip(np.round(np.nan_to_num(a, nan=0) * 2), 0, 200).astype(np.uint8)
    out[~np.isfinite(a)] = 255
    return out


def _layers(grid, slope, nasa_sun, nasa_earth, shadow):
    data = np.stack([_byte_percent(nasa_sun), _byte_percent(nasa_earth), _byte_percent(grid["both"] * 100)], -1)
    dark = np.clip(grid["sun_dark_h"] / 4, 0, 254).astype(np.uint8)          # longest night, in 4 h units
    aux = np.stack([dark, (np.nan_to_num(shadow) > 0.5).astype(np.uint8) * 255, _byte_percent(grid["sun"] * 100)], -1)
    z16 = np.clip(np.round(grid["z"] + 10000), 0, 65535).astype(np.uint16)   # height + 10 km, 16 bits
    elev = np.stack([(z16 >> 8).astype(np.uint8), (z16 & 255).astype(np.uint8),
                     np.minimum(slope * 4, 255).astype(np.uint8)], -1)
    # our own 14-month figures, all three from the same calculation so they always agree
    own = np.stack([_byte_percent(grid["sun"] * 100), _byte_percent(grid["earth"] * 100),
                    _byte_percent(grid["both"] * 100)], -1)
    return png_data_url(data), png_data_url(aux), png_data_url(elev), png_data_url(own)


def build(dem, grid, ephem, log=print):
    gx, gy = grid["gx"], grid["gy"]
    xx, yy = np.meshgrid(gx, gy)
    xs, ys = xx.ravel(), yy.ravel()

    log("slope")
    slope80 = terrain.slope_80m(dem)
    slope = terrain.grid_slope(dem, slope80, gx, gy)
    usable = candidates.usable_cells(slope, grid["z"], grid["lat"], gx, gy)

    log("NASA illumination maps")
    sun_full, sun_tf = nasa_maps.read_map(SUN_VISIBILITY_FILE)
    earth_full, earth_tf = nasa_maps.read_map(EARTH_VISIBILITY_FILE)
    shadow_full, shadow_tf = nasa_maps.read_map(PERMANENT_SHADOW_FILE)
    nasa_sun = nasa_maps.sample_on_grid(sun_full, sun_tf, xx, yy)
    nasa_earth = nasa_maps.sample_on_grid(earth_full, earth_tf, xx, yy)
    shadow = nasa_maps.sample_on_grid(shadow_full, shadow_tf, xx, yy)
    sun_scale = 100.0 if np.nanmax(nasa_sun) <= 1.0001 else 1.0
    nasa_sun = nasa_sun * sun_scale
    nasa_earth = nasa_maps.as_percent(nasa_earth)

    # how close is our 14-month calculation to NASA's 18.6-year average?
    z = grid["z"]
    everywhere = np.isfinite(nasa_sun) & np.isfinite(nasa_earth) & np.isfinite(z)
    south_84 = everywhere & (grid["lat"] <= -84)
    validation = dict(
        sun_all=nasa_maps.compare(grid["sun"] * 100, nasa_sun, everywhere),
        earth_all=nasa_maps.compare(grid["earth"] * 100, nasa_earth, everywhere),
        sun_84=nasa_maps.compare(grid["sun"] * 100, nasa_sun, south_84),
        earth_84=nasa_maps.compare(grid["earth"] * 100, nasa_earth, south_84),
    )
    log(f"validation sun: {validation['sun_all']}  earth: {validation['earth_all']}")

    features = iau_names.load_features()
    best_lit = nasa_maps.best_lit_spot(sun_full * sun_scale, sun_tf, HALF_SIZE)
    near = iau_names.nearest(features, best_lit.pop("x"), best_lit.pop("y"))
    best_lit.update(near=near[1], near_km=round(near[0], 1))
    pct_shadow = float(np.nanmean(shadow[np.isfinite(shadow)] > 0.5) * 100)

    usable = usable & np.isfinite(nasa_sun) & np.isfinite(nasa_earth)

    def describe(i):
        x, y = xs[i], ys[i]
        d, name, _ = iau_names.nearest(features, x, y)
        return dict(z=round(dem.height(x, y)), slope=round(terrain.point_slope(dem, slope80, x, y), 1),
                    near=name, near_km=round(d, 1),
                    nasa_sun=round(float(nasa_sun.ravel()[i]), 1), nasa_earth=round(float(nasa_earth.ravel()[i]), 1))

    log("calculator candidates")
    chosen = candidates.calculator_candidates(grid["both"], nasa_sun, nasa_earth, usable, gx, gy)
    horizons = terrain.horizon_profiles(*dem.args(), xs[chosen], ys[chosen], N_DIRECTIONS_FINE, MAX_DISTANCE)
    horizons16 = np.clip(np.round(horizons * 100), -32768, 32767).astype("<i2")
    cands = []
    for i in chosen:
        lat, lon = xy_to_latlon(np.array([xs[i]]), np.array([ys[i]]))
        info = describe(i)
        cands.append(dict(x=round(float(xs[i])), y=round(float(ys[i])), lat=round(float(lat[0]), 4),
                          lon=round(float(lon[0]), 4), **info))
    log(f"  {len(cands)} spots")

    log("reference spots")
    lists = candidates.reference_lists(grid["both"], nasa_sun, nasa_earth, usable, gx, gy)
    spots = []
    for idx in lists.values():
        spots += [i for i in idx if i not in spots]
    profiles = terrain.horizon_profiles(*dem.args(), xs[spots], ys[spots], N_DIRECTIONS_FINE, MAX_DISTANCE)
    points = []
    for k, i in enumerate(spots):
        p = spot_stats(xs[i], ys[i], profiles[k], ephem)
        p.update(describe(i))
        p.update(psr=bool(shadow.ravel()[i] > 0.5),
                 horizon720=[round(float(v), 2) for v in profiles[k]],
                 kinds=[kind for kind, idx in lists.items() if i in idx])
        points.append(p)

    log("images")
    data_img, aux_img, elev_img, own_img = _layers(grid, slope, nasa_sun, nasa_earth, shadow)
    hill = jpeg_data_url(terrain.hillshade(dem, gx[0], gx[-1], gy[-1], gy[0], STEP))
    dem_rgb, dem_info = terrain.browser_dem(dem)

    zr = z[np.isfinite(z)]
    times = ephem["times"]
    meta = dict(
        xmin=gx[0] - STEP / 2, xmax=gx[-1] + STEP / 2, ymin=gy[-1] - STEP / 2, ymax=gy[0] + STEP / 2,
        step=STEP, nx=len(gx), ny=len(gy), t0=str(times[0]), t1=str(times[-1]), nsamples=len(times),
        validation=validation, best_lit=best_lit, pct_psr=round(pct_shadow, 1),
        relief_range=[float(np.percentile(zr, 1)), float(np.percentile(zr, 99))],
        slope_max=candidates.MAX_SLOPE_DEG, lat_max=candidates.MAX_LAT,
    )
    return dict(
        meta=meta, points=points, features=features,
        img=dict(hill=hill, data=data_img, elev=elev_img, aux=aux_img, own=own_img),
        dem=dict(src=png_data_url(dem_rgb), **dem_info),
        cands=cands,
        candH=dict(naz=N_DIRECTIONS_FINE, scale=0.01, b64=base64.b64encode(horizons16.tobytes()).decode()),
    )


def export_rasters(site, out_dir):
    """Write the numeric map layers of site.json as raw RGB bytes, plus a manifest.

    site.json keeps them as PNG so it stays one file, but the website must not
    decode them through a canvas: some browsers add noise to canvas reads
    (anti-fingerprinting) and that would quietly change the percentages.
    The manifest has the size and SHA-256 of each file so the page can check them.
    """
    import hashlib
    import io
    import json

    from PIL import Image

    layers = [(name, site["img"][name], site["meta"]["nx"], site["meta"]["ny"]) for name in ("data", "elev", "aux", "own")]
    layers.append(("dem", site["dem"]["src"], site["dem"]["nx"], site["dem"]["ny"]))
    manifest = {}
    for name, url, width, height in layers:
        img = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
        if img.size != (width, height) or img.mode != "RGB":
            raise ValueError(f"{name}: expected {width}x{height} RGB, got {img.size} {img.mode}")
        raw = img.tobytes()
        file = f"raw_{name}.bin"
        (out_dir / file).write_bytes(raw)
        manifest[name] = dict(file=file, width=width, height=height, channels=3,
                              sha256=hashlib.sha256(raw).hexdigest())
    (out_dir / "rasters.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
