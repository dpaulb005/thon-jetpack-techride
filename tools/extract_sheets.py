"""
Cuts the THON TECHRIDE concept sheets in new_assets/ into individual,
transparent, aligned sprite frames under assets/techride/, and writes
assets/techride/manifest.txt, which the game and the asset library read.

    python3 tools/extract_sheets.py

How it works, per animation row listed in ROWS below:
  1. Crop the row's band from its sheet (pixel boxes, measured on the sheets).
  2. Find the separate drawings in it (connected non-background pixels,
     merging pieces that overlap horizontally, e.g. a flame and its body;
     labels and divider lines are dropped by size).
  3. Remove the sheet background: only background-colored pixels connected
     to the edge of each drawing become transparent, so white/silver parts
     inside a character survive.
  4. Pad every frame of the row onto one square canvas with a shared anchor
     (feet for ground poses, center for flying), so frames don't jitter.

Rows whose drawings come out a different count than expected are reported,
and only the real drawings are exported (no duplicated frames).

Requires: pip install pillow numpy scipy
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.spatial import ConvexHull

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS = os.path.join(ROOT, "new_assets")
OUT = os.path.join(ROOT, "assets", "techride")
MANIFEST = os.path.join(OUT, "manifest.txt")

CHAR_SHEET = "image copy 2.png"   # light background, separated frames

# id, sheet, box (x0, y0, x1, y1), expected frames, fps, anchor, loop
# (character rows: light background)
ROWS = [
    ("lion.run",        CHAR_SHEET, (15, 85, 588, 197), 6, 12, "bottom", True),
    ("lion.fly",        CHAR_SHEET, (600, 78, 1190, 182), 6, 10, "center", True),
    ("lion.idle",       CHAR_SHEET, (1198, 88, 1532, 192), 4, 4, "bottom", True),
    ("lion.jump",       CHAR_SHEET, (15, 228, 378, 347), 4, 10, "bottom", False),
    ("lion.land",       CHAR_SHEET, (385, 252, 758, 347), 4, 10, "bottom", False),
    ("lion.celebrate",  CHAR_SHEET, (768, 233, 1532, 347), 6, 6, "bottom", True),
    ("techbot.run",     CHAR_SHEET, (15, 439, 592, 532), 6, 12, "bottom", True),
    ("techbot.fly",     CHAR_SHEET, (600, 439, 1180, 532), 6, 10, "center", True),
    ("techbot.idle",    CHAR_SHEET, (1193, 438, 1532, 532), 4, 4, "bottom", True),
    ("techbot.jump",    CHAR_SHEET, (15, 568, 378, 667), 4, 10, "bottom", False),
    ("techbot.land",    CHAR_SHEET, (385, 568, 762, 667), 4, 10, "bottom", False),
    ("techbot.celebrate", CHAR_SHEET, (768, 566, 1532, 667), 6, 6, "bottom", True),
    ("tub.run",         CHAR_SHEET, (10, 752, 614, 864), 6, 10, "bottom", True),
    ("tub.fly",         CHAR_SHEET, (618, 752, 1202, 852), 6, 10, "center", True),
    ("tub.idle",        CHAR_SHEET, (1203, 752, 1532, 864), 4, 4, "bottom", True),
    ("tub.transform",   CHAR_SHEET, (10, 903, 630, 1018), 6, 12, "bottom", False),
    ("tub.smash",       CHAR_SHEET, (636, 900, 1054, 1018), 4, 12, "bottom", False),
    ("tub.celebrate",   CHAR_SHEET, (1058, 900, 1532, 1018), 4, 6, "bottom", True),
]


FACING_RIGHT = {"hazard.missile_body", "hazard.homing_rocket"}
HAZARD_SHEET = "image.png"        # dark background, glowing art
ITEM_SHEET = "image copy 4.png"   # coins, accessories (dark)

# Dark-background rows. Counts are the drawings actually on the sheet (some
# panel titles promise more frames than are drawn).
DARK_ROWS = [
    ("hazard.zapper",        HAZARD_SHEET, (12, 157, 355, 254), 6, 12, "center", True),
    ("hazard.dual_laser",    HAZARD_SHEET, (372, 152, 766, 256), 6, 10, "center", True),
    ("hazard.laser",         HAZARD_SHEET, (780, 178, 1142, 242), 4, 10, "center", True),
    ("hazard.moving_laser",  HAZARD_SHEET, (12, 310, 386, 416), 5, 10, "center", True),
    ("hazard.rotating_laser", HAZARD_SHEET, (398, 316, 852, 402), 7, 12, "center", True),
    ("hazard.beam_sweeper",  HAZARD_SHEET, (1144, 322, 1532, 408), 6, 10, "center", True),
    ("hazard.drone",         HAZARD_SHEET, (12, 468, 375, 548), 4, 8, "center", True),
    ("hazard.mine",          HAZARD_SHEET, (393, 463, 735, 552), 4, 6, "center", True),
    ("hazard.turret",        HAZARD_SHEET, (755, 472, 1146, 548), 6, 8, "bottom", False),
    ("hazard.gate",          HAZARD_SHEET, (1163, 468, 1532, 556), 4, 4, "center", False),
    ("hazard.missile_body",  HAZARD_SHEET, (238, 612, 346, 672), 1, 1, "center", True),
    ("hazard.homing_rocket", HAZARD_SHEET, (553, 610, 962, 682), 6, 10, "center", True),
    ("hazard.crate",         HAZARD_SHEET, (983, 603, 1532, 697), 6, 1, "bottom", False),
    ("hazard.energy_barrier", HAZARD_SHEET, (14, 743, 562, 842), 4, 6, "center", True),
    ("hazard.spikes",        HAZARD_SHEET, (588, 758, 1046, 822), 5, 8, "bottom", False),
    ("hazard.falling",       HAZARD_SHEET, (1068, 753, 1524, 846), 6, 10, "center", False),
    ("fx.impacts",           HAZARD_SHEET, (944, 893, 1524, 997), 6, 1, "center", False),
    ("item.coin",            ITEM_SHEET, (1157, 378, 1268, 470), 1, 1, "center", True),
    ("item.blue_diamond",    ITEM_SHEET, (1330, 384, 1408, 470), 1, 1, "center", True),
    ("cosmetic.set",         ITEM_SHEET, (790, 655, 1522, 740), 10, 1, "center", False),
]


# Sheet drawings are only ~100 px, smaller than they appear on a sharp screen.
# Enlarging can't add detail, but done carefully it keeps edges clean.
UPSCALE = {"techbot": 3, "lion": 3, "tub": 3, "hazard": 2, "fx": 2, "cosmetic": 2, "item": 1}


def enlarge(img, factor, hard_edges):
    """Enlarges a sprite without dark or bright fringes: colors are scaled
    premultiplied, then sharpened, and solid sprites get their outline
    tightened back up so it doesn't go soft."""
    if factor == 1:
        return img
    a = np.asarray(img).astype(float) / 255
    premult = np.dstack([a[..., :3] * a[..., 3:], a[..., 3]])
    size = (img.width * factor, img.height * factor)
    chans = [Image.fromarray((premult[..., i] * 255).astype(np.uint8), "L")
             .resize(size, Image.LANCZOS) for i in range(4)]
    alpha = np.asarray(chans[3]).astype(float) / 255
    rgb = np.dstack([np.asarray(c).astype(float) / 255 for c in chans[:3]])
    rgb = np.clip(rgb / np.maximum(alpha, 1e-3)[..., None], 0, 1)
    if hard_edges:
        alpha = np.clip((alpha - 0.5) * 2.2 + 0.5, 0, 1)
    color = Image.fromarray((rgb * 255).astype(np.uint8), "RGB")
    color = color.filter(ImageFilter.UnsharpMask(radius=1.0 * factor, percent=70, threshold=2))
    out = color.convert("RGBA")
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8), "L"))
    return out


