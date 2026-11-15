""""
---------------
OrbitalUV
---------------
Tests for the charts module.
"""

import pytest
import pandas as pd
import plotly.graph_objects as go

from components.charts import (
    prepare_chart_data,
    plot_sun_elevation,
    plot_earth_elevation
)


# Example data used for testing
@pytest.fixture
def sample_data():
    return [
        {
            "datetime": "2026-11-14 12:00",
            "sun_elevation": 25.5,
            "earth_elevation": 10.1
        },
        {
            "datetime": "2026-11-14 10:00",
            "sun_elevation": 15.2,
            "earth_elevation": 8.4
        },
        {
            "datetime": "2026-11-14 11:00",
            "sun_elevation": 20.1,
            "earth_elevation": 9.2
        }
    ]


# Tests for prepare_chart_data
def test_prepare_chart_data_from_list(sample_data):
    df = prepare_chart_data(sample_data)

    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == [
        "datetime", "sun_elevation", "earth_elevation"
    ]
    assert len(df) == 3


def test_prepare_chart_data_from_dataframe(sample_data):
    input_df = pd.DataFrame(sample_data)

    df = prepare_chart_data(input_df)

    assert isinstance(df, pd.DataFrame)
    assert len(df) == 3


def test_prepare_chart_data_sorts_dates(sample_data):
    df = prepare_chart_data(sample_data)

    assert df["datetime"].is_monotonic_increasing


def test_prepare_chart_data_converts_types():
    data = [
        {
            "datetime": "2026-11-14 10:00",
            "sun_elevation": "15.2",
            "earth_elevation": "8.4"
        }
    ]

    df = prepare_chart_data(data)

    assert pd.api.types.is_datetime64_any_dtype(df["datetime"])
    assert pd.api.types.is_numeric_dtype(df["sun_elevation"])
    assert pd.api.types.is_numeric_dtype(df["earth_elevation"])


def test_prepare_chart_data_drops_invalid_dates():
    data = [
        {
            "datetime": "2026-11-14 10:00",
            "sun_elevation": 15.2,
            "earth_elevation": 8.4
        },
        {
            "datetime": "invalid date",
            "sun_elevation": 20.1,
            "earth_elevation": 9.2
        }
    ]

    df = prepare_chart_data(data)

    assert len(df) == 1


def test_prepare_chart_data_with_column_map():
    data = [
        {
            "time": "2026-11-14 10:00",
            "sun_angle": 15.2,
            "earth_angle": 8.4
        }
    ]

    column_map = {
        "datetime": "time",
        "sun_elevation": "sun_angle",
        "earth_elevation": "earth_angle"
    }

    df = prepare_chart_data(data, column_map)

    assert list(df.columns) == [
        "datetime", "sun_elevation", "earth_elevation"
    ]
    assert df.iloc[0]["sun_elevation"] == 15.2
    assert df.iloc[0]["earth_elevation"] == 8.4


def test_prepare_chart_data_missing_columns():
    data = [
        {
            "datetime": "2026-11-14 10:00",
            "sun_elevation": 15.2
        }
    ]

    with pytest.raises(ValueError, match="Missing columns"):
        prepare_chart_data(data)


def test_prepare_chart_data_invalid_input():
    with pytest.raises(TypeError):
        prepare_chart_data("invalid data")


# Tests for plot_sun_elevation
def test_plot_sun_elevation(sample_data):
    df = prepare_chart_data(sample_data)

    fig = plot_sun_elevation(df)

    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1
    assert fig.data[0].name == "Sun elevation"
    assert fig.data[0].mode == "lines"
    assert list(fig.data[0].y) == [15.2, 20.1, 25.5]


def test_plot_sun_elevation_layout(sample_data):
    df = prepare_chart_data(sample_data)

    fig = plot_sun_elevation(df)

    assert fig.layout.title.text == "Sun Elevation Over Time"
    assert fig.layout.xaxis.title.text == "Date and Time"
    assert fig.layout.yaxis.title.text == "Elevation (degrees)"
    assert fig.layout.hovermode == "x unified"
    assert len(fig.layout.shapes) == 1


