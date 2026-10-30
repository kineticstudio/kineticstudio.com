# Usage: python3 -I scan_png.py RADII.npz OUT.png   (RADII from scan_bake.py)
# The head map the membrane loads (src/scripts/hunter-membrane.js loadHead): the scan's radii over the softened
# ones, each in 16 bits (R hi, G lo) of RMAX sheet heights.
import sys, numpy as np
from PIL import Image
RMAX = 0.8
z = np.load(sys.argv[1])
# thin spikes (a tuft the reconstruction pulled up out of his hair) brought down to their neighbours
from scipy import ndimage as nd
def despike(r, k=7, over=0.025):
    w = np.concatenate([r[:, -k:], r, r[:, :k]], 1)
    med = nd.median_filter(w, size=k, mode="nearest")[:, k:-k]
    return np.minimum(r, med + over)
# the scan's eyes and the hollows round them come out as pits; a closing (over hollows narrower than
# CLOSE samples) fills them most of the way, as a sculptor would close the lids, and leaves what stands out
CLOSE, FILL = 15, 0.7
def close(r):
    k = CLOSE
    w = np.concatenate([r[:, -k:], r, r[:, :k]], 1)
    c = nd.grey_closing(w, size=(k, k), mode="nearest")[:, k:-k]
    return nd.gaussian_filter(r + FILL * (c - r), 1.0, mode=("nearest", "wrap"))
# and on his scalp only (the top SCALP degrees), an opening takes off what stands up narrower than CLOSE
# samples: the tufts the reconstruction pulled up out of his hair (his nose and ears are left as they are)
SCALP = 40
def scalp(r):
    k = CLOSE
    w = np.concatenate([r[:, -k:], r, r[:, :k]], 1)
    o = nd.grey_opening(w, size=(k, k), mode="nearest")[:, k:-k]
    rows = np.arange(r.shape[0]) / (r.shape[0] - 1) * 180
    m = np.clip((SCALP - rows) / 10, 0, 1)[:, None]
    return r + m * (o - r)
# his face, from the front (the cone the stand-in's carving used), softened a little more: what the capture
# gets wrong there is lumpy, small-scale noise; the nose, brow and jaw are larger than it and stay
def face(r, sigma=2.2):
    H1, W = r.shape
    ph = (np.arange(H1) / (H1 - 1) * np.pi)[:, None]; th = ((np.arange(W) + 0.5) / W * 2 * np.pi)[None]
    m = np.clip((np.sin(ph) * np.cos(th) - 0.35) / 0.5, 0, 1)
    soft = nd.gaussian_filter(np.concatenate([r[:, -12:], r, r[:, :12]], 1), sigma, mode="nearest")[:, 12:-12]
    return r + m * (soft - r)
full, plain = face(close(scalp(despike(z["full"])))), scalp(despike(z["plain"]))
code = np.round(np.clip(np.vstack([full, plain]) / RMAX, 0, 1) * 65535).astype(np.uint32)
img = np.dstack([(code >> 8).astype(np.uint8), (code & 255).astype(np.uint8), np.zeros_like(code, np.uint8)])
Image.fromarray(img, "RGB").save(sys.argv[2], optimize=True)
print(sys.argv[2], img.shape[1], "x", img.shape[0], "r", float(full.min()), float(full.max()))
