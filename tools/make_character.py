"""
Turns a photo or short video into a playable character and registers it in
assets/characters/characters.txt -- or, with --celebration, into the
"NEW BEST!" animation shown on the game over screen.

    python3 tools/make_character.py INPUT "Display Name" [--remove-bg]
                                    [--file name] [--no-flame] [--fps N]
    python3 tools/make_character.py VIDEO --celebration [--fps N]

INPUT can be:
  * a PNG that already has a transparent background,
  * any photo plus --remove-bg to cut the person out automatically, or
  * a video (.mov/.mp4) -- always background-removed, and becomes an
    animated character (one frame per 1/fps seconds, default 12 fps).

Background removal uses tools/cutout.swift (macOS Vision, built in) when
available, otherwise the `rembg` package (pip install "rembg[cpu]").
Vision's person segmentation is made for people; for other subjects
(e.g. a mascot costume) cut the photo out yourself and pass the PNG.

The sprite is trimmed, given a jetpack flame underneath and fitted into a
256x256 transparent square, which is what the game expects.

Requires: pip install pillow
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR_DIR = os.path.join(ROOT, "assets", "characters")
CELEBRATION_DIR = os.path.join(ROOT, "assets", "celebration")
CELEBRATION_H = 512
LIST_FILE = os.path.join(CHAR_DIR, "characters.txt")
SIZE = 256
FLAME_H = 52


VIDEO_EXTS = {".mov", ".mp4", ".m4v"}
CUTOUT_SWIFT = os.path.join(ROOT, "tools", "cutout.swift")


def cutout_frames(path, fps):
    """Background-removed frames of a photo or video, in order."""
    if sys.platform == "darwin" and shutil.which("swift"):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["swift", CUTOUT_SWIFT, path, tmp, "--fps", str(fps)],
                           check=True, stdout=subprocess.DEVNULL)
            names = sorted(n for n in os.listdir(tmp) if n.endswith(".png"))
            return [Image.open(os.path.join(tmp, n)).copy() for n in names]
    if os.path.splitext(path)[1].lower() in VIDEO_EXTS:
        sys.exit("video input needs macOS (tools/cutout.swift)")
    from rembg import new_session, remove
    img = Image.open(path).convert("RGB")
    return [remove(img, session=new_session("isnet-general-use"))]


def flame(width):
    s = 4
    w, h = width * s, FLAME_H * s
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for color, frac in (((79, 107, 255, 255), 1.0), ((245, 197, 24, 255), 0.75),
                        ((255, 255, 255, 255), 0.45)):
        hw = w / 2 * frac
        d.polygon([(w / 2 - hw, 0), (w / 2 + hw, 0), (w / 2, h * frac)], fill=color)
    img = img.filter(ImageFilter.GaussianBlur(s))
    return img.resize((width, FLAME_H), Image.LANCZOS)


def build_sprite(src, with_flame, bbox=None):
    img = src.convert("RGBA")
    img = img.crop(bbox or alpha_bbox(img))
    body_h = SIZE - (FLAME_H - 8 if with_flame else 0)
    scale = min(SIZE / img.width, body_h / img.height)
    img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))),
                     Image.LANCZOS)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - img.width) // 2
    y = (body_h - img.height) // 2 if with_flame else (SIZE - img.height) // 2
    if with_flame:
        f = flame(max(24, img.width // 4))
        out.alpha_composite(f, ((SIZE - f.width) // 2, y + img.height - 8))
    # soft white glow behind the runner so it stands out on busy backgrounds
    shape = Image.new("L", out.size, 0)
    shape.paste(img.getchannel("A"), (x, y))
    halo_mask = shape.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    halo = Image.new("RGBA", out.size, (255, 255, 255, 0))
    halo.putalpha(halo_mask.point(lambda a: int(a * 0.85)))
    out.alpha_composite(halo)
    out.alpha_composite(img, (x, y))
    return out


def alpha_bbox(img):
    return img.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()


def union_bbox(frames):
    boxes = [alpha_bbox(f.convert("RGBA")) for f in frames]
    boxes = [b for b in boxes if b]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def save_celebration(frames):
    """Trimmed (not squared, no flame) frames + frame count for the game."""
    shutil.rmtree(CELEBRATION_DIR, ignore_errors=True)
    os.makedirs(CELEBRATION_DIR)
    box = union_bbox(frames)
    for i, frame in enumerate(frames):
        img = frame.convert("RGBA").crop(box)
        w = max(1, int(img.width * CELEBRATION_H / img.height))
        img.resize((w, CELEBRATION_H), Image.LANCZOS).save(
            os.path.join(CELEBRATION_DIR, f"{i:02d}.png"))
    with open(os.path.join(CELEBRATION_DIR, "celebration.txt"), "w") as f:
        f.write("# Number of frames (00.png, 01.png, ...) in the NEW BEST! animation.\n"
                "# Regenerate with: python3 tools/make_character.py VIDEO --celebration\n"
                f"{len(frames)}\n")


def register(name, sprite, frames=1):
    lines = []
    if os.path.exists(LIST_FILE):
        with open(LIST_FILE) as f:
            lines = f.read().splitlines()
    entry = f"{name}|{sprite}" + (f"|{frames}" if frames > 1 else "")
    kept = [l for l in lines if l.strip().startswith("#") or
            (l.strip() and l.split("|")[0].strip() != name)]
    kept.append(entry)
    with open(LIST_FILE, "w") as f:
        f.write("\n".join(kept) + "\n")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="photo, cut-out PNG, or short video")
    p.add_argument("name", nargs="?",
                   help="name shown in Settings, e.g. \"Tech Robot\"")
    p.add_argument("--celebration", action="store_true",
                   help="make the NEW BEST! animation instead of a character")
    p.add_argument("--file", help="sprite file/folder name (default: from the name)")
    p.add_argument("--remove-bg", action="store_true",
                   help="cut the background out of a photo automatically")
    p.add_argument("--no-flame", action="store_true", help="skip the jetpack flame")
    p.add_argument("--fps", type=float, default=12,
                   help="frames per second to sample from a video (default 12)")
    args = p.parse_args()

    is_video = os.path.splitext(args.input)[1].lower() in VIDEO_EXTS
    if args.celebration:
        frames = cutout_frames(args.input, args.fps) if (is_video or args.remove_bg) \
            else [Image.open(args.input)]
        save_celebration(frames)
        print(f"Celebration set: assets/celebration/ ({len(frames)} frames)")
        print("Rebuild the game (make web / make exe) to include it.")
        return
    if not args.name:
        p.error("a display name is required (or pass --celebration)")
    if "|" in args.name:
        p.error("name cannot contain '|'")
    base = args.file or re.sub(r"[^a-z0-9]+", "_", args.name.lower()).strip("_")
    base = os.path.splitext(base)[0]

    if is_video or args.remove_bg:
        frames = cutout_frames(args.input, args.fps)
    else:
        src = Image.open(args.input)
        if src.mode != "RGBA" or src.getchannel("A").getextrema()[0] == 255:
            p.error("image has no transparent background; pass --remove-bg or "
                    "cut it out first")
        frames = [src]

    os.makedirs(CHAR_DIR, exist_ok=True)
    flame_on = not args.no_flame
    if len(frames) == 1:
        build_sprite(frames[0], flame_on).save(os.path.join(CHAR_DIR, base + ".png"))
        register(args.name, base + ".png")
        where = f"assets/characters/{base}.png"
    else:
        folder = os.path.join(CHAR_DIR, base)
        shutil.rmtree(folder, ignore_errors=True)
        os.makedirs(folder)
        bbox = union_bbox(frames)  # same crop for every frame so it doesn't jitter
        for i, frame in enumerate(frames):
            build_sprite(frame, flame_on, bbox).save(os.path.join(folder, f"{i:02d}.png"))
        register(args.name, base + "/", len(frames))
        where = f"assets/characters/{base}/ ({len(frames)} frames)"
    print(f"Added '{args.name}' -> {where}")
    print("Rebuild the game (make game / make exe) to include it.")


if __name__ == "__main__":
    main()