def background_color(img):
    a = np.asarray(img).astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return np.median(border, axis=0)


def foreground_mask(arr, bg, tol):
    return (np.abs(arr - bg) > tol).any(axis=2)


def dark_alpha(arr, bg):
    """Alpha 0..1 from how far each pixel is from the dark background, so
    glows fade out smoothly; colors are un-mixed from the background."""
    d = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - 22) / 70.0, 0, 1)
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip(bg + (arr - bg) / safe, 0, 255)
    return alpha, color


def find_cuts(fg, count):
    """Column positions between frames: the emptiest column near each
    evenly spaced boundary."""
    cols = ndimage.uniform_filter1d(fg.sum(axis=0).astype(float), 7)
    width = fg.shape[1]
    step = width / count
    cuts = []
    for k in range(1, count):
        lo, hi = int(k * step - step * 0.35), int(k * step + step * 0.35)
        cuts.append(lo + int(np.argmin(cols[lo:hi])))
    return cuts


def alpha_mask(arr, bg):
    """Opaque where the drawing is: background connected to the band's edge
    is cleared, and so are enclosed pockets of exact sheet background
    (gaps between an arm and the body)."""
    near_bg = ~foreground_mask(arr, bg, 26)
    labels, _ = ndimage.label(near_bg)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
    edge.discard(0)
    clear = np.isin(labels, list(edge))
    exact_bg = ~foreground_mask(arr, bg, 5)
    pockets, n = ndimage.label(exact_bg & ~clear)
    if n:
        sizes = ndimage.sum(np.ones_like(pockets), pockets, range(1, n + 1))
        big = np.isin(pockets, [i + 1 for i, sz in enumerate(sizes) if sz >= 40])
        clear |= big
    return ~clear


