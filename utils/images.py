"""
---------------
OrbitalUV
---------------
Small helpers to embed images in the JSON file loaded by the website.
"""

import base64
import io

from PIL import Image


def png_data_url(array, mode="RGB"):
    buffer = io.BytesIO()
    Image.fromarray(array, mode).save(buffer, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def jpeg_data_url(array, quality=84):
    buffer = io.BytesIO()
    Image.fromarray(array, "L").save(buffer, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
