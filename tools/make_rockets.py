"""
Turns a photo of a person into a "body rocket" -- the obstacle that flies in
from the right after the warning sign. The person is cut out, laid
horizontal (head first, flying left) with a jetpack flame blasting from their
feet. Each launch picks one at random from assets/rockets/rockets.txt.

    python3 tools/make_rockets.py PHOTO [--faces 0,1] [--erase X0 Y0 X1 Y1]
                                        [--name NAME]

The background is removed with macOS Vision (tools/cutout.swift). Photos often
have other people in the background, so only the person attached to the main
face is kept (faces found by tools/faces.swift):
  --faces   which detected faces to keep, biggest first (default 0);
            e.g. --faces 0,1 for two people (a piggyback)
  --erase   blank out a rectangle (pixels from top-left) before picking the
            person -- for things held up to the camera; can repeat

    python3 tools/make_rockets.py --list      show the current rockets
    python3 tools/make_rockets.py --remove N  remove rocket file N

Requires: pip install pillow   (macOS for the automatic cutout)
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROCKET_DIR = os.path.join(ROOT, "assets", "rockets")
LIST_FILE = os.path.join(ROCKET_DIR, "rockets.txt")
FACES_SWIFT = os.path.join(ROOT, "tools", "faces.swift")
CUTOUT_SWIFT = os.path.join(ROOT, "tools", "cutout.swift")

W, H = 320, 110          # sprite size (the game draws it at 150x52)
FLAME_LEN = 78
GOLD = (245, 197, 24)


def detect_faces(path):
    out = subprocess.run(["swift", FACES_SWIFT, path], capture_output=True,
                         text=True, check=True).stdout
    faces = [tuple(int(v) for v in line.split()) for line in out.splitlines()
             if len(line.split()) == 4]
    # biggest first, so index 0 is the main subject
    return sorted(faces, key=lambda f: -f[2] * f[3])


def cut_out(path):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["swift", CUTOUT_SWIFT, path, tmp], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return Image.open(os.path.join(tmp, "00.png")).convert("RGBA")


def keep_person(img, faces, erase):
    """Keeps only the cut-out region connected to the chosen faces."""
    alpha = img.getchannel("A")
    d = ImageDraw.Draw(alpha)
    for x0, y0, x1, y1 in erase:
        d.rectangle([x0, y0, x1, y1], fill=0)
    solid = alpha.point(lambda a: 255 if a > 100 else 0)
    for fx, fy, fw, fh in faces:
        # seed from the first solid pixel near the middle of the face
        seed = next(((x, y) for y in range(fy + fh // 3, fy + fh)
                     for x in range(fx + fw // 4, fx + 3 * fw // 4, 2)
                     if solid.getpixel((x, y)) == 255), None)
        if seed:
            ImageDraw.floodfill(solid, seed, 128)
    person = solid.point(lambda v: 255 if v == 128 else 0)
    person = person.filter(ImageFilter.MaxFilter(5))   # keep soft edges
    alpha = Image.composite(alpha, Image.new("L", alpha.size, 0), person)
    img.putalpha(alpha)
    box = alpha.point(lambda a: 255 if a > 40 else 0).getbbox()
    if not box:
        sys.exit("couldn't find the person -- try --faces or --erase")
    return img.crop(box)


def flame(length, height):
    """Exhaust pointing right (out of their feet)."""
    s = 4
    fw, fh = length * s, height * s
    img = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for color, frac in (((79, 107, 255, 255), 1.0), (GOLD + (255,), 0.72),
                        ((255, 255, 255, 255), 0.42)):
        hh = fh / 2 * frac
        d.polygon([(0, fh / 2 - hh), (fw * frac, fh / 2), (0, fh / 2 + hh)], fill=color)
    return img.filter(ImageFilter.GaussianBlur(3 * s)).resize((length, height), Image.LANCZOS)


def build(person):
    # standing upright -> lying flat, head pointing left (the way it flies)
    body = person.rotate(90, expand=True, resample=Image.BICUBIC)
    max_w, max_h = W - FLAME_LEN + 14, H - 8
    scale = min(max_w / body.width, max_h / body.height)
    body = body.resize((max(1, int(body.width * scale)), max(1, int(body.height * scale))),
                       Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bx, by = 2, (H - body.height) // 2
    fh = max(30, int(body.height * 0.7))
    out.alpha_composite(flame(FLAME_LEN, fh), (bx + body.width - 14, (H - fh) // 2))
    # soft white glow so they pop against the background
    shape = Image.new("L", out.size, 0)
    shape.paste(body.getchannel("A"), (bx, by))
    glow = shape.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
    halo = Image.new("RGBA", out.size, (255, 255, 255, 0))
    halo.putalpha(glow.point(lambda a: int(a * 0.8)))
    out.alpha_composite(halo)
    out.alpha_composite(body, (bx, by))
    return out


def read_list():
    if not os.path.exists(LIST_FILE):
        return []
    with open(LIST_FILE) as f:
        return [l.strip() for l in f if l.strip() and not l.startswith("#")]


def write_list(files):
    with open(LIST_FILE, "w") as f:
        f.write("# Body rockets: one sprite file per line; each launch picks one at random.\n"
                "# Add more with: python3 tools/make_rockets.py PHOTO\n")
        f.write("".join(name + "\n" for name in files))


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("photo", nargs="?")
    p.add_argument("--faces", default="0", help="detected faces to keep, e.g. 0,1")
    p.add_argument("--erase", type=int, nargs=4, action="append", default=[],
                   metavar=("X0", "Y0", "X1", "Y1"))
    p.add_argument("--name", help="sprite file name (default: next number)")
    p.add_argument("--list", action="store_true")
    p.add_argument("--remove", metavar="FILE")
    args = p.parse_args()

    os.makedirs(ROCKET_DIR, exist_ok=True)
    files = read_list()
    if args.list:
        print("\n".join(files) or "(none)")
        return
    if args.remove:
        files = [f for f in files if f != args.remove]
        write_list(files)
        path = os.path.join(ROCKET_DIR, args.remove)
        if os.path.exists(path):
            os.remove(path)
        print("removed", args.remove)
        return
    if not args.photo:
        p.error("give a photo (or --list / --remove)")

    faces = detect_faces(args.photo)
    if not faces:
        sys.exit("no face found in the photo")
    picks = [faces[int(i)] for i in args.faces.split(",") if int(i) < len(faces)]
    photo = ImageOps.exif_transpose(Image.open(args.photo))
    cut = cut_out(args.photo)
    if cut.size != photo.size:
        cut = cut.resize(photo.size)
    person = keep_person(cut, picks, args.erase)

    used = {int(m.group(1)) for f in files if (m := re.match(r"body_(\d+)\.png$", f))}
    name = args.name or f"body_{min(set(range(1, 1000)) - used):02d}.png"
    build(person).save(os.path.join(ROCKET_DIR, name))
    if name not in files:
        files.append(name)
    write_list(files)
    print(f"Added rocket {name}. Rebuild the game to include it.")


if __name__ == "__main__":
    main()