def extract_row(sheet_img, box, anchor, count, dark=False, keep_small=False):
    band = sheet_img.crop(box).convert("RGB")
    arr = np.asarray(band).astype(int)
    bg = background_color(band)
    if dark:
        dalpha, dcolor = dark_alpha(arr, bg)
        fg = ndimage.binary_closing(dalpha > 0.3, iterations=2)
    else:
        fg = ndimage.binary_closing(foreground_mask(arr, bg, 22), iterations=2)
    cuts = find_cuts(fg, count)
    edges = [0] + cuts + [arr.shape[1]]
    col_slot = np.digitize(np.arange(arr.shape[1]), cuts)
    labels, n = ndimage.label(fg)
    slot = np.full(fg.shape, -1)
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        comp = labels[sl] == i
        h, w = comp.shape
        if comp.sum() < (25 if dark else 70) and not keep_small:
            continue                                  # specks, bits of label text
        if h <= 7 or (h < 30 and w > 6 * h):
            continue                                  # panel lines, label tabs
        ys, xs = np.nonzero(comp)
        xs = xs + sl[1].start
        counts = np.bincount(col_slot[xs], minlength=count)
        region = slot[sl]
        if counts.max() >= 0.85 * counts.sum():
            region[comp] = int(np.argmax(counts))     # whole drawing, flames included
        else:
            region[comp] = col_slot[xs]               # fused neighbours: split at the cut
    opaque = None if dark else alpha_mask(arr, bg)
    frames = []
    for s_i in range(count):
        if dark:
            # glows reach past the solid part, so take a wider region
            mine = ndimage.binary_dilation(slot == s_i, iterations=6)
            if mine.sum() < 300:
                continue
            alpha = (dalpha * mine * 255).astype(np.uint8)
            rgba = Image.fromarray(np.dstack([dcolor.astype(np.uint8), alpha]), "RGBA")
            rgba.putalpha(rgba.getchannel("A").point(lambda v: 0 if v < 10 else v))
        else:
            mine = ndimage.binary_dilation(slot == s_i, iterations=2) & opaque
            # the outermost pixel is mixed with the sheet's white: trim it off
            mine = ndimage.binary_erosion(mine, iterations=1)
            if mine.sum() < 400:
                continue
            alpha = ndimage.uniform_filter(np.where(mine, 255, 0).astype(float), size=2)
            alpha = np.where(mine, np.maximum(alpha, 160), 0).astype(np.uint8)
            rgba = Image.fromarray(np.dstack([arr.astype(np.uint8), alpha]), "RGBA")
        bbox = rgba.getchannel("A").getbbox()
        min_w, min_h = (20, 14) if dark else (30, 45)
        if bbox and (bbox[2] - bbox[0]) >= min_w and (bbox[3] - bbox[1]) >= min_h:
            frames.append(rgba.crop(bbox))
    return frames


