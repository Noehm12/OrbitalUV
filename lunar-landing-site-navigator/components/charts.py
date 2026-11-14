"""
---------------
OrbitalUV
---------------
Charts module for the Lunar Landing Site Navigator
This module contains functions to create interactive visualizations
of the Sun and Earth elevation angles over time using Plotly.
"""

import pandas as pd
import plotly.graph_objects as go

def prepare_chart_data(data, column_map=None):
    """
    Convert input data into the internal format used by the charts

    Parameters:
        data: Input data as a Pandas dataframe or a list of dictionaries.
        column_map: Optional dictionary mapping internal column names
                    to the actual names recieved by the data source.
    Returns:
        A dataframe with datetime, sun_elevation, and earth_elevation columns.
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

    df = df.rename(
        columns={
            actual: internal
            for internal, actual in required_columns.items()
        }
    )

    df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce")
    df["sun_elevation"] = pd.to_numeric(
        df["sun_elevation"], errors="coerce"
    )
    df["earth_elevation"] = pd.to_numeric(
        df["earth_elevation"], errors="coerce"
    )

    df = df.dropna(subset=["datetime"])
    df = df.sort_values("datetime").reset_index(drop=True)

    return df

def plot_sun_elevation(data):
    """
    Function that creates a line chart showing the Sun elevation over time.
    """

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=data["datetime"],
            y=data["sun_elevation"],
            mode="lines",
            name="Sun elevation"
        )
    )

    fig.add_hline(
        y=0,
        line_dash="dash",
        annotation_text="Horizon (0°)"
    )

    fig.update_layout(
        title="Sun Elevation Over Time",
        xaxis_title="Date and Time",
        yaxis_title="Elevation (degrees)",
        hovermode="x unified"
    )

    return fig

def plot_earth_elevation(data):
    """
    Function that creates a line chart showing the Earth elevation over time.
    """

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=data["datetime"],
            y=data["earth_elevation"],
            mode="lines",
            name="Earth elevation"
        )
    )

    fig.add_hline(
        y=0,
        line_dash="dash",
        annotation_text="Horizon (0°)"
    )

    fig.update_layout(
        title="Earth Elevation Over Time",
        xaxis_title="Date and Time",
        yaxis_title="Elevation (degrees)",
        hovermode="x unified"
    )

    return fig