"""
Generates every THON-themed image the game uses into assets/theme/.

All art here is drawn from scratch with Pillow so it can be tweaked by
changing the palette or shapes below and re-running:

    python3 tools/make_theme_assets.py

Requires: pip install pillow
"""
import math
import os
import random
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "theme")
FONT = os.path.join(ROOT, "assets", "NewAthleticM54.ttf")
LOGO = os.path.join(ROOT, "art_src", "thon_logo.png")
DIAMONDS = os.path.join(ROOT, "art_src", "four_diamonds_logo.png")
# Optional: drop a photo here (jpg or png) to use it as the gameplay
# background instead of the drawn arena. Use a photo you have rights to.
# Drawn gameplay background when no photo is present: "metal" or "arena"
BACKGROUND_STYLE = "metal"
BACKGROUND_PHOTOS = [os.path.join(ROOT, "art_src", "background_photo" + ext)
                     for ext in (".jpg", ".jpeg", ".png")]
MASCOT = os.path.join(ROOT, "assets", "characters", "robot.png")

# THON palette
INDIGO = (54, 36, 148)
NAVY = (14, 12, 48)
NIGHT = (8, 6, 26)
BLUE = (79, 107, 255)
SKY = (140, 170, 255)
GOLD = (245, 197, 24)
WHITE = (255, 255, 255)
CROWD = [(79, 107, 255), (245, 197, 24), (255, 255, 255), (54, 36, 148),
         (140, 170, 255), (230, 90, 160)]

SS = 2  # supersample factor


def font(size):
    return ImageFont.truetype(FONT, size)


def canvas(w, h, color=(0, 0, 0, 0)):
    return Image.new("RGBA", (w * SS, h * SS), color)


def finish(img, w, h, name):
    # saved at the full drawn size (SS x): the game scales it to fit, so it
    # stays sharp on high-resolution screens
    img.save(os.path.join(OUT, name), optimize=True)
    print("wrote", name, img.size)


def glow(img, radius):
    """Returns img with a soft blurred copy underneath it."""
    base = img.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(img)
    return base


def vgradient(w, h, top, bottom):
    g = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    return g