BG_SHEET = "image copy.png"
ARENA_BOX = (0, 40, 1536, 316)   # the full arena strip (below its title tab)
ARENA_SPLIT = 268                # rail + floor below this line scroll faster
FIELD_H, FLOOR_H = 500, 87       # playfield height; near layer height


def seamless(img, blend):
    """Fades the strip's last `blend` columns into its first ones so it
    loops without a visible seam; returns the loopable strip."""
    w, h = img.size
    core = img.crop((0, 0, w - blend, h))
    tail = img.crop((w - blend, 0, w, h))
    ramp = Image.linear_gradient("L").rotate(90, expand=True).resize((blend, h))
    head = core.crop((0, 0, blend, h))
    core.paste(Image.composite(head, tail, ramp), (0, 0))
    return core


def build_arena_layers():
    """THON Arena parallax: the far layer (ceiling, wall, banners, stage)
    and the near layer (rail and floor), scaled to the playfield."""
    sheet = Image.open(os.path.join(SHEETS, BG_SHEET)).convert("RGB")
    x0, y0, x1, y1 = ARENA_BOX
    scale = (FIELD_H - FLOOR_H) / (ARENA_SPLIT - y0)
    width = int((x1 - x0) * scale)
    far = sheet.crop((x0, y0, x1, ARENA_SPLIT)).resize((width, FIELD_H - FLOOR_H), Image.LANCZOS)
    near = sheet.crop((x0, ARENA_SPLIT, x1, y1)).resize((width, FLOOR_H), Image.LANCZOS)
    # keep the far wall a little darker so hazards and coins stand out
    far = Image.blend(far, Image.new("RGB", far.size, (6, 8, 28)), 0.22)
    dest = os.path.join(OUT, "backgrounds", "arena")
    os.makedirs(dest, exist_ok=True)
    far = seamless(far, 180)
    near = seamless(near, 180)
    # stored larger than drawn so sharp screens get every pixel the sheet has
    big = 4096 / far.width
    far = far.resize((4096, int(far.height * big)), Image.LANCZOS)
    near = near.resize((4096, int(near.height * big)), Image.LANCZOS)
    far = far.filter(ImageFilter.UnsharpMask(radius=2.5, percent=80, threshold=2))
    near = near.filter(ImageFilter.UnsharpMask(radius=2.5, percent=80, threshold=2))
    far.save(os.path.join(dest, "far.png"), optimize=True)
    near.save(os.path.join(dest, "near.png"), optimize=True)
    print(f"built backgrounds/arena far {far.size} + near {near.size}")


def head_anchor(frames):
    """Where accessories attach, as fractions of the frame: the head's
    center x, the top of the head, and the character's height (averaged
    over the frames)."""
    hxs, tops, heights = [], [], []
    for f in frames:
        a = np.asarray(f.getchannel("A")) > 128
        rows = np.nonzero(a.sum(axis=1) >= 6)[0]
        if len(rows) == 0:
            continue
        top, bottom = rows[0], rows[-1]
        h = bottom - top
        head = a[top + int(h * 0.08): top + int(h * 0.35)]   # skip the antenna tip
        ys, xs = np.nonzero(head)
        if len(xs):
            hxs.append(xs.mean() / f.width)
        tops.append(top / f.height)
        heights.append(h / f.height)
    return float(np.mean(hxs)), float(np.mean(tops)), float(np.mean(heights))


