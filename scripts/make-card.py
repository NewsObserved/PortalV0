"""Render a branded evidence card.

    python3 scripts/make-card.py SOURCE "claim text" OUT.png

Used when a cited page can't be screenshotted cleanly — news sites serve
headless browsers cookie walls, paywalls and CAPTCHAs. A card that quotes the
source is more legible than a screenshot anyway, and always on brand.
"""
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1250
BLACK = "#121009"
PAPER = "#f5f1e6"
RED = "#e0261c"
BLUE = "#2b418f"
YELLOW = "#f5c543"
GREY = "#9a958a"

SERIF_CANDIDATES = [
    "/Library/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Georgia.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
]
SANS_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load(candidates, size):
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def main():
    source, claim, out = sys.argv[1], sys.argv[2], sys.argv[3]

    img = Image.new("RGB", (W, H), BLACK)
    d = ImageDraw.Draw(img)

    # Source chip
    chip = load(SANS_CANDIDATES, 30)
    label = source.upper()[:38]
    tw = d.textlength(label, font=chip)
    d.rectangle([70, 96, 70 + tw + 44, 96 + 62], fill=BLUE)
    d.text((92, 112), label, font=chip, fill=PAPER)

    # Rule
    d.rectangle([70, 208, W - 70, 212], fill=RED)

    # The claim, as a pull quote — the reason this source is cited.
    body_size = 62 if len(claim) < 150 else 52 if len(claim) < 260 else 44
    body = load(SERIF_CANDIDATES, body_size)
    wrap_at = max(18, int(W / (body_size * 0.52)))
    lines = textwrap.wrap(claim, width=wrap_at)[:11]

    y = 280
    for line in lines:
        d.text((70, y), line, font=body, fill=PAPER)
        y += int(body_size * 1.34)

    # Footer: what the card is
    foot = load(SANS_CANDIDATES, 26)
    d.text((70, H - 118), "READ MORE AT", font=foot, fill=GREY)
    d.text((70, H - 76), source[:44].upper(), font=foot, fill=YELLOW)

    img.save(out)


if __name__ == "__main__":
    main()