def logo(width, color=WHITE):
    """THON wordmark recolored to `color`, transparent background. The source
    is tiny, so it's enlarged well past the target, re-cut to a hard edge and
    scaled down, which gives clean outlines instead of a blurry enlargement."""
    src = Image.open(LOGO).convert("L")
    mask = src.point(lambda v: 255 - v).point(lambda v: 0 if v < 40 else v)
    mask = mask.crop(mask.getbbox())
    big_w = width * 4
    big_h = int(mask.height * big_w / mask.width)
    mask = mask.resize((big_w, big_h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(big_w / 900))
    mask = mask.point(lambda v: 255 if v > 118 else 0)
    h = int(mask.height * width / mask.width)
    mask = mask.resize((width, h), Image.LANCZOS)
    out = Image.new("RGBA", mask.size, color + (255,))
    out.putalpha(mask)
    return out


def diamonds(height, color=WHITE):
    """Four Diamonds logo recolored to `color`, transparent background."""
    src = Image.open(DIAMONDS).convert("L")
    mask = src.point(lambda v: 255 - v).point(lambda v: 0 if v < 60 else 255)
    mask = mask.crop(mask.getbbox())
    w = int(mask.width * height / mask.height)
    mask = mask.resize((w, height), Image.LANCZOS)
    out = Image.new("RGBA", mask.size, color + (255,))
    out.putalpha(mask)
    return out


def paste_diamonds(img, height, right, top):
    d = diamonds(height * SS)
    img.alpha_composite(d, (right * SS - d.width, top * SS))


# --------------------------------------------------------------------------
# Gameplay background: a dance-marathon arena. Must tile horizontally,
# so every repeating element uses a period that divides the width.
# --------------------------------------------------------------------------
def photo_background(path):
    """Gameplay background from a photo: cover-cropped, edges blended so it
    scrolls seamlessly, darkened a little, with ceiling/floor bands."""
    W, H, BLEND = 1000, 500, 140
    src = Image.open(path).convert("RGB")
    # cover-crop to (W + BLEND) x H; the extra strip is blended into the start
    scale = max((W + BLEND) / src.width, H / src.height)
    src = src.resize((int(src.width * scale) + 1, int(src.height * scale) + 1),
                     Image.LANCZOS)
    left = (src.width - (W + BLEND)) // 2
    top = (src.height - H) // 2
    wide = src.crop((left, top, left + W + BLEND, top + H))
    img = wide.crop((0, 0, W, H))
    tail = wide.crop((W, 0, W + BLEND, H))
    # fade the strip that follows the right edge in over the left edge
    mask = Image.linear_gradient("L").rotate(90, expand=True).resize((BLEND, H))
    img.paste(tail, (0, 0), mask)
    img = Image.blend(img, Image.new("RGB", img.size, NIGHT), 0.28).convert("RGBA")
    big = img.resize((W * SS, H * SS), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    # ceiling (top 50px) and floor (bottom 50px) are the walls you can't pass
    d.rectangle([0, 0, W * SS, 50 * SS], fill=(20, 18, 40))
    d.rectangle([0, 44 * SS, W * SS, 50 * SS], fill=GOLD)
    fy = 450 * SS
    d.rectangle([0, fy, W * SS, H * SS], fill=(150, 100, 50))
    for x in range(0, W, 40):
        d.line([(x * SS, fy), (x * SS, H * SS)], fill=(120, 78, 38), width=SS)
    d.rectangle([0, fy, W * SS, fy + 6 * SS], fill=GOLD)
    d.rectangle([0, fy + 26 * SS, W * SS, fy + 30 * SS], fill=INDIGO)
    finish(big, W, H, "background.png")


def background():
    for path in BACKGROUND_PHOTOS:
        if os.path.exists(path):
            print("using", os.path.relpath(path, ROOT))
            return photo_background(path)
    # both drawn backgrounds are selectable in Settings; BACKGROUND_STYLE
    # picks which one is background.png (the default)
    arena_background()
    os.replace(os.path.join(OUT, "background.png"), os.path.join(OUT, "background_arena.png"))
    if BACKGROUND_STYLE == "arena":
        shutil.copy(os.path.join(OUT, "background_arena.png"), os.path.join(OUT, "background.png"))
        return
    metal_background()


def metal_background():
    """Neutral brushed-steel corridor. Low contrast on purpose so obstacles,
    coins and the runner read clearly. Every repeating element uses a period
    that divides the width, so it tiles while scrolling."""
    W, H = 1000, 500
    s = SS
    img = vgradient(W * s, H * s, (118, 122, 130), (84, 88, 96))
    rnd = random.Random(5)

    # brushed texture: faint full-width horizontal streaks (tile trivially)
    tex = Image.new("RGBA", img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tex)
    for _ in range(420):
        y = rnd.randrange(50 * s, 450 * s)
        shade = rnd.choice([(255, 255, 255, 10), (0, 0, 0, 12)])
        td.line([(0, y), (W * s, y)], fill=shade, width=1)
    img.alpha_composite(tex)
    d = ImageDraw.Draw(img)

    # wall panels, period 250
    for i in range(4):
        x0, x1 = (i * 250 + 6) * s, ((i + 1) * 250 - 6) * s
        y0, y1 = 62 * s, 352 * s
        d.rectangle([x0, y0, x1, y1], fill=(126, 130, 138))
        d.line([(x0, y0), (x1, y0)], fill=(160, 164, 172), width=3 * s)   # lit top
        d.line([(x0, y0), (x0, y1)], fill=(150, 154, 162), width=3 * s)   # lit left
        d.line([(x0, y1), (x1, y1)], fill=(70, 74, 82), width=3 * s)      # shadow
        d.line([(x1, y0), (x1, y1)], fill=(76, 80, 88), width=3 * s)
        # inset vent slots
        for k in range(5):
            vy = (110 + k * 14) * s
            d.rounded_rectangle([x0 + 70 * s, vy, x1 - 70 * s, vy + 6 * s], 3 * s,
                                fill=(92, 96, 104))
        # rivets
        for rx in (x0 + 12 * s, x1 - 12 * s):
            for ry in (y0 + 12 * s, y1 - 12 * s):
                d.ellipse([rx - 4 * s, ry - 4 * s, rx + 4 * s, ry + 4 * s],
                          fill=(150, 154, 162), outline=(72, 76, 84), width=s)

    # pipe run along the lower wall, brackets every 125
    for py, r in ((375, 9), (402, 6)):
        d.rectangle([0, (py - r) * s, W * s, (py + r) * s], fill=(96, 100, 108))
        d.line([(0, (py - r // 2) * s), (W * s, (py - r // 2) * s)],
               fill=(150, 154, 162), width=2 * s)
    for x in range(0, W, 125):
        d.rectangle([(x + 58) * s, 362 * s, (x + 66) * s, 412 * s], fill=(70, 74, 82))

    # ceiling (top 50px wall): dark steel beam with bolts, period 50
    d.rectangle([0, 0, W * s, 50 * s], fill=(58, 61, 68))
    d.rectangle([0, 44 * s, W * s, 50 * s], fill=(40, 42, 48))
    d.line([(0, 3 * s), (W * s, 3 * s)], fill=(90, 94, 102), width=2 * s)
    for x in range(25, W, 50):
        d.ellipse([(x - 4) * s, 20 * s, (x + 4) * s, 28 * s], fill=(96, 100, 108))

    # floor (bottom 50px wall): diamond plate, period 20
    fy = 450 * s
    d.rectangle([0, fy, W * s, H * s], fill=(92, 96, 104))
    d.rectangle([0, fy, W * s, fy + 5 * s], fill=(140, 144, 152))
    for row, y in enumerate(range(462, 500, 12)):
        for x in range((row % 2) * 10, W + 20, 20):
            cx, cy = x * s, y * s
            d.polygon([(cx - 6 * s, cy + 2 * s), (cx - 2 * s, cy - 2 * s),
                       (cx + 6 * s, cy - 2 * s), (cx + 2 * s, cy + 2 * s)],
                      fill=(122, 126, 134))
    finish(img, W, H, "background.png")


def arena_background():
    """Dance-marathon arena (set BACKGROUND_STYLE = "arena" to use it)."""
    W, H = 1000, 500
    img = vgradient(W * SS, H * SS, (24, 18, 80), NIGHT)
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)

    # crowd in the stands: rows of dots, each row tiles at W
    for row in range(9):
        y = (215 + row * 19) * SS
        step = 16
        shade = 0.45 + row * 0.06
        for x in range(0, W, step):
            c = rnd.choice(CROWD)
            c = tuple(int(v * shade) for v in c)
            jitter = rnd.randint(-3, 3)
            r = 6 * SS
            cx = (x + (row % 2) * 8) % W * SS
            for dx in (0, W * SS):  # wrap
                d.ellipse([cx - r - dx, y + jitter * SS - r, cx + r - dx,
                           y + jitter * SS + r], fill=c)
                d.ellipse([cx - r + dx, y + jitter * SS - r, cx + r + dx,
                           y + jitter * SS + r], fill=c)
    # stand railing
    d.rectangle([0, 385 * SS, W * SS, 392 * SS], fill=INDIGO)

    # hanging banners, period 250
    f = font(34 * SS)
    words = ["FTK", "THON", "FTK", "TECH"]
    for i, word in enumerate(words):
        cx = (125 + i * 250) * SS
        top, bot = 50 * SS, 175 * SS
        half = 48 * SS
        d.polygon([(cx - half, top), (cx + half, top), (cx + half, bot),
                   (cx, bot - 22 * SS), (cx - half, bot)],
                  fill=INDIGO if i % 2 == 0 else (30, 50, 170),
                  outline=GOLD, width=3 * SS)
        tw = d.textlength(word, font=f)
        d.text((cx - tw / 2, top + 30 * SS), word, font=f, fill=GOLD)

    # string lights, period 125
    lights = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lights)
    for i in range(8):
        x0 = i * 125 * SS
        pts = [(x0 + t * 125 * SS / 20,
                (58 + 22 * math.sin(math.pi * t / 20)) * SS) for t in range(21)]
        ld.line(pts, fill=(60, 60, 90, 255), width=2 * SS)
        for k in range(2, 20, 4):
            px, py = pts[k]
            c = [GOLD, SKY, WHITE, (230, 90, 160)][(k // 4 + i) % 4]
            ld.ellipse([px - 5 * SS, py - 5 * SS, px + 5 * SS, py + 5 * SS],
                       fill=c + (255,))
    img.alpha_composite(glow(lights, 6 * SS))

    # ceiling truss (top 50px is the ceiling wall)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W * SS, 50 * SS], fill=(20, 18, 40))
    d.rectangle([0, 44 * SS, W * SS, 50 * SS], fill=(70, 70, 100))
    for x in range(0, W, 50):
        d.line([(x * SS, 6 * SS), ((x + 25) * SS, 44 * SS)],
               fill=(70, 70, 100), width=3 * SS)
        d.line([((x + 25) * SS, 44 * SS), ((x + 50) * SS, 6 * SS)],
               fill=(70, 70, 100), width=3 * SS)
    d.rectangle([0, 3 * SS, W * SS, 8 * SS], fill=(70, 70, 100))

    # dance floor (bottom 50px is the ground wall)
    fy = 450 * SS
    d.rectangle([0, fy, W * SS, H * SS], fill=(150, 100, 50))
    for x in range(0, W, 40):
        d.line([(x * SS, fy), (x * SS, H * SS)], fill=(120, 78, 38), width=SS)
    d.rectangle([0, fy, W * SS, fy + 6 * SS], fill=GOLD)
    d.rectangle([0, fy + 26 * SS, W * SS, fy + 30 * SS], fill=INDIGO)
    finish(img, W, H, "background.png")


# --------------------------------------------------------------------------
# Obstacles
# --------------------------------------------------------------------------
def bolt(d, x0, y0, x1, y1, segs, amp, rnd, color, width):
    pts = []
    for i in range(segs + 1):
        t = i / segs
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        if 0 < i < segs:
            x += rnd.uniform(-amp, amp) if x0 == x1 else 0
            y += rnd.uniform(-amp, amp) if y0 == y1 else 0
        pts.append((x, y))
    d.line(pts, fill=color, width=width, joint="curve")


def zapper(seed=3, name="zapper.png"):
    W, H = 46, 109
    S = 4
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    rnd = random.Random(seed)
    beam = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    cx = W * S / 2
    for color, width in (((79, 107, 255, 255), 10 * S),
                         ((180, 200, 255, 255), 5 * S),
                         ((255, 255, 255, 255), 2 * S)):
        bolt(bd, cx, 18 * S, cx, (H - 18) * S, 9, 7 * S, rnd, color, width)
    img.alpha_composite(glow(beam, 4 * S))
    d = ImageDraw.Draw(img)
    for cy in (12, H - 12):
        d.ellipse([(cx - 17 * S), (cy - 12) * S, (cx + 17 * S), (cy + 12) * S],
                  fill=INDIGO, outline=GOLD, width=3 * S)
        d.ellipse([(cx - 6 * S), (cy - 5) * S, (cx + 6 * S), (cy + 5) * S],
                  fill=WHITE)
    img.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, name))
    print("wrote", name)


def zapper_frames():
    """Three bolt shapes the game flickers between."""
    for i, seed in enumerate((3, 11, 23)):
        zapper(seed, f"zapper_{i}.png")


def lasers():
    W, H = 2048, 202
    for active in (False, True):
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cy = H // 2
        if active:
            beam = Image.new("RGBA", img.size, (0, 0, 0, 0))
            bd = ImageDraw.Draw(beam)
            bd.rectangle([60, cy - 34, W - 60, cy + 34], fill=(79, 107, 255, 200))
            bd.rectangle([60, cy - 18, W - 60, cy + 18], fill=(180, 200, 255, 255))
            bd.rectangle([60, cy - 7, W - 60, cy + 7], fill=WHITE + (255,))
            img.alpha_composite(glow(beam, 18))
        else:
            d = ImageDraw.Draw(img)
            for x in range(80, W - 80, 60):
                d.line([(x, cy), (x + 30, cy)], fill=(140, 170, 255, 150), width=6)
        d = ImageDraw.Draw(img)
        for x0 in (0, W - 110):
            d.rounded_rectangle([x0, cy - 70, x0 + 110, cy + 70], 24,
                                fill=INDIGO, outline=GOLD, width=8)
            d.ellipse([x0 + 30, cy - 25, x0 + 80, cy + 25],
                      fill=WHITE if active else (90, 90, 120))
        img.save(os.path.join(OUT, "laser_active.png" if active
                              else "laser_inactive.png"))
    print("wrote laser_active.png / laser_inactive.png")


def warning():
    img = canvas(128, 128)
    d = ImageDraw.Draw(img)
    s = SS
    d.ellipse([4 * s, 4 * s, 124 * s, 124 * s], fill=GOLD, outline=WHITE, width=6 * s)
    d.rounded_rectangle([56 * s, 24 * s, 72 * s, 82 * s], 8 * s, fill=NAVY)
    d.ellipse([55 * s, 90 * s, 73 * s, 108 * s], fill=NAVY)
    finish(img, 128, 128, "warning.png")


def rocket():
    """A paper airplane (points left: it flies toward the player)."""
    W, H = 123, 67
    img = canvas(W, H)
    d = ImageDraw.Draw(img)
    s = SS
    nose = (4 * s, 34 * s)
    trail = Image.new("RGBA", img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(trail)
    for i, x in enumerate(range(96, 123, 9)):
        td.line([(x * s, (30 + i % 2 * 8) * s), ((x + 6) * s, (30 + i % 2 * 8) * s)],
                fill=GOLD + (255,), width=3 * s)
    img.alpha_composite(glow(trail, 2 * s))
    d.polygon([nose, (100 * s, 6 * s), (70 * s, 36 * s)], fill=WHITE)
    d.polygon([nose, (70 * s, 36 * s), (100 * s, 60 * s)], fill=(200, 210, 240))
    d.polygon([(70 * s, 36 * s), (100 * s, 6 * s), (92 * s, 44 * s)], fill=SKY)
    d.line([nose, (100 * s, 6 * s), (70 * s, 36 * s), nose, (100 * s, 60 * s),
            (70 * s, 36 * s)], fill=INDIGO, width=3 * s)
    f = font(14 * s)
    d.text((40 * s, 18 * s), "FTK", font=f, fill=INDIGO)
    finish(img, W, H, "rocket.png")


# --------------------------------------------------------------------------
# Pickups
# --------------------------------------------------------------------------
def draw_coin(img, cx, cy, r):
    """Gold fundraising coin with the Four Diamonds mark in the middle."""
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(200, 140, 10))          # edge
    d.ellipse([cx - r * 0.9, cy - r * 0.9, cx + r * 0.9, cy + r * 0.9], fill=GOLD)
    d.ellipse([cx - r * 0.74, cy - r * 0.74, cx + r * 0.74, cy + r * 0.74],
              outline=(255, 230, 120), width=max(1, int(r * 0.07)))
    d.arc([cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82], 200, 250,
          fill=(255, 245, 200), width=max(1, int(r * 0.1)))                 # shine
    mark = diamonds(int(r * 1.05), NAVY)
    img.alpha_composite(mark, (int(cx - mark.width / 2), int(cy - mark.height / 2)))


def coin():
    img = canvas(64, 64)
    draw_coin(img, 32 * SS, 32 * SS, 30 * SS)
    finish(img, 64, 64, "coin.png")


def powerup_box():
    """A glowing gold diamond gem."""
    img = canvas(128, 128)
    s = SS
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).polygon([(64 * s, 2 * s), (122 * s, 64 * s), (64 * s, 126 * s),
                                  (6 * s, 64 * s)], fill=GOLD + (170,))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(8 * s)))
    d = ImageDraw.Draw(img)
    top, right, bot, left = (64 * s, 12 * s), (112 * s, 64 * s), (64 * s, 116 * s), (16 * s, 64 * s)
    mid = (64 * s, 64 * s)
    d.polygon([top, right, mid], fill=(255, 225, 110))
    d.polygon([right, bot, mid], fill=(215, 160, 15))
    d.polygon([bot, left, mid], fill=(190, 135, 10))
    d.polygon([left, top, mid], fill=GOLD)
    d.polygon([top, right, bot, left], outline=WHITE, width=4 * s)
    d.polygon([(64 * s, 34 * s), (82 * s, 64 * s), (64 * s, 94 * s), (46 * s, 64 * s)],
              outline=(255, 245, 200), width=3 * s)
    finish(img, 128, 128, "powerup.png")


