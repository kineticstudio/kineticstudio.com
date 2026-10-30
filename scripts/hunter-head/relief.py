# Usage: python3 -I relief.py WORK OUTDIR [json overrides]   (WORK holds disp.npy from depth.py; writes OUTDIR/hunter-relief.png,
# copy it to public/images/ and run node scripts/sync-membrane-prototype.mjs)
# Hunter as a carved bas-relief, from his headshot: a bust (head, hair, ears, neck, collar, jacket)
# rising out of a flat slab. Heights in pixels of the output (R x R, the headshot's frame).
#   macro   the depth model's shape, compressed the way a relief is, eyes filled (eyeballs, lids), the bust
#           receding toward the bottom; plus the photo's shading at a middle scale (form)
#   carve   the photo's fine lines as crisp incisions: lids, lips, nostrils, folds, seams (signed)
#   strands hair (and brows) as fine strands along the hair's own flow (structure tensor + LIC) (signed)
#   locks   the same flow, coarse: carved locks with grooves between them (signed)
#   stubble the beard as short strands and stippled pits (signed)
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
work, outdir = sys.argv[1], sys.argv[2]
P = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
g = lambda k, v: P.get(k, v)
# the face's place in this photo (portraits.py): every region below is in the headshot's frame (eyes at
# 311,254 and 406,255 of 720); fs scales that frame and ox, oy move it, so a photo framed closer or wider works
fs, ox, oy = g("fs", 1.0), g("ox", 0.0), g("oy", 0.0)
R = g("R", 1024); s = R / 720.0 * fs
rng = np.random.default_rng(7)
lum = np.asarray(Image.open(g("photo", "/Users/hunterthompson/Developer/kinetic/kineticstudio/public/images/hunter.jpg")).convert("L").resize((R, R), Image.BICUBIC)).astype(np.float64) / 255
d0 = np.load(f"{work}/disp.npy")
d = np.asarray(Image.fromarray(d0.astype(np.float32), "F").resize((R, R), Image.BILINEAR)).astype(np.float64)
yy, xx = np.mgrid[0:R, 0:R].astype(np.float64)
xx -= ox * s; yy -= oy * s
G = lambda a, sig: nd.gaussian_filter(a, sig * s)
def ell(cx, cy, rx, ry, soft=1.5):
    r = np.sqrt(((xx - cx * s) / (rx * s)) ** 2 + ((yy - cy * s) / (ry * s)) ** 2)
    return np.clip((1 - r) * (rx * s) / (soft * s) + 0.5, 0, 1), r
def feather(m, sig): return np.clip(G(m.astype(np.float64), sig), 0, 1)

# --- the figure: everything nearer than the backdrop
fg = d > g("thr", 2.0)
lab, n = nd.label(fg); fg = lab == 1 + np.argmax(nd.sum(fg, lab, range(1, n + 1)))
fg = nd.binary_fill_holes(nd.binary_opening(fg, iterations=2))
fgs = feather(fg, 1.2)
dist = nd.distance_transform_edt(fg) / s  # in headshot pixels

