"""
Cuts a tan/orange subject (e.g. the Nittany Lion costume) out of a photo
with a dark or blue background by keying on fur color, then fills in
anything enclosed by the fur (scarf, gloves, bib, mouth).

    python3 tools/color_key_cutout.py PHOTO OUT.png PREVIEW.jpg

Use this when tools/cutout.swift (person segmentation) misses a costume.
Tweak the hue/saturation thresholds below for other colors.
"""
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops
src = Image.open(sys.argv[1]).convert("RGB")
W, H = src.size
hsv = src.convert("HSV")
h, s, v = hsv.split()
# fur: orange/tan hue (~15-45 deg => 10-32 on 0-255), decent saturation
fur = Image.merge("RGB", (h, s, v)).point(lambda x: x)  # noop for clarity
hm = h.point(lambda x: 255 if 6 <= x <= 34 else 0)
sm = s.point(lambda x: 255 if x >= 70 else 0)
vm = v.point(lambda x: 255 if x >= 45 else 0)
mask = ImageChops.multiply(ImageChops.multiply(hm, sm), vm)
# clean speckle, close gaps
mask = mask.filter(ImageFilter.MedianFilter(7))
mask = mask.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15))
# keep largest blob: flood from a known fur point into a fresh image
seed = (int(W * 0.30), int(H * 0.80))
if mask.getpixel(seed) != 255:
    seed = next((x, seed[1]) for x in range(seed[0], W) if mask.getpixel((x, seed[1])) == 255)
blob = mask.copy()
ImageDraw.floodfill(blob, seed, 128)
mask = blob.point(lambda x: 255 if x == 128 else 0)
# fill holes (scarf, gloves, bib, mouth): flood background from the top corners
holes = mask.copy()
for corner in [(0, 0), (W - 1, 0), (0, H // 2), (W - 1, H // 2)]:
    if holes.getpixel(corner) == 0:
        ImageDraw.floodfill(holes, corner, 77)
mask = holes.point(lambda x: 0 if x == 77 else 255)
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.5))
out = src.convert("RGBA"); out.putalpha(mask)
out = out.crop(mask.point(lambda a: 255 if a > 40 else 0).getbbox())
out.save(sys.argv[2])
bg = Image.new("RGBA", out.size, (255, 0, 255, 255)); bg.alpha_composite(out)
bg.convert("RGB").resize((out.width // 3, out.height // 3)).save(sys.argv[3])
print(out.size)