# Tests for plot_earth_elevation
def test_plot_earth_elevation(sample_data):
    df = prepare_chart_data(sample_data)

    fig = plot_earth_elevation(df)

    assert isinstance(fig, go.Figure)
    assert len(fig.data) == 1
    assert fig.data[0].name == "Earth elevation"
    assert fig.data[0].mode == "lines"
    assert list(fig.data[0].y) == [8.4, 9.2, 10.1]


def test_plot_earth_elevation_layout(sample_data):
    df = prepare_chart_data(sample_data)

    fig = plot_earth_elevation(df)

    assert fig.layout.title.text == "Earth Elevation Over Time"
    assert fig.layout.xaxis.title.text == "Date and Time"
    assert fig.layout.yaxis.title.text == "Elevation (degrees)"
    assert fig.layout.hovermode == "x unified"
    assert len(fig.layout.shapes) == 1

# Tests for the optional terrain horizon and labels (backwards compatible additions)
@pytest.fixture
def sample_data_with_horizon(sample_data):
    rows = []
    for row, sun_h, earth_h in zip(sample_data, [1.5, 1.2, 1.0], [0.4, 0.3, 0.2]):
        rows.append({**row, "sun_horizon": sun_h, "earth_horizon": earth_h})
    return rows


def test_prepare_chart_data_keeps_optional_horizon(sample_data_with_horizon):
    df = prepare_chart_data(sample_data_with_horizon)

    assert "sun_horizon" in df.columns
    assert "earth_horizon" in df.columns
    assert pd.api.types.is_numeric_dtype(df["sun_horizon"])
    # sorted together with the dates
    assert list(df["sun_horizon"]) == [1.2, 1.0, 1.5]


def test_prepare_chart_data_maps_optional_horizon():
    data = [{"time": "2026-11-14 10:00", "s": 1.0, "e": 2.0, "sh": "0.5"}]
    column_map = {"datetime": "time", "sun_elevation": "s",
                  "earth_elevation": "e", "sun_horizon": "sh"}

    df = prepare_chart_data(data, column_map)

    assert df.iloc[0]["sun_horizon"] == 0.5
    assert "earth_horizon" not in df.columns


def test_plot_sun_elevation_with_terrain(sample_data_with_horizon):
    df = prepare_chart_data(sample_data_with_horizon)

    fig = plot_sun_elevation(df, show_terrain=True)

    assert len(fig.data) == 2
    assert fig.data[1].name == "Terrain horizon"
    assert list(fig.data[1].y) == [1.2, 1.0, 1.5]
    assert len(fig.layout.shapes) == 1


def test_plot_earth_elevation_terrain_requires_column(sample_data):
    df = prepare_chart_data(sample_data)

    with pytest.raises(ValueError, match="earth_horizon"):
        plot_earth_elevation(df, show_terrain=True)


def test_plot_labels_can_be_translated(sample_data):
    df = prepare_chart_data(sample_data)

    fig = plot_sun_elevation(
        df,
        labels={"sun": {"title": "Altura del Sol", "name": "Sol"},
                "xaxis": "Fecha y hora", "yaxis": "Altura (grados)"}
    )

    assert fig.layout.title.text == "Altura del Sol"
    assert fig.data[0].name == "Sol"
    assert fig.layout.xaxis.title.text == "Fecha y hora"
    assert fig.layout.yaxis.title.text == "Altura (grados)"
    assert fig.layout.hovermode == "x unified"


def test_plot_earth_elevation_with_disc(sample_data_with_horizon):
    df = prepare_chart_data(sample_data_with_horizon)

    fig = plot_earth_elevation(df, show_terrain=True, disc_radius=0.95)

    assert len(fig.data) == 4
    lower, upper = fig.data[2], fig.data[3]
    centre = list(df["earth_elevation"])
    assert list(lower.y) == pytest.approx([v - 0.95 for v in centre])
    assert list(upper.y) == pytest.approx([v + 0.95 for v in centre])
    assert upper.fill == "tonexty"
    assert upper.name == "Visible disc"
    assert lower.showlegend is False


def test_plot_without_disc_is_unchanged(sample_data):
    df = prepare_chart_data(sample_data)

    assert len(plot_earth_elevation(df).data) == 1