# Power-up colors (pickup ring, banner stripe and timer bar use the same one)
SHIELD_C = (110, 200, 255)
MAGNET_C = (240, 70, 90)
CANS_C = GOLD
TUB_C = (70, 235, 110)   # neon green like the robot costume's tape
ROBOT_CUTOUT = os.path.join(ROOT, "art_src", "tech_robot_cutout.png")


def pickup_base(color):
    """Glowing round badge the icon sits on."""
    img = canvas(128, 128)
    s = SS
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([4 * s, 4 * s, 124 * s, 124 * s], fill=color + (200,))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(7 * s)))
    d = ImageDraw.Draw(img)
    d.ellipse([12 * s, 12 * s, 116 * s, 116 * s], fill=NAVY, outline=color, width=7 * s)
    d.ellipse([22 * s, 22 * s, 106 * s, 106 * s], outline=color + (90,), width=2 * s)
    return img, d, s


def draw_shield(d, cx, cy, r, s, color):
    pts = [(cx, cy - r), (cx + r * 0.85, cy - r * 0.6), (cx + r * 0.75, cy + r * 0.25),
           (cx, cy + r), (cx - r * 0.75, cy + r * 0.25), (cx - r * 0.85, cy - r * 0.6)]
    d.polygon(pts, fill=color, outline=WHITE, width=3 * s)
    inner = [(cx + (x - cx) * 0.62, cy + (y - cy) * 0.62) for x, y in pts]
    d.polygon(inner, fill=WHITE)
    f = font(int(r * 0.9))
    tw = d.textlength("T", font=f)
    d.text((cx - tw / 2, cy - r * 0.48), "T", font=f, fill=INDIGO)


