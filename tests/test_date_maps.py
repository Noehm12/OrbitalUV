import json

import numpy as np
import pytest

from services import date_maps
from utils.paths import WEB_DATA_DIR


def test_quantize_round_trip():
    h = np.array([[-6.5, 0.0, 2.34, 18.9]])
    back = date_maps.quantize(h) * date_maps.SCALE + date_maps.OFFSET
    assert np.allclose(back, h, atol=0.05)


def test_high_horizons_are_clipped_not_wrapped():
    q = date_maps.quantize(np.array([[25.0, -9.0]]))
    assert list(q[0]) == [255, 0]


def test_write_and_read_back(tmp_path):
    cells = 381 * 381
    h = ((np.arange(cells * date_maps.N_DIRECTIONS) % 200) * 0.1 - 6.5).reshape(cells, -1).astype(np.float32)
    date_maps.write(h, out_dir=tmp_path)
    back, meta = date_maps.read(tmp_path)
    assert np.allclose(back, h, atol=0.051)
    assert "valid" not in meta and "approximate" not in meta


def test_cells_without_terrain_are_marked(tmp_path):
    cells = 381 * 381
    h = np.zeros((cells, date_maps.N_DIRECTIONS), np.float32)
    h[5] = -90.0                     # what horizon_grid returns off the DEM
    date_maps.write(h, out_dir=tmp_path)
    meta = json.loads((tmp_path / "horizons_1km.json").read_text())
    valid = np.fromfile(tmp_path / meta["valid"], dtype=np.uint8)
    assert valid[5] == 0 and valid.sum() == cells - 1


@pytest.mark.skipif(not (WEB_DATA_DIR / "horizons_1km.json").exists(), reason="run build_data.py horizons first")
def test_web_files_match_their_description():
    meta = json.loads((WEB_DATA_DIR / "horizons_1km.json").read_text())
    data = np.fromfile(WEB_DATA_DIR / meta["binary"], dtype=np.uint8)
    assert data.size == meta["nx"] * meta["ny"] * meta["naz"]
    # the published file must come from the 80 m LOLA map, not the 400 m fallback
    assert meta["dem_resolution_m"] == 80 and not meta.get("approximate")
