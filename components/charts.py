"""
---------------
OrbitalUV
---------------
Charts module for the Lunar Landing Site Navigator
This module contains functions to create interactive visualizations
of the Sun and Earth elevation angles over time using Plotly.

The web version (Plotly.js) mirrors these functions one to one:
prepareChartData / plotSunElevation / plotEarthElevation build the same
figure (same traces, shapes, titles and hover mode).
"""

import pandas as pd
import plotly.graph_objects as go

# Optional columns: terrain horizon elevation (degrees) in the direction of the Sun / Earth.
OPTIONAL_COLUMNS = ("sun_horizon", "earth_horizon")

DEFAULT_LABELS = {
    "sun": {
        "title": "Sun Elevation Over Time",
        "name": "Sun elevation",
    },
    "earth": {
        "title": "Earth Elevation Over Time",
        "name": "Earth elevation",
    },
    "xaxis": "Date and Time",
    "yaxis": "Elevation (degrees)",
    "horizon_line": "Horizon (0°)",
    "terrain": "Terrain horizon",
    "disc": "Visible disc",
}


def prepare_chart_data(data, column_map=None):
    """
    Convert input data into the internal format used by the charts

    Parameters:
        data: Input data as a Pandas dataframe or a list of dictionaries.
        column_map: Optional dictionary mapping internal column names
                    to the actual names received by the data source.
                    It may also map the optional columns "sun_horizon"
                    and "earth_horizon".
    Returns:
        A dataframe with datetime, sun_elevation, and earth_elevation columns
        (plus sun_horizon / earth_horizon when they are present).
    """

    if isinstance(data, list):
        df = pd.DataFrame(data)
    elif isinstance(data, pd.DataFrame):
        df = data.copy()
    else:
        raise TypeError("Data must be a DataFrame or a list of dictionaries.")

    if column_map is None:
        column_map = {}

    required_columns = {
        "datetime": column_map.get("datetime", "datetime"),
        "sun_elevation": column_map.get("sun_elevation", "sun_elevation"),
        "earth_elevation": column_map.get("earth_elevation", "earth_elevation")
    }

    missing_columns = [
        column for column in required_columns.values()
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing columns in input data: {missing_columns}"
        )

    optional_columns = {
        internal: column_map.get(internal, internal)
        for internal in OPTIONAL_COLUMNS
        if column_map.get(internal, internal) in df.columns
    }

    df = df.rename(
        columns={
            actual: internal
            for internal, actual in {**required_columns, **optional_columns}.items()
        }
    )

    df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce")
    for column in ("sun_elevation", "earth_elevation", *optional_columns):
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["datetime"])
    df = df.sort_values("datetime").reset_index(drop=True)

    return df


def _merge_labels(labels):
    merged = {
        "sun": dict(DEFAULT_LABELS["sun"]),
        "earth": dict(DEFAULT_LABELS["earth"]),
    }
    for key in ("xaxis", "yaxis", "horizon_line", "terrain", "disc"):
        merged[key] = DEFAULT_LABELS[key]
    for key, value in (labels or {}).items():
        if isinstance(value, dict) and key in ("sun", "earth"):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


def _plot_elevation(data, body, show_terrain=False, labels=None, disc_radius=None):
    """
    Shared implementation of the Sun / Earth elevation charts.

    body: "sun" or "earth".
    show_terrain: also draw the terrain horizon in that body's direction
                  (needs the "<body>_horizon" column).
    labels: optional dictionary to translate the texts, e.g.
            {"sun": {"title": "...", "name": "..."}, "xaxis": "...", ...}
    disc_radius: optional apparent radius of the body in degrees. When given,
                 a shaded band from (elevation - radius) to (elevation + radius)
                 shows the whole disc, so it is visible when part of the disc
                 is above the terrain line even if the centre is below it.
    """
    text = _merge_labels(labels)
    column = f"{body}_elevation"
    horizon_column = f"{body}_horizon"

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=data["datetime"],
            y=data[column],
            mode="lines",
            name=text[body]["name"]
        )
    )

    if show_terrain:
        if horizon_column not in data.columns:
            raise ValueError(f"Missing column for terrain horizon: {horizon_column}")
        fig.add_trace(
            go.Scatter(
                x=data["datetime"],
                y=data[horizon_column],
                mode="lines",
                name=text["terrain"],
                line=dict(dash="dot")
            )
        )

    if disc_radius is not None:
        fig.add_trace(
            go.Scatter(
                x=data["datetime"],
                y=data[column] - disc_radius,
                mode="lines",
                line=dict(width=0),
                showlegend=False,
                hoverinfo="skip"
            )
        )
        fig.add_trace(
            go.Scatter(
                x=data["datetime"],
                y=data[column] + disc_radius,
                mode="lines",
                line=dict(width=0),
                fill="tonexty",
                name=text["disc"],
                hoverinfo="skip"
            )
        )

    fig.add_hline(
        y=0,
        line_dash="dash",
        annotation_text=text["horizon_line"]
    )

    fig.update_layout(
        title=text[body]["title"],
        xaxis_title=text["xaxis"],
        yaxis_title=text["yaxis"],
        hovermode="x unified"
    )

    return fig


def plot_sun_elevation(data, show_terrain=False, labels=None, disc_radius=None):
    """
    Function that creates a line chart showing the Sun elevation over time.
    """
    return _plot_elevation(data, "sun", show_terrain, labels, disc_radius)


def plot_earth_elevation(data, show_terrain=False, labels=None, disc_radius=None):
    """
    Function that creates a line chart showing the Earth elevation over time.
    """
    return _plot_elevation(data, "earth", show_terrain, labels, disc_radius)