# --- regions (headshot coordinates, 720 frame)
L = G(lum, 1.2)
eyes = [(311, 254), (406, 255)]
face_in, _ = ell(358, 292, 100, 138, 6)
eyeM = G(np.maximum(*(ell(cx, cy, 24, 13, 3)[0] for cx, cy in eyes)), 3)
browM = np.maximum(ell(305, 231, 38, 12, 4)[0], ell(414, 232, 38, 12, 4)[0]) * (L < 0.35)
hair = fg & (L < g("hairT", 0.42)) & (yy < 262 * s) & (face_in < 0.5)
hair = nd.binary_opening(hair, iterations=2); hair = nd.binary_closing(hair, iterations=3)
# the beard: under a line from each ear down to the corners of the mouth (the shadow by his nose is skin),
# over the jaw (the shadow under it is his neck)
adx = np.abs(xx / s - 359)
ytop = np.where(adx < 41, 336, 345 - (adx - 41) * (50 / 68))
jaw = ((xx / s - 359) / 118) ** 2 + ((yy / s - 330) / 119) ** 2 < 1
beard = fg & (L < g("beardT", 0.45)) & (yy / s > ytop) & (jaw | (yy / s < 330))
beard = nd.binary_closing(nd.binary_opening(beard, iterations=1), iterations=4)
LX, LY, LRX, LRY = g("lipX", 361), g("lipY", 361), g("lipRx", 30), g("lipRy", 9)  # the mouth
lips, _ = ell(LX, LY, LRX, LRY, 3)
tee = fg & (L < 0.12) & (yy > 470 * s)
hairF, beardF, browF = feather(hair, 2.5), feather(beard, 3) * (1 - lips), feather(browM, 1.5)
skin = fgs * (1 - hairF) * (1 - beardF) * (1 - eyeM) * (1 - feather(tee, 3))

# --- macro: round volumes (the head, the body) inflated from their outlines, the depth's own shape over them
import scipy.sparse as sp, scipy.sparse.linalg as spl
def inflate(mask, q=2):
    """lap h = -1 inside, 0 on the outline, then sqrt: round, upright sides; a disc of radius r comes out ~r high"""
    H0, W0 = mask.shape
    mq = mask[::q, ::q]; idx = -np.ones(mq.shape, int); ids = np.argwhere(mq); idx[mq] = np.arange(len(ids))
    rows, cols, vals = [], [], []
    for i, (y, x) in enumerate(ids):
        rows.append(i); cols.append(i); vals.append(4.0)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            y2, x2 = y + dy, x + dx
            if 0 <= y2 < mq.shape[0] and 0 <= x2 < mq.shape[1] and idx[y2, x2] >= 0:
                rows.append(i); cols.append(idx[y2, x2]); vals.append(-1.0)
    A = sp.csr_matrix((vals, (rows, cols)), shape=(len(ids), len(ids)))
    h = np.zeros(mq.shape); h[mq] = spl.spsolve(A, np.full(len(ids), float(q * q)))
    h = np.asarray(Image.fromarray(h.astype(np.float32), "F").resize((W0, H0), Image.BILINEAR)).astype(np.float64)
    return np.sqrt(np.maximum(h, 0)) * 2 * mask
headM = fg & (yy / s < 472) & (np.abs(xx / s - 360) < 150)
headM = nd.binary_opening(headM, iterations=3)
domeH = G(inflate(headM), 1.5) / s  # in headshot pixels
# the body runs on past the frame's bottom and sides: pad it there, so the frame is not its edge
pad = int(200 * s)
fgp = np.pad(fg, ((0, pad), (pad, pad)), mode="edge")
domeB = G(inflate(fgp, 4)[:R, pad:pad + R], 3) / s
def smax(a, b, k):
    return k * np.logaddexp(a / k, b / k)
vol = smax(g("aHead", 0.55) * domeH, g("aBody", 0.22) * domeB, g("blendK", 6)) * (fg > 0)
dbg = np.median(d[~fg])
D = np.where(fg, d - dbg, 0)
def mblur(a, sig):
    w = G(fgs, sig); return G(a * fgs, sig) / np.maximum(w, 1e-3)
