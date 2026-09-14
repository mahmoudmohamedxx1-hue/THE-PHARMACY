#!/usr/bin/env python3
"""Generate PWA icons + iOS splash screens for The Pharmacy.
Teal brand (#0d9488) + white medical cross — matches the in-app header logo."""
import os
from PIL import Image, ImageDraw, ImageFont

TEAL = (13, 148, 136)          # #0d9488 (teal-600, app primary)
TEAL_DARK = (10, 118, 110)     # subtle bottom shade for depth
WHITE = (255, 255, 255)
BG = (248, 250, 252)           # slate-50 splash background
DARK = (15, 23, 42)            # slate-900 text

OUT = "/home/z/my-project/public/icons"
SPLASH_DIR = os.path.join(OUT, "splash")
os.makedirs(SPLASH_DIR, exist_ok=True)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def draw_cross(d: ImageDraw.ImageDraw, cx: float, cy: float, span: float, thickness: float, color=WHITE, radius_ratio=0.18):
    """Rounded medical cross (plus shape) centered at (cx, cy)."""
    t = thickness / 2
    r = thickness * radius_ratio
    # horizontal bar
    d.rounded_rectangle(
        [cx - span / 2, cy - t, cx + span / 2, cy + t],
        radius=r, fill=color)
    # vertical bar
    d.rounded_rectangle(
        [cx - t, cy - span / 2, cx + t, cy + span / 2],
        radius=r, fill=color)


def make_icon(size: int, path: str, maskable: bool = False, apple: bool = False):
    img = Image.new("RGB", (size, size), TEAL)
    d = ImageDraw.Draw(img)
    # subtle vertical gradient for depth
    if not apple:
        grad = Image.new("L", (1, size))
        for y in range(size):
            grad.putpixel((0, y), int(255 - 26 * (y / size)))
        shade = Image.new("RGB", (size, size), TEAL_DARK)
        img = Image.composite(img, shade, grad.resize((size, size)))
        d = ImageDraw.Draw(img)
    span = size * (0.52 if maskable else 0.74)   # maskable: keep inside 80% safe zone
    thickness = size * (0.26 if maskable else 0.37)
    draw_cross(d, size / 2, size / 2, span, thickness)
    img.save(path, "PNG", optimize=True)
    print(f"  icon {path} ({size}x{size})")


def make_splash(w: int, h: int, path: str):
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    # logo: teal rounded square + white cross
    logo = int(w * 0.24)
    cx, cy = w / 2, h / 2 - logo * 0.55
    d.rounded_rectangle(
        [cx - logo / 2, cy - logo / 2, cx + logo / 2, cy + logo / 2],
        radius=int(logo * 0.24), fill=TEAL)
    draw_cross(d, cx, cy, logo * 0.58, logo * 0.30)

    # brand text
    try:
        f_title = ImageFont.truetype(FONT_BOLD, int(w * 0.062))
        f_tag = ImageFont.truetype(FONT_BOLD, int(w * 0.026))
    except OSError:
        f_title = f_tag = ImageFont.load_default()
    title = "The Pharmacy"
    tag = "Egypt's Smartest Online Pharmacy"

    ty = cy + logo / 2 + int(w * 0.09)
    tb = d.textbbox((0, 0), title, font=f_title)
    d.text((cx - (tb[2] - tb[0]) / 2, ty), title, font=f_title, fill=DARK)

    gy = ty + (tb[3] - tb[1]) + int(w * 0.045)
    gb = d.textbbox((0, 0), tag, font=f_tag)
    d.text((cx - (gb[2] - gb[0]) / 2, gy), tag, font=f_tag, fill=TEAL)

    img.save(path, "PNG", optimize=True)
    print(f"  splash {path} ({w}x{h})")


print("Generating app icons...")
make_icon(192, f"{OUT}/icon-192.png")
make_icon(512, f"{OUT}/icon-512.png")
make_icon(192, f"{OUT}/icon-maskable-192.png", maskable=True)
make_icon(512, f"{OUT}/icon-maskable-512.png", maskable=True)
make_icon(180, f"{OUT}/apple-touch-icon.png", apple=True)
# favicon replacement (teal square + cross)
make_icon(32, f"{OUT}/favicon-32.png")

print("Generating iOS splash screens...")
SIZES = [
    (1290, 2796), (1179, 2556), (1284, 2778), (1170, 2532),
    (1125, 2436), (1242, 2688), (828, 1792), (750, 1334),
    (1242, 2208), (2048, 2732), (1668, 2388), (1620, 2160), (1536, 2048),
]
for w, h in SIZES:
    make_splash(w, h, f"{SPLASH_DIR}/apple-splash-{w}x{h}.png")

print("Done.")