def hitbox_outline(frame, flame=False, max_points=14, inset=2.0):
    """The character's collision outline for one frame: the convex outline of
    its solid pixels, pulled in a couple of pixels, as (x, y) fractions of the
    frame (y down). Jetpack flames (lower left in the flying poses) are left
    out so they never count as a hit."""
    a = np.asarray(frame.getchannel("A")) > 200
    h, w = a.shape
    if flame:
        ys, xs = np.mgrid[0:h, 0:w]
        rgb = np.asarray(frame.convert("RGB")).astype(int)
        bright = rgb.max(axis=2) > 200
        a &= ~((xs < w * 0.42) & (ys > h * 0.5) & bright)
    rgb = np.asarray(frame.convert("RGB")).astype(int)
    # the grey ground shadow under the feet is not part of the character
    grey = (rgb.max(axis=2) - rgb.min(axis=2)) < 28
    a[int(h * 0.9):] &= ~grey[int(h * 0.9):]
    # keep the character's solid shape; drop specks and stray pixels
    labels, n = ndimage.label(a)
    if n == 0:
        return []
    sizes = ndimage.sum(a, labels, range(1, n + 1))
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= 0.03 * sizes.max()]
    a = np.isin(labels, keep)
    ys, xs = np.nonzero(a)
    if len(xs) < 20:
        return []
    pts = np.stack([xs, ys], axis=1).astype(float)
    hull = pts[ConvexHull(pts).vertices]
    # drop the least important corners until it's small enough for the game
    while len(hull) > max_points:
        areas = []
        for i in range(len(hull)):
            p0, p1, p2 = hull[i - 1], hull[i], hull[(i + 1) % len(hull)]
            areas.append(abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])))
        hull = np.delete(hull, int(np.argmin(areas)), axis=0)
    center = hull.mean(axis=0)
    d = hull - center
    n = np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    hull = hull - d / n * inset
    return [(x / w, y / h) for x, y in hull]


def build_lasers():
    """Full-width laser textures from the sheet's laser drawing: its two
    emitter caps at the ends and its beam stretched across the middle.
    Charging = faint beam, firing = full glow."""
    src = Image.open(os.path.join(OUT, "hazards", "laser", "00.png")).convert("RGBA")
    bbox = src.getchannel("A").getbbox()
    src = src.crop(bbox)
    w, h = src.size
    cap = int(w * 0.24)
    left, right = src.crop((0, 0, cap, h)), src.crop((w - cap, 0, w, h))
    beam = src.crop((cap + 2, 0, w - cap - 2, h))
    W, H = 2048, 202
    scale = H * 0.8 / h
    left = left.resize((int(left.width * scale), int(h * scale)), Image.LANCZOS)
    right = right.resize((int(right.width * scale), int(h * scale)), Image.LANCZOS)
    beam = beam.resize((W - left.width - right.width + 8, int(h * scale)), Image.LANCZOS)
    for name, strength in (("laser_active.png", 1.0), ("laser_inactive.png", 0.28)):
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        y = (H - left.height) // 2
        b = beam.copy()
        b.putalpha(b.getchannel("A").point(lambda v: int(v * strength)))
        out.alpha_composite(b, (left.width - 4, y))
        out.alpha_composite(left, (0, y))
        out.alpha_composite(right, (W - right.width, y))
        out.save(os.path.join(OUT, "hazards", name), optimize=True)
    print("built hazards/laser_active.png + laser_inactive.png")


ALIGNED = {"run", "fly", "idle", "land", "jump", "smash"}   # same body, moving
SHARED_SIZE = ALIGNED | {"transform"}   # one scale per character across these


def head_center(frame):
    """Center of the top of the character, used to line frames up: capes,
    flames and swinging arms change the outline, the head barely moves."""
    a = np.asarray(frame.getchannel("A")) > 128
    rows = np.nonzero(a.sum(axis=1) >= 4)[0]
    top, bottom = rows[0], rows[-1]
    head = a[top: top + max(4, int((bottom - top) * 0.34))]
    ys, xs = np.nonzero(head)
    return float(xs.mean()), float(ys.mean() + top)


def needed_side(frames, align):
    side = 0
    for f in frames:
        cx = head_center(f)[0] if align else f.width / 2
        side = max(side, 2 * max(cx, f.width - cx), f.height)
    return int(side) + 6


