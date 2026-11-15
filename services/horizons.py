"""
---------------
OrbitalUV
---------------
NASA/JPL Horizons: Sun and Earth azimuth/elevation seen from a point on the Moon.

We use it to build the table in data/nasa/JPL_Horizons_deGerlache_2h.csv
(Sun and Earth every 2 h, Nov 2026 - Dec 2027) and to check our own
NAIF-based ephemeris. API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""

import pandas as pd
import requests

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"
SUN_ID = "10"
EARTH_ID = "399"

# observer used for the map statistics: de Gerlache rim, close to the pole
DE_GERLACHE = dict(lon=-67.9321, lat=-88.6834, height_km=1.794)


class HorizonsError(RuntimeError):
    pass


def query_params(target, lon, lat, height_km, start, stop, step):
    q = lambda v: f"'{v}'"
    return {
        "format": "text",
        "COMMAND": q(target),
        "CENTER": q("coord@301"),          # a site on the Moon
        "COORD_TYPE": q("GEODETIC"),
        "SITE_COORD": q(f"{lon},{lat},{height_km}"),
        "MAKE_EPHEM": q("YES"),
        "EPHEM_TYPE": q("OBSERVER"),
        "START_TIME": q(start),
        "STOP_TIME": q(stop),
        "STEP_SIZE": q(step),
        "QUANTITIES": q("4"),              # apparent azimuth and elevation
        "ANG_FORMAT": q("DEG"),
        "CSV_FORMAT": q("YES"),
        "APPARENT": q("AIRLESS"),          # no atmosphere on the Moon
    }


def parse_observer_csv(text):
    """Read the $$SOE ... $$EOE block of a Horizons answer (QUANTITIES=4, CSV).

    Lines look like "2026-Nov-14 00:00,*, ,123.4567,-2.5000," where the
    middle columns are Sun/Moon presence flags that may be blank.
    """
    if "$$SOE" not in text or "$$EOE" not in text:
        raise HorizonsError("Horizons answer has no $$SOE/$$EOE block")
    block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in block.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        numbers = []
        for p in parts[1:]:
            try:
                numbers.append(float(p))
            except ValueError:
                pass          # blank or a presence flag
        if len(numbers) < 2:
            continue
        rows.append((parts[0], numbers[-2], numbers[-1]))
    frame = pd.DataFrame(rows, columns=["time", "azimuth_deg", "elevation_deg"])
    frame["time"] = pd.to_datetime(frame["time"], format="%Y-%b-%d %H:%M")
    return frame


def fetch(target, start, stop, step, site=DE_GERLACHE, timeout=60):
    params = query_params(target, site["lon"], site["lat"], site["height_km"], start, stop, step)
    try:
        r = requests.get(HORIZONS_API, params=params, timeout=timeout)
        r.raise_for_status()
    except requests.RequestException as exc:
        raise HorizonsError(f"Could not reach JPL Horizons: {exc}") from exc
    return parse_observer_csv(r.text)


def download_sun_earth_table(path, start="2026-11-01", stop="2027-12-31 22:00", step="2h", site=DE_GERLACHE):
    """Ask Horizons for the Sun and the Earth and save both in one CSV."""
    sun = fetch(SUN_ID, start, stop, step, site)
    earth = fetch(EARTH_ID, start, stop, step, site)
    if len(sun) != len(earth) or not (sun["time"].values == earth["time"].values).all():
        raise HorizonsError("Sun and Earth tables do not have the same times")
    table = pd.DataFrame({
        "time": sun["time"],
        "sun_az": sun["azimuth_deg"], "sun_el": sun["elevation_deg"],
        "earth_az": earth["azimuth_deg"], "earth_el": earth["elevation_deg"],
    })
    table.to_csv(path, index=False)
    return table


def load_sun_earth_table(path):
    return pd.read_csv(path, parse_dates=["time"])
