# Data files

What each data file is, where it comes from and what uses it.
Links to the original NASA files are in [SOURCES.md](SOURCES.md).

## 1. Inputs from NASA (`data/nasa/`)

### Included

| File | What it is | Used by |
|---|---|---|
| `JPL_Horizons_deGerlache_2h.csv` | Sun and Earth azimuth/elevation seen from the de Gerlache rim (88.68 S, 67.93 W, 1.794 km), every 2 h, 1 Nov 2026 - 31 Dec 2027. 5,112 rows. Columns: `time` (UTC), `sun_az`, `sun_el`, `earth_az`, `earth_el` (degrees). From the JPL Horizons API. | `services/map_grid.py` (map statistics) |
| `JPL_Horizons_Shackleton_12h.csv` | Same for the Shackleton rim (89.31 S, 114.10 W, 1.690 km), every 12 h. 851 rows. | `tests/test_ephemeris.py` (checks our Sun/Earth table) |
| `iau_features_south.csv` | Official names south of 83 S from the IAU Gazetteer of Planetary Nomenclature. 38 rows. Columns: `id`, `name`, `diameter_km`, `lat`, `lon`, `type`, `status`, `approved` (year). | `services/iau_names.py` (map labels, zone names) |
| `naif0012.tls` | NAIF leap seconds (data section of the official file). | `services/ephemeris.py` |
| `moon_de440_250416.tf` | NAIF definition of the MOON_ME frame, the one the LOLA map uses (data sections of the official file). | `services/ephemeris.py` |

### Downloaded separately (too big to include)

| File | Size | What it is |
|---|---|---|
| `LDEM_80S_80MPP_ADJ.TIF` | 181 MB | LOLA relief, height in metres every 80 m (PGDA 90) |
| `AVGVISIB_75S_120M_201608.TIF` | 83 MB | NASA average % of time in sunlight, 18.6 years (PGDA 69) |
| `AVGVISIB_75S_120M_201608_EARTH.TIF` | 43 MB | NASA average % of time with the Earth visible (PGDA 69) |
| `LPSR_75S_120M_201608.TIF` | 1 MB | NASA permanently shadowed regions (PGDA 69) |
| `de440s.bsp` | 32 MB | NAIF positions of the Sun, Earth and Moon (DE440) |
| `moon_pa_de440_200625.bpc` | 12 MB | NAIF orientation of the Moon |

## 2. Files the website loads (`web/data/`)

All of them are written by `build_data.py`.

### `site.json` (9.5 MB)

| Key | Content |
|---|---|
| `meta` | Map extent (`xmin`, `xmax`, `ymin`, `ymax` in metres, polar stereographic), cell size (500 m), period of our own statistics (`t0`, `t1`, `nsamples`), comparison with NASA (`validation`), sunniest NASA pixel (`best_lit`), % of the area in permanent shadow (`pct_psr`), relief range for the colour scale, slope and latitude limits used to choose spots. |
| `img.hill` | Shaded relief of the LOLA DEM (JPEG, 1020 x 1020). |
| `img.data` | PNG, 761 x 761 cells of 500 m. R = NASA sunlight %, G = NASA Earth visibility %, B = our "Sun and Earth at once" %. Value = % x 2, 255 = no data. |
| `img.aux` | PNG. R = longest night in 4 h units, G = permanent shadow (255 = yes), B = our sunlight %. |
| `img.own` | PNG. Our own Nov 2026 - Dec 2027 figures: R = sunlight %, G = Earth visible %, B = Sun and Earth at once %. All three come from the same calculation, so "at once" is never higher than either of the other two. |
| `img.elev` | PNG. R and G = height + 10,000 m as a 16-bit number, B = slope x 4 (degrees). |
| `dem` | LOLA relief averaged to 400 m, as a PNG (16-bit height in R and G, value = (height + 8000) x 4, 0 = no data). Used to draw shadows in the browser. |
| `features` | The IAU names with their map position (`x`, `y`) and diameter `d` in km. |
| `cands` | The 315 candidate spots the calculator analyses: `lat`, `lon`, `x`, `y`, height `z` (m), `slope` (deg), nearest named feature, NASA sunlight and Earth %. |
| `candH` | Horizon of each candidate in 720 directions (every 0.5 deg, clockwise from longitude 0), int16 in hundredths of a degree, base64. |
| `points` | 26 reference spots for the "More" screen. Same fields as `cands`, plus our 14-month `sun`, `earth` and `both` %, longest night (`dark_h`) and longest time without Earth (`earth_gap_h`) in hours, permanent shadow (`psr`), month by month values and their 720-direction horizon. `kinds` says which list they come from (`both`, `sun`, `earth`). |