def place(frames, side, anchor, align):
    """Puts frames on one square canvas: heads share a column so the body
    doesn't jump, feet (or, in the air, heads) share a line."""
    out = []
    heads = [head_center(f) for f in frames]
    mean_y = float(np.mean([h[1] for h in heads]))
    tallest = max(f.height for f in frames)
    for f, (hx, hy) in zip(frames, heads):
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        x = int(round(side / 2 - (hx if align else f.width / 2)))
        if anchor == "bottom":
            y = side - f.height - 2
        else:
            y = int(round((side - tallest) / 2 + (mean_y - hy if align else 0)))
            y = max(0, min(y, side - f.height))
        canvas.alpha_composite(f, (max(0, x), y))
        out.append(canvas)
    return out


def main():
    sheets = {}
    manifest = ["# THON TECHRIDE asset manifest (generated by tools/extract_sheets.py)",
                "# anim  <id>  <folder under assets/techride/>  <frames>  <fps>  <size>  <anchor>  <loop>"]
    problems = []
    rows = [r + (False,) for r in ROWS] + [r + (True,) for r in DARK_ROWS]
    kinds = {"hazard": "hazards", "fx": "effects", "item": "collectibles",
             "cosmetic": "cosmetics"}
    # pass 1: cut everything out, and find one canvas size per character so it
    # stays the same size when it changes animation
    cut, shared = {}, {}
    for anim_id, sheet, box, expected, fps, anchor, loop, dark in rows:
        if sheet not in sheets:
            sheets[sheet] = Image.open(os.path.join(SHEETS, sheet))
        group, name = anim_id.split(".")
        cut[anim_id] = extract_row(sheets[sheet], box, anchor, expected, dark,
                                   keep_small=name in ("celebrate", "transform"))
        if group not in kinds and name in SHARED_SIZE and cut[anim_id]:
            shared[group] = max(shared.get(group, 0),
                                needed_side(cut[anim_id], name in ALIGNED))
    # pass 2: place, save, record
    for anim_id, sheet, box, expected, fps, anchor, loop, dark in rows:
        group, name = anim_id.split(".")
        raw = cut[anim_id]
        align = group not in kinds and name in ALIGNED
        side = (shared[group] if group not in kinds and name in SHARED_SIZE
                else needed_side(raw, False) if raw else 0)
        frames = place(raw, side, anchor, align) if raw else []
        group, name = anim_id.split(".")
        folder = (os.path.join(kinds[group], name) if group in kinds
                  else os.path.join("characters", group, name))
        dest = os.path.join(OUT, folder)
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest)
        if anim_id in FACING_RIGHT:
            # drawn pointing right, but they fly left across the screen
            frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]
        factor = UPSCALE.get(group, 2)
        for i, f in enumerate(frames):
            enlarge(f, factor, hard_edges=not dark).save(
                os.path.join(dest, f"{i:02d}.png"), optimize=True)
        status = "ok" if len(frames) == expected else f"got {len(frames)} of {expected}"
        if len(frames) != expected:
            problems.append(f"{anim_id}: {status}")
        print(f"{anim_id:20s} {len(frames)} frames  {side}x{side}  {status}")
        manifest.append(f"anim {anim_id} {folder}/ {len(frames)} {fps} {side * UPSCALE.get(group, 2)} {anchor} "
                        f"{'loop' if loop else 'once'}")
        if group not in kinds and frames:
            hx, top, height = head_anchor(frames)
            manifest.append(f"anchor {anim_id} {hx:.3f} {top:.3f} {height:.3f}")
            for i, f in enumerate(frames):
                pts = hitbox_outline(f, flame=name in ("fly", "jump"))
                if pts:
                    manifest.append(f"hull {anim_id} {i} " +
                                    " ".join(f"{x:.3f} {y:.3f}" for x, y in pts))
    build_lasers()
    build_arena_layers()
    with open(MANIFEST, "w") as f:
        f.write("\n".join(manifest) + "\n")
    if problems:
        print("\nNeeds attention:\n  " + "\n  ".join(problems))
    return 0


if __name__ == "__main__":
    sys.exit(main())
