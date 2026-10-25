# the head as a star-shaped surface round its middle: for each direction, how far out his surface is
# (inside = between the back and front heights; outermost crossing found by marching in, then bisection)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
work, out = sys.argv[1], sys.argv[2]
W, H = int(sys.argv[3]), int(sys.argv[4])
f = nd.gaussian_filter(np.load(f"{work}/front.npy"), 1.2) / 720.0
b = nd.gaussian_filter(np.load(f"{work}/back.npy"), 1.2) / 720.0
C = np.array([362 / 720 - 0.5, 0.5 - 262 / 720, 0.03])  # the middle of his head (world: x right, y up, z toward the viewer)
CUT = 0.5 - 520 / 720  # nothing below this (the neck is cut off under the jaw)
def inside(p):
    px = (p[..., 0] + 0.5) * 720 - 0.5; py = (0.5 - p[..., 1]) * 720 - 0.5
    co = np.stack([py.ravel(), px.ravel()])
    F = nd.map_coordinates(f, co, order=1, mode="constant").reshape(px.shape)
    B = nd.map_coordinates(b, co, order=1, mode="constant").reshape(px.shape)
    return (p[..., 2] < F) & (p[..., 2] > -B) & (p[..., 1] > CUT) & (F + B > 1e-4)
th = (np.arange(W) + 0.5) / W * 2 * np.pi  # round the vertical axis, 0 = facing the viewer
ph = (np.arange(H + 1)) / H * np.pi       # 0 = straight up
T, P = np.meshgrid(th, ph)
d = np.stack([np.sin(P) * np.sin(T), np.cos(P), np.sin(P) * np.cos(T)], -1)
R0 = 0.62; steps = 248
r_out = np.full(T.shape, 0.0); found = np.zeros(T.shape, bool)
for k in range(steps):
    r = R0 * (1 - k / steps)
    hit = inside(C + d * r) & ~found
    r_out[hit] = r; found |= hit
lo = r_out.copy(); hi = np.minimum(r_out + R0 / steps, R0)  # lo inside, hi outside
for _ in range(10):
    mid = (lo + hi) / 2; ins = inside(C + d * mid[..., None])
    lo = np.where(ins, mid, lo); hi = np.where(ins, hi, mid)
r = np.where(found, lo, 0.02)
print("rays without a hit:", int((~found).sum()), "r range", r.min(), r.max())
# smooth on the sphere: wrap round, a little more toward the poles
rs = nd.gaussian_filter(np.concatenate([r[:, -24:], r, r[:, :24]], 1), (float(sys.argv[5]), float(sys.argv[6])))[:, 24:-24]
for j in range(H + 1):  # rows near the poles squeeze: average them harder
    s = np.sin(ph[j])
    if s < 0.3: rs[j] = nd.gaussian_filter1d(rs[j], 1.2 / max(s, 0.02), mode="wrap")
rs[0] = rs[0].mean(); rs[-1] = rs[-1].mean()
np.save(f"{work}/radial.npy", rs)
code = np.round(np.clip(rs / 0.8, 0, 1) * 65535).astype(np.uint32)
img = np.dstack([(code >> 8).astype(np.uint8), (code & 255).astype(np.uint8), np.zeros_like(code, np.uint8)])
Image.fromarray(img, "RGB").save(out, optimize=True)
print(out, img.shape)
