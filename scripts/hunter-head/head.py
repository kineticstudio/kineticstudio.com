# Hunter's head for the About membrane (src/scripts/hunter-membrane.js), made from public/images/hunter.jpg.
# Run with system python3 (torch, transformers, scipy, Pillow); WORK is any scratch folder.
# 
# 1. depth.py WEIGHTS hunter.jpg WORK/disp      Depth Anything V2 Small (depth-anything/Depth-Anything-V2-Small-hf,
#                                               config.json + preprocessor_config.json + model.safetensors fetched with curl)
#                                               at 518, 742 and 1022; then average disp_518 and disp_742 into WORK/disp.npy
# 2. head.py WORK '{"earTop":150,"earBot":430,"round":12,"cheek":14}'
#                                               silhouette from the depth (the backdrop is plain), ears cut, the neck a column;
#                                               the dome by inflating the silhouette (Poisson, then sqrt) plus the face's
#                                               detail from the depth; front.npy, back.npy, previews
# 3. radial.py WORK public/images/hunter-head.png 384 192 1.6 4
#                                               the closed head as a radius per direction round the middle of the head
# 4. matcap.py public/images/matcaps/silver-room.jpg silver   (and steel): the light studio matcaps

# disparity (Depth Anything V2) + the photo's silhouette -> a closed head: front and back height fields
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
work = sys.argv[1]; P = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
g = lambda k, v: P.get(k, v)
d = np.load(f"{work}/disp.npy"); H, W = d.shape
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
CHIN = g("chin", 452); CX = g("cx", 362)
head = (d > g("thr", 2.3)) & (yy < CHIN + 10)
head = nd.binary_opening(head, iterations=3)
lab, n = nd.label(head); sizes = nd.sum(head, lab, range(1, n + 1)); head = lab == (1 + np.argmax(sizes))
head = nd.binary_fill_holes(head)
# no ears: across the ear band the sides run straight from temple to jaw, so the side of his head is one clean surface
t0, t1 = g("earTop", 200), g("earBot", 400)
def sides(y):
    xs = np.where(head[y])[0]; return xs.min(), xs.max()
(l0, r0), (l1, r1) = sides(t0), sides(t1)
for y in range(t0, t1):
    u = (y - t0) / (t1 - t0); bulge = g("cheek", 10) * np.sin(np.pi * u)
    head[y, :] &= (xx[y] >= l0 + (l1 - l0) * u - bulge) & (xx[y] <= r0 + (r1 - r0) * u + bulge)
# the neck: a soft column under the jaw, running out of the bottom
nh = g("neck", 80)
neck = (np.abs(xx - CX) < nh) & (yy > CHIN - 90)
m = (head | neck).astype(np.float32)
m = nd.gaussian_filter(m, g("round", 7)) > 0.5
s = nd.distance_transform_edt(m)
# the dome: inflate the silhouette (solve lap h = -1 inside, 0 on the edge), then sqrt for round, upright sides
import scipy.sparse as sp, scipy.sparse.linalg as spl
PAD = 240  # the neck runs on past the bottom, so the bottom edge is not an edge
mp = np.vstack([m, np.repeat(m[-1:], PAD, 0)])
q = 2  # solve at half resolution
mq = mp[::q, ::q]; idx = -np.ones(mq.shape, int); ids = np.argwhere(mq); idx[mq] = np.arange(len(ids))
rows, cols, vals = [], [], []
for (y, x), i in zip(ids, range(len(ids))):
    rows.append(i); cols.append(i); vals.append(4.0)
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        yy2, xx2 = y+dy, x+dx
        if 0 <= yy2 < mq.shape[0] and 0 <= xx2 < mq.shape[1] and idx[yy2, xx2] >= 0:
            rows.append(i); cols.append(idx[yy2, xx2]); vals.append(-1.0)
A = sp.csr_matrix((vals, (rows, cols)), shape=(len(ids), len(ids)))
h = np.zeros(mq.shape); h[mq] = spl.spsolve(A, np.full(len(ids), float(q*q)))
h = nd.zoom(h, q, order=1)[:mp.shape[0], :mp.shape[1]][:H]
h = np.where(m, h, 0)
dome = np.sqrt(np.maximum(h, 0)) * 2.0  # a disc of radius R comes out ~R high
R = np.full_like(dome, 1.0)
nk = np.clip((yy - CHIN) / 60, 0, 1); dome = dome * (1 - g("neckflat", 0.3) * nk)
# DA detail and mid scale, normalised inside the mask
def blur(a, sig):
    w = nd.gaussian_filter(m.astype(np.float32), sig); return nd.gaussian_filter(np.where(m, a, 0), sig) / np.maximum(w, 1e-3)
b8 = blur(d, 8); b20 = blur(d, 20); b60 = blur(d, 60)
fine = d - b8; mid = b8 - b20; big = b20 - b60
edge = np.clip((s - 4) / 22, 0, 1); edge = edge * edge * (3 - 2 * edge)
face = np.clip((CHIN + 25 - yy) / 40, 0, 1)
hair = np.clip((yy - 115) / 45, 0, 1)  # features fade out under the chin
K = g("k", 140)
relief = K * (g("wf", 1.0) * fine * hair + g("wm", 0.9) * mid + g("wb", 0.8) * big) * edge * face
front = g("af", 1.0) * dome + relief
back = g("ab", 0.85) * dome
front = np.where(m, np.maximum(front, 0), 0); back = np.where(m, back, 0)
np.save(f"{work}/front.npy", front.astype(np.float32)); np.save(f"{work}/back.npy", back.astype(np.float32)); np.save(f"{work}/mask.npy", m)
print("front max", front.max(), "back max", back.max(), "dome head", dome[250, CX], "dome neck", dome[650, CX])
# previews: lit front, and the profile silhouette (max over x of the front height, per row)
gy, gx = np.gradient(nd.gaussian_filter(front, 1.0))
nrm = np.dstack([-gx, -gy, np.ones_like(gx)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
L = np.array([-0.5, -0.6, 0.62]); L /= np.linalg.norm(L)
lit = np.clip((nrm @ L), 0, 1) * m
Image.fromarray((lit * 255).astype(np.uint8)).save(f"{work}/front_lit.png")
prof = np.zeros((H, 520), np.uint8)
for y in range(H):
    if m[y].any():
        zf = front[y].max(); zb = back[y].max()
        prof[y, int(260 - zb):int(260 + zf)] = 200
Image.fromarray(prof).save(f"{work}/profile.png")
