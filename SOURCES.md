# Data sources

## Relief of the south pole (NASA)
- PGDA product 90, "A New View of the Lunar South Pole from LOLA": https://pgda.gsfc.nasa.gov/products/90
- File: `LDEM_80S_80MPP_ADJ.TIF` (heights in metres, 80 m/pixel): https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF
- Barker et al. 2023, Planetary Science Journal 4, 183. doi:10.3847/PSJ/acf3e1
- Used for: shaded relief, heights, slopes and every horizon (80 m for the candidates and the 1 km date-map horizons; a 400 m copy for the day-by-day shadow view).

## Sunlight, Earth visibility and permanent shadow (NASA)
- PGDA product 69, "Lunar Polar Illumination" (Mazarico et al. 2011): https://pgda.gsfc.nasa.gov/products/69
- `AVGVISIB_75S_120M_201608.TIF`: https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF
- `AVGVISIB_75S_120M_201608_EARTH.TIF`: https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF
- `LPSR_75S_120M_201608.TIF`: https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_75S_120M_201608.TIF
- Used for: the Sunlight, Earth visible and Permanent shadow layers, and to check our own maps.

## Sun and Earth positions for any date (NASA NAIF / JPL)
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
  - `spk/planets/de440s.bsp`
  - `pck/moon_pa_de440_200625.bpc`
  - `fk/satellites/moon_de440_250416.tf`
  - `lsk/naif0012.tls`
- Park et al. 2021, "The JPL Planetary and Lunar Ephemerides DE440 and DE441", AJ 161, 105.
- Read with SPICE (NASA's toolkit for these files) through SpiceyPy.
- Used for: `web/data/ephem_6h.json`, the calculator's Sun and Earth positions.
- The two text kernels in `data/nasa/` contain only the data sections of the official files.

## Sun and Earth from two sites (NASA/JPL Horizons)
- https://ssd.jpl.nasa.gov/horizons/ (API: https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- Query for the Sun (`COMMAND='399'` for the Earth):
  `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='10'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='-67.9321,-88.6834,1.794'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&START_TIME='2026-11-01'&STOP_TIME='2027-12-31 22:00'&STEP_SIZE='2h'&QUANTITIES='4'&ANG_FORMAT='DEG'&CSV_FORMAT='YES'&APPARENT='AIRLESS'`
- Shackleton rim: `SITE_COORD='-114.1022,-89.3136,1.690'`, `STOP_TIME='2027-12-31'`, `STEP_SIZE='12h'`.
- Files: `data/nasa/JPL_Horizons_deGerlache_2h.csv`, `data/nasa/JPL_Horizons_Shackleton_12h.csv`
  (`services/horizons.py` can download them again).
- Used for: the "Sun and Earth at once" map and to check the NAIF table.

## Names (IAU, published by the USGS)
- Gazetteer of Planetary Nomenclature: https://planetarynames.wr.usgs.gov/
- Search: https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon (features south of 83 S)
- File: `data/nasa/iau_features_south.csv` (38 names)

## Artemis III candidate regions (NASA)
- George et al., LPSC 2026: https://ntrs.nasa.gov/citations/20250011660
- NASA, 2022: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-Moon/
- No coordinates are published, so they are not drawn on the map.

## Tools (not data)
- Plotly.js 3.3.1 (charts, MIT licence), copied to `web/vendor/plotly.min.js`: https://github.com/plotly/plotly.js
