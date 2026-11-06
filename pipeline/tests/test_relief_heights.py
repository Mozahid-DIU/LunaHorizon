import json

import numpy as np
from PIL import Image

from relief_heights import OUT_JSON, OUT_PNG, SIZE_PX, pack, unpack


def test_pack_keeps_heights_to_a_fraction_of_a_metre():
    heights = np.array([[-4200.0, 0.0], [1234.5, 6100.0]])
    rgb, low, high = pack(heights)
    assert (low, high) == (-4200.0, 6100.0)
    assert np.max(np.abs(unpack(rgb, low, high) - heights)) < (high - low) / 65535
    assert rgb[..., 2].max() == 0


def test_written_file_matches_its_description():
    meta = json.loads(OUT_JSON.read_text())
    image = np.asarray(Image.open(OUT_PNG).convert("RGB"))
    assert image.shape == (SIZE_PX, SIZE_PX, 3) == (meta["size_px"], meta["size_px"], 3)
    assert meta["radius_km"] == 300
    heights = unpack(image, meta["min_m"], meta["max_m"])
    # the south polar region spans several kilometres of relief, from deep crater floors to high rims
    assert heights.max() - heights.min() > 5000
