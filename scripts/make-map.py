"""Render a map image from OpenStreetMap raster tiles.

    python3 scripts/make-map.py LAT LON ZOOM OUT.png

The OSM embed needs WebGL, which headless Chrome can't provide, so we stitch
tiles ourselves. Low volume only — a handful of tiles per video, per the OSM
tile usage policy, with an identifying User-Agent.
"""
import math
import sys
import urllib.request
from io import BytesIO

from PIL import Image, ImageDraw

TILE = 256
COLS, ROWS = 4, 5
UA = "NewsObserved/1.0 (editorial@newsobserved.com)"


def deg2num(lat, lon, zoom):
    """Fractional tile coordinates for a lat/lon."""
    lat_rad = math.radians(lat)
    n = 2.0**zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(z, x, y):
    url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return Image.open(BytesIO(r.read())).convert("RGB")


def main():
    lat, lon, zoom, out = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), sys.argv[4]

    fx, fy = deg2num(lat, lon, zoom)
    x0, y0 = int(fx) - COLS // 2, int(fy) - ROWS // 2

    canvas = Image.new("RGB", (COLS * TILE, ROWS * TILE), "#e8e0d8")
    got = 0
    for cx in range(COLS):
        for cy in range(ROWS):
            try:
                canvas.paste(fetch_tile(zoom, x0 + cx, y0 + cy), (cx * TILE, cy * TILE))
                got += 1
            except Exception:
                pass  # a missing tile leaves the background; not fatal

    if got < (COLS * ROWS) // 2:
        sys.exit("too few tiles")

    # Marker at the true position of the point within the stitched canvas.
    px = (fx - x0) * TILE
    py = (fy - y0) * TILE
    d = ImageDraw.Draw(canvas)
    for radius, fill, outline in ((26, None, "#e0261c"), (11, "#e0261c", "#ffffff")):
        d.ellipse(
            [px - radius, py - radius, px + radius, py + radius],
            fill=fill,
            outline=outline,
            width=5,
        )

    canvas.resize((1000, 1250), Image.LANCZOS).save(out)


if __name__ == "__main__":
    main()
