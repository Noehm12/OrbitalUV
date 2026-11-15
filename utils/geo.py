"""
---------------
OrbitalUV
---------------
Geometry of the south polar stereographic map used by the NASA LOLA files.

Map coordinates are metres on a sphere of radius 1737.4 km, with the
south pole at (0, 0). Longitude 0 points to +y and 90 E to +x.
"""

import numpy as np

MOON_RADIUS_M = 1737400.0


def xy_to_latlon(x, y):
    """Map metres -> latitude, longitude in degrees."""
    rho = np.hypot(x, y)
    lat = -(90.0 - np.degrees(2 * np.arctan(rho / (2 * MOON_RADIUS_M))))
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


def latlon_to_xy(lat, lon):
    """Latitude, longitude in degrees -> map metres."""
    colat = np.radians(90 + lat)
    rho = 2 * MOON_RADIUS_M * np.tan(colat / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


def local_frame(lat, lon):
    """East, North and Up unit vectors (Moon-fixed) at a surface point."""
    p, l = np.radians(lat), np.radians(lon)
    east = np.array([-np.sin(l), np.cos(l), 0.0])
    north = np.array([-np.sin(p) * np.cos(l), -np.sin(p) * np.sin(l), np.cos(p)])
    up = np.array([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    return east, north, up


def azel_to_vectors(az, el, frame):
    """Azimuth/elevation arrays (degrees) seen from `frame` -> Moon-fixed unit vectors (n, 3)."""
    east, north, up = frame
    a, e = np.radians(az), np.radians(el)
    return (np.outer(np.cos(e) * np.sin(a), east)
            + np.outer(np.cos(e) * np.cos(a), north)
            + np.outer(np.sin(e), up))


def vectors_to_azel(vectors, lat, lon):
    """Moon-fixed unit vectors (n, 3) -> local azimuth (0-360) and elevation in degrees."""
    east, north, up = local_frame(lat, lon)
    el = np.degrees(np.arcsin(np.clip(vectors @ up, -1, 1)))
    az = np.degrees(np.arctan2(vectors @ east, vectors @ north)) % 360
    return az, el