mid = D - mblur(D, 24)
macro = g("kVol", 1.0) * vol * s + g("kMid", 42) * mid * np.clip(dist / 10, 0, 1)
# the bust sinks into the slab toward the bottom, so his head is the highest thing
macro -= g("recede", 0.16) * np.clip(yy / s - 430, 0, None)
# or the depth model's own nearness, whole (portraits.py: crossed arms come forward of the chest), eased in
# from the outline so the figure does not stand on a cliff
macro += g("kDepth", 0) * D * s * np.sqrt(np.clip(dist / 30, 0, 1))
# the photo's shading at a middle scale: where the light falls is where the form turns toward it
form = (G(lum, 3) - G(lum, 22)) * (skin + 0.6 * eyeM * fgs)
macro += g("kForm", 26) * form
# hair and beard stand a little proud of the skin
macro += g("hairUp", 5) * hairF * np.sqrt(np.clip(dist / 14, 0, 1)) + g("beardUp", 3.5) * beardF + g("browUp", 2.5) * browF
# the eyes filled: an eyeball under lids, no hollow sockets
for cx, cy in eyes:
    m, r = ell(cx, cy, 23, 13, 2)
    macro += g("eyeBall", 6) * np.exp(-2.2 * r * r)
# the lips, a little full
m, r = ell(LX, LY, LRX + 1, LRY + 2, 2); macro += g("lipUp", 2.5) * np.exp(-2.0 * r * r)
# a smile's cheeks (smile.py's photo): round and raised over the corners of the mouth
for cx in (304, 425):
    m, r = ell(cx, 322, 30, 24, 2); macro += g("cheeks", 0) * 4.0 * np.exp(-1.6 * r * r) * skin
macro = np.where(fg, np.maximum(macro, 0), 0) * fgs
macro = G(macro, 0.6)

# --- carve: the fine lines, crisp
cv = (G(lum, 0.7) - G(lum, 4.5)) * (skin + g("eyeCarve", 0.7) * eyeM + 0.6 * fgs * (1 - hairF) * (1 - beardF) * (yy > 470 * s))
cv = np.sign(cv) * np.maximum(np.abs(cv) - g("carveFloor", 0.012), 0)  # the photo's grain and noise are not lines
neck = np.clip((yy / s - 445) / 20, 0, 1) * np.clip((560 - yy / s) / 30, 0, 1) * (np.abs(xx / s - 360) < 95)
cv = np.tanh(cv * g("carveGain", 11)) * g("carveDepth", 2.2) * (1 - 0.75 * neck)
# the lids: the eye's opening a step behind its lids, a crease over the upper lid, the iris cut round, the pupil drilled
for cx, cy in eyes:
    op, r = ell(cx, cy, 19.5, 7.5, 1.0)
    cv += g("eyeOpen", 0.0) * op
    crease = np.exp(-((r - 1.35) / 0.12) ** 2) * (yy < cy * s) * (np.abs(xx - cx * s) < 22 * s)
    cv += g("eyeCrease", 0.0) * crease
    ir = np.sqrt((xx - cx * s) ** 2 + (yy - (cy + 0.5) * s) ** 2) / s
    cv += (g("iris", -0.35) * np.exp(-((ir - 7.0) / 0.9) ** 2) + g("pupil", -0.8) * np.exp(-(ir / 2.2) ** 2)) * op
