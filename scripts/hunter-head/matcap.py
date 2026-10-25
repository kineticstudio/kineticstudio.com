# a light studio for mirror chrome on a light page, as a matcap: what a mirror ball sees
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
out, variant = sys.argv[1], sys.argv[2]
S = 512; SS = 2; n = S * SS
y, x = np.mgrid[0:n, 0:n].astype(np.float64)
nx = (x + 0.5) / n * 2 - 1; ny = 1 - (y + 0.5) / n * 2
r2 = nx * nx + ny * ny; inside = r2 <= 1
nz = np.sqrt(np.clip(1 - r2, 0, 1))
# reflect the view (0,0,-1) about the normal
rx, ry, rz = 2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1
def sm(a, b, t): t = np.clip((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def box(cx, cy, w, h, soft, axis_u, axis_v):
    # a rectangle of light on the sky, in (u, v) angles
    return sm(-w - soft, -w + soft, axis_u - cx) * (1 - sm(w - soft, w + soft, axis_u - cx)) * sm(-h - soft, -h + soft, axis_v - cy) * (1 - sm(h - soft, h + soft, axis_v - cy))
az = np.arctan2(rx, -rz)  # 0 = straight ahead (behind the sheet), +-pi = behind the viewer
el = np.arcsin(np.clip(ry, -1, 1))
P = dict(
    silver=dict(sky=0.86, zen=0.97, ground=0.30, horizon=0.04, behind=0.80, flag=0.06, hot=2.2),
    pearl=dict(sky=0.92, zen=1.0, ground=0.55, horizon=0.08, behind=0.88, flag=0.25, hot=1.6),
    steel=dict(sky=0.7, zen=0.95, ground=0.05, horizon=0.03, behind=0.6, flag=0.0, hot=3.0),
    graphite=dict(sky=0.62, zen=0.85, ground=0.12, horizon=0.03, behind=0.55, flag=0.02, hot=2.6),
)[variant]
# sky over a darker floor, the horizon soft but quick
sky = P["sky"] + (P["zen"] - P["sky"]) * np.clip(ry, 0, 1)
ground = P["ground"] * (0.7 + 0.3 * np.clip(-ry * 2, 0, 1))
c = ground + (sky - ground) * sm(-P["horizon"], P["horizon"], ry - 0.02)
# behind the viewer (the middle of the ball, what a flat sheet facing you mirrors): the room, light, a soft fall to the floor
behind = sm(-0.2, 0.6, rz)  # rz > 0: towards the viewer
room = P["behind"] * (0.82 + 0.3 * ry)
c = c * (1 - behind) + room * behind
# dark flags: two tall black boards left and right, and one low behind, so a curve shows a line
for ax_, w in ((1.25, 0.16), (-1.35, 0.12)):
    f = box(ax_, 0.2, w, 0.9, 0.05, az, el)
    c = c * (1 - f) + P["flag"] * f
f = box(0.0, -0.55, 1.4, 0.18, 0.12, az, el); c = c * (1 - 0.5 * f) + P["flag"] * 0.5 * f
# softboxes: a big one high in front, a strip each side, a small kicker
for (a0, e0, w, h, k) in ((0.15, 0.85, 0.55, 0.22, 1.0), (0.85, 0.3, 0.07, 0.55, 0.8), (-0.8, 0.35, 0.09, 0.5, 0.9), (2.4, 0.55, 0.25, 0.12, 0.6)):
    f = box(a0, e0, w, h, 0.03, az, el)
    c = c + (P["hot"] - c) * f * k
img = np.clip(c, 0, None)
# to sRGB, with the edge of the ball smooth
img = np.where(inside, img, img)  # outside the ball: keep the edge colour (sampling stays clean)
lin = np.clip(img / (1 + 0.15 * np.maximum(img - 1, 0)), 0, 1)
srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
srgb = nd.zoom(srgb, 1 / SS, order=1)
# fill outside the disc with the nearest rim colour
m = nd.zoom(inside.astype(float), 1 / SS, order=1) > 0.5
idx = nd.distance_transform_edt(~m, return_distances=False, return_indices=True)
srgb = srgb[idx[0], idx[1]]
Image.fromarray((np.clip(srgb, 0, 1) * 255).astype(np.uint8)).convert("RGB").save(out, quality=92)
print(out)
