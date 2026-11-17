"""Generate DAISO Finder PWA icons from the owner-supplied master artwork.

Master: scripts/assets/app-icon-source.jpg (1024x1024 JPEG). The checkerboard around the
rounded tile is PAINTED into the JPEG, not real transparency, so the script derives a real
alpha channel instead of trusting the pixels.

Owner decision 2026-11-17 (docs/notes/open-questions.md §B19): the launcher artwork is the
DAISO brand tile supplied by the owner. It replaces the earlier abstract magnifier mark,
which existed only to avoid redrawing the trademark.

Outputs (public/icons/):
  icon-512.png           512 RGBA — rounded tile, fully transparent outside
  icon-192.png           192 RGBA — same artwork
  apple-touch-icon-180   180 RGB  — full-bleed square (iOS applies its own corner mask;
                                   transparent pixels would composite to black)
  icon-maskable-512      512 RGB  — tile at 80% on a full-bleed red field, so an Android
                                   circular/squircle crop never reaches the artwork

Run:  python3 scripts/make-icons.py   (Pillow only, deterministic)
"""
import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SOURCE = "scripts/assets/app-icon-source.jpg"
OUT = "public/icons"

# The flood fill starts in the painted checkerboard. Pillow compares the sum of per-channel
# differences, so 230 spans both checker tones (205 grey / 255 white = 150) and still stops
# at the tile's dark red edge (>= 390 away). JPEG edge blending is removed by the 1px erode
# below, not by tightening this number (which would leave a grey halo).
FLOOD_THRESH = 230
SENTINEL = (1, 2, 3)
SAFE_SCALE = 0.8  # maskable safe zone: keep the tile inside the centre 80%


def painted_background(im: Image.Image) -> Image.Image:
    """Return a binary mask (255) of the painted checkerboard connected to the border."""
    work = im.copy()
    ImageDraw.floodfill(work, (0, 0), SENTINEL, thresh=FLOOD_THRESH)
    diff = ImageChops.difference(work, Image.new("RGB", im.size, SENTINEL))
    r, g, b = diff.split()
    # Exact sentinel match: the flood-filled region. ImageChops.lighter keeps a 1-in-one-
    # channel difference from collapsing to 0 through luminance rounding.
    return ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v == 0 else 0)


def edge_colors(tile: Image.Image, alpha: Image.Image) -> dict:
    """Sample the tile's own edge at eight compass points (the lighting is not uniform)."""
    w, h = tile.size
    cx, cy = w / 2, h / 2

    def sample(degrees: float) -> tuple:
        dx, dy = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
        last = None
        radius = 0
        while True:
            x, y = int(cx + dx * radius), int(cy + dy * radius)
            if not (0 <= x < w and 0 <= y < h):
                break
            if alpha.getpixel((x, y)) > 250:
                last = (x, y)
            radius += 1
        if last is None:
            return (0, 0, 0)
        # Six pixels back along the ray: the outermost opaque pixel is already blended
        # with the checkerboard, and sampling it would reintroduce the grey fringe.
        return tile.getpixel((int(last[0] - dx * 6), int(last[1] - dy * 6)))

    return {d: sample(d) for d in range(0, 360, 45)}


def edge_field(tile: Image.Image, alpha: Image.Image, size: int) -> Image.Image:
    """A smooth full-bleed red field that matches the tile's edge where the two meet.

    A flat fill leaves a visible seam when the tile is inset (maskable) or its corners are
    filled (iOS). A 3x3 grid of the eight edge samples plus their mean, bicubically scaled,
    follows the artwork's top-bright/bottom-dark lighting closely enough that the seam
    disappears at launcher sizes.
    """
    s = edge_colors(tile, alpha)
    top, right, bottom, left = s[270], s[0], s[90], s[180]
    top_left, top_right, bottom_right, bottom_left = s[225], s[315], s[45], s[135]
    center = tuple(sum(c[i] for c in s.values()) // len(s) for i in range(3))
    grid = Image.new("RGB", (3, 3))
    grid.putdata(
        [
            top_left, top, top_right,
            left, center, right,
            bottom_left, bottom, bottom_right,
        ]
    )
    return grid.resize((size, size), Image.BICUBIC)


def main() -> None:
    import os

    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SOURCE).convert("RGB")

    outside = painted_background(im)
    # Erode the opaque tile by 1px to drop the JPEG blend fringe, then feather 0.8px so the
    # LANCZOS downscale gets an antialiased edge instead of a jagged one.
    alpha = outside.filter(ImageFilter.MaxFilter(3)).point(lambda v: 255 - v)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))

    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit("no tile found in the master artwork")

    tile = im.crop(bbox)
    outside = outside.crop(bbox)
    alpha = alpha.crop(bbox)

    # Transparent pixels keep the checkerboard RGB unless we replace it; LANCZOS would then
    # bleed grey into the tile edge. Paint them the field's base red before resizing.
    base = edge_colors(tile, alpha)
    base_red = tuple(sum(c[i] for c in base.values()) // len(base) for i in range(3))
    solid = Image.new("RGB", tile.size, base_red)
    rgb = Image.composite(solid, tile, outside)
    rounded = rgb.convert("RGBA")
    rounded.putalpha(alpha)

    # Regular icons: the rounded tile itself, transparent outside (owner request: alpha PNG).
    rounded.resize((512, 512), Image.LANCZOS).save(f"{OUT}/icon-512.png", optimize=True)
    rounded.resize((192, 192), Image.LANCZOS).save(f"{OUT}/icon-192.png", optimize=True)

    # iOS ignores alpha (transparent corners composite to black) and applies its own mask:
    # a full-bleed square is the correct input. The tile keeps its native scale; the field
    # only shows through the corner slivers iOS is about to mask anyway.
    ios = edge_field(tile, alpha, 180)
    ios_tile = rounded.resize((180, 180), Image.LANCZOS)
    ios.paste(ios_tile, (0, 0), ios_tile)
    ios.save(f"{OUT}/apple-touch-icon-180.png", optimize=True)

    # Maskable: full-bleed field with the tile at 80%, so a circular crop of the outer 10%
    # margin never touches the artwork. The tile's own rounded corners sit at the safe
    # circle's edge and are cropped by the OS mask, not by us.
    size = 512
    inner = int(size * SAFE_SCALE)
    canvas = edge_field(tile, alpha, size)
    scaled = rounded.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    canvas.save(f"{OUT}/icon-maskable-512.png", optimize=True)

    print(
        f"source tile: {bbox[2] - bbox[0]}x{bbox[3] - bbox[1]} -> field base "
        f"#{base_red[0]:02X}{base_red[1]:02X}{base_red[2]:02X}"
    )
    for name in (
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "apple-touch-icon-180.png",
    ):
        img = Image.open(f"{OUT}/{name}")
        print(f"{name}: {img.size[0]}x{img.size[1]} {img.mode} corner={img.getpixel((0, 0))}")


if __name__ == "__main__":
    main()