def draw_magnet(d, cx, cy, r, s):
    w = r * 0.42
    d.arc([cx - r, cy - r, cx + r, cy + r], 0, 180, fill=MAGNET_C, width=int(w))
    d.rectangle([cx - r, cy - r * 0.55, cx - r + w, cy], fill=MAGNET_C)
    d.rectangle([cx + r - w, cy - r * 0.55, cx + r, cy], fill=MAGNET_C)
    d.rectangle([cx - r, cy - r * 0.9, cx - r + w, cy - r * 0.55], fill=(230, 230, 240))
    d.rectangle([cx + r - w, cy - r * 0.9, cx + r, cy - r * 0.55], fill=(230, 230, 240))


def draw_can(d, x, y, w, h, s):
    d.rounded_rectangle([x, y + h * 0.12, x + w, y + h], 3 * s, fill=GOLD,
                        outline=(200, 140, 10), width=s)
    d.ellipse([x, y, x + w, y + h * 0.25], fill=(255, 225, 110), outline=(200, 140, 10),
              width=s)
    d.rectangle([x + 1, y + h * 0.45, x + w - 1, y + h * 0.72], fill=INDIGO)


def robot_cutout(height):
    img = Image.open(ROBOT_CUTOUT).convert("RGBA")
    img = img.crop(img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
    w = int(img.width * height / img.height)
    return img.resize((w, height), Image.LANCZOS)


def pickups():
    """One distinct pickup per power-up so players can tell them apart."""
    img, d, s = pickup_base(SHIELD_C)
    draw_shield(d, 64 * s, 64 * s, 34 * s, s, SHIELD_C)
    finish(img, 128, 128, "pickup_shield.png")

    img, d, s = pickup_base(MAGNET_C)
    draw_magnet(d, 64 * s, 70 * s, 30 * s, s)
    for x, y in ((36, 36), (92, 32), (98, 90)):  # coins flying in
        draw_coin(img, x * s, y * s, 9 * s)
    finish(img, 128, 128, "pickup_magnet.png")

    img, d, s = pickup_base(CANS_C)
    for x, y in ((46, 60), (82, 60), (64, 40)):
        draw_coin(img, x * s, y * s, 19 * s)
    d = ImageDraw.Draw(img)
    f = font(30 * s)
    tw = d.textlength("x2", font=f)
    d.text((64 * s - tw / 2, 82 * s), "x2", font=f, fill=WHITE)
    finish(img, 128, 128, "pickup_cans.png")

    img, d, s = pickup_base(TUB_C)
    bot = robot_cutout(70 * s)
    img.alpha_composite(bot, (64 * s - bot.width // 2, 20 * s))
    d = ImageDraw.Draw(img)
    f = font(26 * s)
    tw = d.textlength("TUB", font=f)
    d.rounded_rectangle([64 * s - tw / 2 - 6 * s, 84 * s, 64 * s + tw / 2 + 6 * s, 108 * s],
                        6 * s, fill=GOLD)
    d.text((64 * s - tw / 2, 84 * s), "TUB", font=f, fill=NAVY)
    finish(img, 128, 128, "pickup_tub.png")


def aura(color, alpha_ring=200, alpha_fill=50):
    """Transparent overlay drawn on top of the player while a powerup runs."""
    img = canvas(256, 256)
    d = ImageDraw.Draw(img)
    s = SS
    d.ellipse([8 * s, 8 * s, 248 * s, 248 * s], fill=color + (alpha_fill,),
              outline=color + (alpha_ring,), width=8 * s)
    return glow(img, 4 * s)


def badge(img, draw_icon):
    """Small icon circle in the top-right corner of an aura overlay."""
    d = ImageDraw.Draw(img)
    s = SS
    d.ellipse([176 * s, 0, 256 * s, 80 * s], fill=INDIGO, outline=GOLD, width=4 * s)
    draw_icon(d, 216 * s, 40 * s, s)


def shield():
    """Glassy bubble around the runner."""
    img = canvas(256, 256)
    s = SS
    d = ImageDraw.Draw(img)
    d.ellipse([6 * s, 6 * s, 250 * s, 250 * s], fill=SHIELD_C + (60,),
              outline=SHIELD_C + (235,), width=9 * s)
    d.ellipse([22 * s, 22 * s, 234 * s, 234 * s], outline=WHITE + (90,), width=3 * s)
    d.arc([40 * s, 30 * s, 150 * s, 140 * s], 200, 260, fill=WHITE + (200,), width=10 * s)
    finish(glow(img, 5 * s), 256, 256, "shield.png")


def magnet():
    """Pulsing magnetic field rings (the game spins and pulses them)."""
    img = canvas(256, 256)
    s = SS
    d = ImageDraw.Draw(img)
    for i, r in enumerate((120, 96, 72)):
        a = 200 - i * 50
        for k in range(8):  # dashed ring
            start = k * 45 + i * 15
            d.arc([128 * s - r * s, 128 * s - r * s, 128 * s + r * s, 128 * s + r * s],
                  start, start + 28, fill=MAGNET_C + (a,), width=6 * s)
    finish(glow(img, 3 * s), 256, 256, "magnet.png")


def money():
    """Golden sparkle ring for the fundraising rush."""
    img = canvas(256, 256)
    s = SS
    d = ImageDraw.Draw(img)
    d.ellipse([10 * s, 10 * s, 246 * s, 246 * s], outline=GOLD + (210,), width=6 * s)
    for k in range(10):
        a = k * math.pi / 5
        cx, cy = 128 * s + 118 * s * math.cos(a), 128 * s + 118 * s * math.sin(a)
        r = (12 if k % 2 else 8) * s
        d.polygon([(cx, cy - r), (cx + r * 0.3, cy - r * 0.3), (cx + r, cy),
                   (cx + r * 0.3, cy + r * 0.3), (cx, cy + r), (cx - r * 0.3, cy + r * 0.3),
                   (cx - r, cy), (cx - r * 0.3, cy - r * 0.3)], fill=WHITE + (240,))
    finish(glow(img, 4 * s), 256, 256, "money.png")


def tech_ultra_bot():
    """TECH ULTRA BOT: the costume robot, armored up and supersized."""
    S = SS
    img = Image.new("RGBA", (256 * S, 256 * S), (0, 0, 0, 0))
    bot = robot_cutout(196 * S)
    bx, by = 128 * S - bot.width // 2, 10 * S
    # twin booster jets under the body
    for jx in (-34, 34):
        flame = Image.new("RGBA", img.size, (0, 0, 0, 0))
        fd = ImageDraw.Draw(flame)
        cx = 128 * S + jx * S
        for color, frac in ((BLUE + (255,), 1.0), (GOLD + (255,), 0.7), (WHITE + (255,), 0.4)):
            hw = 16 * S * frac
            fd.polygon([(cx - hw, 196 * S), (cx + hw, 196 * S), (cx, (196 + 56 * frac) * S)],
                       fill=color)
        img.alpha_composite(flame.filter(ImageFilter.GaussianBlur(3 * S)))
    d = ImageDraw.Draw(img)
    for jx in (-34, 34):                      # booster nozzles
        cx = 128 * S + jx * S
        d.rounded_rectangle([cx - 18 * S, 176 * S, cx + 18 * S, 200 * S], 5 * S,
                            fill=(70, 74, 82), outline=GOLD, width=3 * S)
    # green power glow around the robot
    shape = Image.new("L", img.size, 0)
    shape.paste(bot.getchannel("A"), (bx, by))
    glow_mask = shape.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(6 * S))
    halo = Image.new("RGBA", img.size, TUB_C + (0,))
    halo.putalpha(glow_mask.point(lambda a: int(a * 0.9)))
    img.alpha_composite(halo)
    img.alpha_composite(bot, (bx, by))
    d = ImageDraw.Draw(img)
    # gold shoulder armor where the arms meet the body
    for sx in (-1, 1):
        cx = 128 * S + sx * 58 * S
        d.rounded_rectangle([cx - 24 * S, 88 * S, cx + 24 * S, 116 * S], 12 * S,
                            fill=GOLD, outline=NAVY, width=3 * S)
        d.ellipse([cx - 5 * S, 97 * S, cx + 5 * S, 107 * S], fill=NAVY)
    # chest badge
    f = font(34 * S)
    tw = d.textlength("TUB", font=f)
    d.rounded_rectangle([128 * S - tw / 2 - 10 * S, 122 * S, 128 * S + tw / 2 + 10 * S,
                         160 * S], 8 * S, fill=INDIGO, outline=GOLD, width=3 * S)
    d.text((128 * S - tw / 2, 124 * S), "TUB", font=f, fill=GOLD)
    finish(img, 256, 256, "tub.png")


# --------------------------------------------------------------------------
# Menus
# --------------------------------------------------------------------------
def button():
    W, H = 820, 280
    img = canvas(W, H)
    d = ImageDraw.Draw(img)
    s = SS
    d.rounded_rectangle([10 * s, 18 * s, 810 * s, 270 * s], 120 * s, fill=(20, 14, 70))
    d.rounded_rectangle([10 * s, 10 * s, 810 * s, 258 * s], 120 * s, fill=INDIGO,
                        outline=GOLD, width=14 * s)
    d.rounded_rectangle([60 * s, 34 * s, 760 * s, 110 * s], 40 * s,
                        fill=(90, 72, 190))
    finish(img, W, H, "button.png")


def menu_base():
    W, H = 1000, 500
    img = vgradient(W * SS, H * SS, (36, 26, 120), NIGHT)
    rays = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    cx, cy = 870 * SS, 560 * SS
    for i in range(14):
        a0 = math.pi + i * math.pi / 14
        a1 = a0 + math.pi / 28
        rd.polygon([(cx, cy), (cx + 1600 * SS * math.cos(a0), cy + 1600 * SS * math.sin(a0)),
                    (cx + 1600 * SS * math.cos(a1), cy + 1600 * SS * math.sin(a1))],
                   fill=(255, 255, 255, 14))
    img.alpha_composite(rays)
    rnd = random.Random(11)
    d = ImageDraw.Draw(img)
    for _ in range(90):  # confetti
        x, y = rnd.randrange(W * SS), rnd.randrange(H * SS)
        c = rnd.choice(CROWD)
        w, h = rnd.randint(4, 10) * SS, rnd.randint(2, 5) * SS
        d.rectangle([x, y, x + w, y + h], fill=c)
    return img


def paste_mascot(img, box_h, cx, bottom, angle=0):
    if not os.path.exists(MASCOT):
        return
    m = Image.open(MASCOT).convert("RGBA")
    m = m.crop(m.getbbox())
    if angle:
        m = m.rotate(angle, expand=True, resample=Image.BICUBIC)
    h = box_h * SS
    w = int(m.width * h / m.height)
    m = m.resize((w, h), Image.LANCZOS)
    img.alpha_composite(m, (int(cx * SS - w / 2), int(bottom * SS - h)))


def home():
    img = menu_base()
    img.alpha_composite(logo(360 * SS), (50 * SS, 28 * SS))
    d = ImageDraw.Draw(img)
    d.text((60 * SS, 230 * SS), "FOR THE KIDS", font=font(30 * SS), fill=SKY)
    # the selected runner is drawn live (floating) by the game here
    # TOP 10 panel; the game draws the names and distances inside it
    panel = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle([612 * SS, 88 * SS, 985 * SS, 488 * SS], 18 * SS,
                         fill=(8, 6, 26, 200), outline=GOLD + (255,), width=3 * SS)
    img.alpha_composite(panel)
    d = ImageDraw.Draw(img)
    f = font(32 * SS)
    tw = d.textlength("TOP 10", font=f)
    d.text((798 * SS - tw / 2, 96 * SS), "TOP 10", font=f, fill=GOLD)
    d.line([(632 * SS, 138 * SS), (965 * SS, 138 * SS)], fill=(90, 72, 190), width=2 * SS)
    paste_diamonds(img, 60, 975, 14)
    finish(img, 1000, 500, "home.png")


def game_over():
    img = menu_base()
    img.alpha_composite(logo(220 * SS), (60 * SS, 40 * SS))
    d = ImageDraw.Draw(img)
    d.text((64 * SS, 168 * SS), "KEEP DANCING. FTK", font=font(30 * SS), fill=SKY)
    # the selected runner is drawn live by the game here
    paste_diamonds(img, 90, 975, 20)
    finish(img, 1000, 500, "game_over.png")


def new_best():
    """Game over background for a new best: the celebration animation is
    drawn by the game on the right, so no mascot here."""
    img = menu_base()
    img.alpha_composite(logo(220 * SS), (60 * SS, 40 * SS))
    d = ImageDraw.Draw(img)
    d.text((64 * SS, 168 * SS), "FOR THE KIDS", font=font(30 * SS), fill=SKY)
    paste_diamonds(img, 90, 975, 20)
    finish(img, 1000, 500, "new_best.png")


def settings_bg():
    img = menu_base()
    d = ImageDraw.Draw(img)
    # translucent panel behind the achievements list
    panel = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([505 * SS, 115 * SS, 985 * SS, 320 * SS],
                                            20 * SS, fill=(0, 0, 0, 110))
    img.alpha_composite(panel)
    paste_diamonds(img, 80, 975, 18)
    finish(img, 1000, 500, "settings.png")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    background()
    zapper_frames()
    lasers()
    warning()
    rocket()
    coin()
    powerup_box()
    pickups()
    shield()
    magnet()
    money()
    tech_ultra_bot()
    button()
    home()
    game_over()
    new_best()
    settings_bg()