# --- the hair's flow: the structure tensor of the photo, its axis turned along the strands
Ix, Iy = nd.sobel(G(lum, 1.0), 1), nd.sobel(G(lum, 1.0), 0)
Jxx, Jxy, Jyy = G(Ix * Ix, 6), G(Ix * Iy, 6), G(Iy * Iy, 6)
th = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2  # along the strands
tr = Jxx + Jyy; det = Jxx * Jyy - Jxy ** 2
disc = np.sqrt(np.maximum(tr * tr / 4 - det, 0)); coh = (disc / np.maximum(tr / 2, 1e-9)) ** 2
# default flow where the photo says little: hair combed up and back from the face, beard down
ax, ay = xx - 360 * s, yy - 330 * s
dflt = np.where(yy < 265 * s, np.arctan2(ay, ax) + np.pi / 2 * 0.0, np.pi / 2)
cw = coh * (tr / (tr.mean() + 1e-9)).clip(0, 3)
c2 = G(np.cos(2 * th) * cw, 9) + 0.15 * np.cos(2 * dflt); s2 = G(np.sin(2 * th) * cw, 9) + 0.15 * np.sin(2 * dflt)
TH = 0.5 * np.arctan2(s2, c2)
VX, VY = np.cos(TH), np.sin(TH)
def lic(noise, length, region, step=1.0):
    pts = np.argwhere(region); y0 = pts[:, 0].astype(float); x0 = pts[:, 1].astype(float)
    acc = nd.map_coordinates(noise, [y0, x0], order=1); wsum = np.ones_like(acc)
    for sign in (1, -1):
        y, x = y0.copy(), x0.copy()
        px = nd.map_coordinates(VX, [y, x], order=1) * sign; py = nd.map_coordinates(VY, [y, x], order=1) * sign
        for k in range(int(length)):
            vx = nd.map_coordinates(VX, [y, x], order=1); vy = nd.map_coordinates(VY, [y, x], order=1)
            flip = np.sign(vx * px + vy * py); flip[flip == 0] = 1
            vx, vy = vx * flip, vy * flip; px, py = vx, vy
            x += vx * step; y += vy * step
            w = np.exp(-(k / length) ** 2 * 2)
            acc += nd.map_coordinates(noise, [y, x], order=1) * w; wsum += w
    out = np.zeros((R, R)); out[region] = acc / wsum
    return out
def norm(a, m):
    v = a[m > 0.5]; return (a - v.mean()) / (v.std() + 1e-9) * (m > 0.02)
hairReg = (hairF > 0.02) | (browF > 0.02)
fine = lic(G(rng.standard_normal((R, R)), 0.45), 22 * s, hairReg)
strands = norm(fine, np.maximum(hairF, browF)) * np.maximum(hairF, browF)
coarse = lic(G(rng.standard_normal((R, R)), 3.2), 46 * s, hairF > 0.02)
locks = np.tanh(norm(coarse, hairF) * g("lockContrast", 1.9)) * hairF
# --- stubble: short strands down the beard's flow, and stippled pits, denser where the beard is dark
breg = beardF > 0.02
bs = norm(lic(G(rng.standard_normal((R, R)), 0.5), g("beardLen", 5) * s, breg), beardF) * beardF
dens = np.clip((0.5 - L) * 2.2, 0, 1) * beardF
pits = (rng.random((R, R)) < dens * g("pitDensity", 0.2)).astype(float)
pits = -G(pits, 0.5) * (2 * np.pi * (0.5 * s) ** 2)
stubble = g("beardStr", 0.45) * bs + g("pitDepth", 1.1) * pits * beardF
np.savez_compressed(f"{outdir}/relief.npz", macro=macro, carve=cv, strands=strands, locks=locks, stubble=stubble, hair=hairF, beard=beardF, fg=fgs)
print("macro max", macro.max(), "carve", cv.min(), cv.max(), "strands std", strands[hairF > 0.5].std(), "hair px", int(hair.sum()), "beard px", int(beard.sum()))

# --- the asset: one RGB PNG, R x 2R: on top the macro in 16 bits (R hi, G lo, of MACRO px) and the carve
# (B, signed, of CARVE px); under it strands (R), locks (G) and stubble (B), signed, of their own ranges
MACRO, CARVE, STR, LOCK, STUB = 256.0, 4.0, 3.5, 2.0, 3.0
mc = np.round(np.clip(macro / MACRO, 0, 1) * 65535).astype(np.uint32)
sg = lambda a, m: np.round(np.clip(128 + a / m * 127, 0, 255)).astype(np.uint8)
top = np.dstack([(mc >> 8).astype(np.uint8), (mc & 255).astype(np.uint8), sg(cv, CARVE)])
bot = np.dstack([sg(strands, STR), sg(locks, LOCK), sg(stubble, STUB)])
Image.fromarray(np.vstack([top, bot]), "RGB").save(f"{outdir}/hunter-relief.png", optimize=True)