### `ephem_6h.json` (0.7 MB)

Sun and Earth position seen from the Moon's centre every 6 h from 1 Jan 2025 to 1 Jan 2041
(23,377 rows), in km, MOON_ME frame, computed from the NAIF kernels. `data` holds the numbers
as float32 in base64 (6 per row: sun x, y, z, earth x, y, z). The calculator interpolates
between rows.

### `horizons_1km.bin` + `horizons_1km.json` (12.5 MB)

Horizon of every 1 km cell (381 x 381 cells, 90 directions, traced on the 80 m LOLA map)
for the "your dates" maps. Raw bytes, cell by cell from the top-left corner, 90 directions
per cell; each byte is (horizon + 6.5 deg) x 10. The JSON gives the grid, the scale and the
source. If some cells have no terrain under them, `horizons_1km_valid.bin` (one byte per
cell, 1 = usable) is written too and the JSON points to it.

These used to be a PNG. A PNG that gets resized on the way (some upload and chat tools do
this) is still a valid image, so the error went unnoticed; a byte file with the wrong
length is rejected by the website straight away.

### `raw_data.bin`, `raw_elev.bin`, `raw_aux.bin`, `raw_own.bin`, `raw_dem.bin` + `rasters.json`

The same layers as `img.data`, `img.elev`, `img.aux`, `img.own` and `dem` inside `site.json`, as plain
RGB bytes. The website reads these and not the PNGs, because some browsers add noise to
images read back through a canvas (anti-fingerprinting), which would change the numbers.
`rasters.json` has the size and SHA-256 of each one; the page checks them before using them.
Written by `build_data.py site` (or `scripts/export_raster_bytes.py`).

### `team.json`

Copy of `config/team.json` for the Team page.

## 3. Readable tables (`data/exports/`)

Made with `python build_data.py csv` from `site.json`, to open in Excel or similar.

| File | Content |
|---|---|
| `candidate_spots.csv` | The 315 calculator spots: position, height, slope, nearest name, NASA sunlight and Earth %. |
| `reference_spots.csv` | The 26 reference spots: the above plus our Sun, Earth and Sun+Earth %, longest night and longest time without Earth (Nov 2026 - Dec 2027), permanent shadow and list. |
| `reference_spots_monthly.csv` | Sun and Earth % of each reference spot, month by month. |
| `validation.json` | Our maps against NASA's: mean difference, RMSE, bias, correlation, 90th percentile, for the whole map and south of 84 S. |

## 4. Intermediate files (`data/work/`)

Cache written by `build_data.py`; safe to delete.

| File | Content |
|---|---|
| `grid.npz` | Our 500 m maps: sunlight, Earth, both, longest nights, height, lat/lon (~10 min to compute). |
| `horizons_1km.npy` | 1 km horizons in degrees, before quantizing them. |
| `horizons_400m/` | Output of `scripts/rebuild_date_horizons.py` (approximate horizons from the 400 m DEM). |

## 5. Libraries shipped with the website (`web/vendor/`)

| File | What it is |
|---|---|
| `plotly.min.js` | Plotly.js 3.3.1 (MIT licence), draws the charts. Kept in the project so the site works without internet. |
