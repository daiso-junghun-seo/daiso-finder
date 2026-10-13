"""Generate DAISO Finder PWA icons (deterministic, dependency: Pillow only).

Abstract mark only — no trademarked logo redraw: a white magnifier over shelf
lines on ink (matches --action-bg; taste-2 retired the red).
The maskable variant keeps the mark inside the center safe zone with full-bleed ink.
Run:  python3 scripts/make-icons.py   (writes public/icons/*.png)
"""
from PIL import Image, ImageDraw

ACCENT = (27, 27, 29, 255)        # ink primary (taste-2) — matches --action-bg
ICON_FG = (255, 255, 255, 255)    # white mark on ink
SHELF = (255, 255, 255, 255)
OUT = "public/icons"

SIZE = 512
RADIUS_RATIO = 0.225            # rounded-square corner


def rounded_square(size: int, radius: int, color: tuple) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


def draw_mark(draw: ImageDraw.ImageDraw, box: tuple) -> None:
    """White magnifier + two shelf lines, all inside box (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w = x1 - x0
    ring = w * 0.34                       # lens outer radius
    cx, cy = x0 + w * 0.44, y0 + w * 0.42
    lw = max(2, int(w * 0.075))           # stroke width
    # lens ring
    draw.ellipse([cx - ring, cy - ring, cx + ring, cy + ring], outline=ICON_FG, width=lw)
    # handle (45 deg down-right)
    import math
    dx = dy = ring * math.cos(math.pi / 4)
    draw.line([cx + dx * 0.82, cy + dy * 0.82, cx + dx * 1.75, cy + dy * 1.75],
              fill=ICON_FG, width=lw)
    # two shelf lines under the lens
    for i, yy in enumerate((y0 + w * 0.74, y0 + w * 0.86)):
        inset = w * (0.16 + 0.06 * i)
        draw.line([x0 + inset, yy, x1 - inset, yy], fill=SHELF, width=max(2, lw - 2))


def main() -> None:
    import os
    os.makedirs(OUT, exist_ok=True)

    # Regular: full-bleed red rounded square, mark fills the tile.
    base = rounded_square(SIZE, int(SIZE * RADIUS_RATIO), ACCENT)
    d = ImageDraw.Draw(base)
    m = int(SIZE * 0.17)
    draw_mark(d, (m, m, SIZE - m, SIZE - m))
    base.save(f"{OUT}/icon-512.png")
    base.resize((192, 192), Image.LANCZOS).save(f"{OUT}/icon-192.png")
    base.resize((180, 180), Image.LANCZOS).save(f"{OUT}/apple-touch-icon-180.png")

    # Maskable: same tile scaled into the center safe zone on full-bleed red
    # (maskable safe zone ~= center 80%; keep the mark inside ~66%).
    safe = Image.new("RGBA", (SIZE, SIZE), ACCENT)
    inner = base.resize((int(SIZE * 0.8), int(SIZE * 0.8)), Image.LANCZOS)
    off = (SIZE - inner.width) // 2
    safe.alpha_composite(inner, (off, off))
    # square corners: masks are applied by the OS, keep full bleed
    safe.convert("RGB").save(f"{OUT}/icon-maskable-512.png")

    for name in ("icon-192.png", "icon-512.png", "icon-maskable-512.png",
                 "apple-touch-icon-180.png"):
        img = Image.open(f"{OUT}/{name}")
        print(f"{name}: {img.size[0]}x{img.size[1]} {img.mode}")


if __name__ == "__main__":
    main()
