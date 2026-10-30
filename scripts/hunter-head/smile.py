# Usage: python3 -I smile.py OUT.png [json overrides]   (reads public/images/hunter.jpg, writes the smiling headshot)
# Hunter smiling (Hunter, Oct 25: "also make me smile"), for the relief: his own headshot warped, nothing invented.
# The corners of the mouth go up and out and the lip line between them curves with them, the cheeks lift over
# the corners and fold in a little beside the nose, and the lower lids rise into a slight squint. Then:
#   depth.py WEIGHTS OUT.png WORK/disp, average disp_518 and disp_742 into WORK/disp.npy, and
#   relief.py WORK OUTDIR '{"photo": "OUT.png", "cheeks": 1}'
# Coordinates are the headshot's 720 frame (as relief.py's).
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
out = sys.argv[1]
P = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
g = lambda k, v: P.get(k, v)
im = Image.open(g("photo", "/Users/hunterthompson/Developer/kinetic/kineticstudio/public/images/hunter.jpg")).convert("RGB")
W0, H0 = im.size
a = np.asarray(im.resize((720, 720), Image.BICUBIC)).astype(np.float64)
yy, xx = np.mgrid[0:720, 0:720].astype(np.float64)
dx, dy = np.zeros((720, 720)), np.zeros((720, 720))
def push(cx, cy, mx, my, rx, ry=None):
    """move what is round (cx, cy) by (mx, my), falling off over a gaussian of radii rx, ry"""
    ry = ry or rx
    w = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
    dx[...] += mx * w; dy[...] += my * w

lift, out_, mid = g("lift", 12), g("out", 5), g("mid", 356)
L, Rr = g("left", 320), g("right", 409)  # the corners of the mouth
# the corners: up and out, with the lips either side of them carried along
for cx, sx in ((L, -1), (Rr, 1)):
    push(cx, mid, sx * out_, -lift, g("cornerR", 16), g("cornerRy", 17))  # tall, so the beard under it is not swirled
    push(cx - sx * 14, mid, sx * out_ * 0.4, -lift * 0.45, 14, 10)
# the middle of the lip line stays put and dips a touch, so it curves
push((L + Rr) / 2, mid + 2, 0, g("dip", 1.5), 18, 8)
# the cheeks ride up over the corners
for cx, sx in ((L - 14, -1), (Rr + 14, 1)):
    push(cx, g("cheekY", 322), sx * 1.0, -g("cheekLift", 5.5), g("cheekR", 32), g("cheekRy", 26))
# the lower lids rise: a slight squint
for cx, cy in ((311, 254), (406, 255)):
    push(cx, cy + 9, 0, -g("squint", 2.2), 15, 5)

# backward map: each pixel takes what was where it came from
src_y, src_x = yy - dy, xx - dx
warped = np.dstack([nd.map_coordinates(a[..., c], [src_y, src_x], order=3, mode="nearest") for c in range(3)])

# the folds a smile makes, drawn faintly in the photo so the carving finds them: beside the nose down
# toward each corner (above the beard), and a short crease out from each corner
def fold(pts, depth, width):
    t = np.linspace(0, 1, 200)[:, None]
    p = np.array(pts, float)
    # a quadratic through the three points
    c = (1 - t) ** 2 * p[0] + 2 * (1 - t) * t * p[1] + t ** 2 * p[2]
    d = np.full((720, 720), 1e9)
    for (x, y) in c:
        d = np.minimum(d, (xx - x) ** 2 + (yy - y) ** 2)
    return depth * np.exp(-d / (2 * width ** 2))
k = g("fold", 0.11)
shade = np.zeros((720, 720))
shade += fold([(334, 322), (322, 336), (314, 350)], k, 1.6)
shade += fold([(388, 322), (400, 336), (408, 350)], k, 1.6)
shade += fold([(L - 2, mid - 2), (L - 7, mid + 1), (L - 10, mid + 5)], k * 0.8, 1.2)
shade += fold([(Rr + 2, mid - 2), (Rr + 7, mid + 1), (Rr + 10, mid + 5)], k * 0.8, 1.2)
warped *= (1 - shade)[..., None]

Image.fromarray(np.clip(warped, 0, 255).astype(np.uint8)).resize((W0, H0), Image.BICUBIC).save(out)
print("moved up to", float(np.hypot(dx, dy).max()), "px")
