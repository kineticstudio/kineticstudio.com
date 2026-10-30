# Blender: /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scan_bake.py -- MESH.obj OUT.png '{json}'
# Hunter's scanned head (Hunter, Oct 25: "make a high-definition model of me based on this and then use this
# for the membrane"; scan.md has the capture) as the membrane's head map (src/scripts/hunter-membrane.js
# loadHead): for each direction round the middle of his head, how far out his surface is. Exact ray casts
# against the scan (a BVH), from outside in, the first surface met; under the jaw the neck is cut flat
# where the stand-in's is (CUT), so below that the cap is the surface. Two maps, the scan as it is over
# a softened one (the "plain" head the detail dial blends from), each W x (H + 1), radii in 16 bits of RMAX.
#
# json: scan_frame.py's frame.json (center, right, up, front: the head's middle and its axes in the scan's own
# frame, x to his left as you face him, y up, z out of his face; scale, scan units to sheet heights), plus
# pitch (degrees), W, H, plain (the softened head's blur, in samples)
import sys, json, math
import bpy, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
mesh_path, out_path = argv[0], argv[1]
P = json.loads(argv[2]) if len(argv) > 2 else {}
W, H = P.get("W", 768), P.get("H", 384)
RMAX = 0.8
# where the stand-in's neck is cut (sheet heights below the middle of the head)
CUT = P.get("cut", (0.5 - 520 / 720) - (0.5 - 262 / 720)) - P.get("lift", 0.0)
C = Vector(P["center"]); X = Vector(P["right"]).normalized(); Y = Vector(P["up"]).normalized(); Z = Vector(P["front"]).normalized()
S = P["scale"]
# his eyes-to-mouth line leans back on a real face: the frame pitched up this much (degrees) stands his head upright
t = math.radians(P.get("pitch", 14))
Y, Z = (Y * math.cos(t) + Z * math.sin(t)).normalized(), (Z * math.cos(t) - Y * math.sin(t)).normalized()
# measured from a point this much higher in his head (sheet heights), so in the membrane, round the same pivot,
# he sits that much lower in the frame (he turns about the vertical, so where up it is changes nothing else)
LIFT = P.get("lift", 0.0)
C = C + Y * (LIFT / S)

bpy.ops.wm.read_factory_settings(use_empty=True)
if mesh_path.endswith(".obj"):
    bpy.ops.wm.obj_import(filepath=mesh_path)
else:
    bpy.ops.wm.usd_import(filepath=mesh_path)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
dg = bpy.context.evaluated_depsgraph_get()
verts, polys = [], []
for o in objs:
    m = o.evaluated_get(dg).to_mesh()
    base = len(verts)
    verts += [o.matrix_world @ v.co for v in m.vertices]
    polys += [[base + i for i in p.vertices] for p in m.polygons]
bvh = BVHTree.FromPolygons(verts, polys)
print("scan:", len(verts), "vertices,", len(polys), "faces")

def inside(p):
    loc, nor, _, _ = bvh.find_nearest(p)
    return loc is not None and (p - loc).dot(nor) < 0

# his neck, below the jaw: a column (the scan's own neck, from a slice through it at mid height) so the
# rays under his jaw stop at his neck, not his shoulders and back; outside it, below JAW, nothing counts
JAW = P.get("jaw", -0.15) - LIFT
V = np.array([[(v - C).dot(X), (v - C).dot(Y), (v - C).dot(Z)] for v in verts]) * S  # sheet units, head frame
ys = (JAW + CUT) / 2
sl = V[np.abs(V[:, 1] - ys) < 0.01]
sl = sl[np.hypot(sl[:, 0], sl[:, 2]) < 0.2]
NX, NZ = float(np.median(sl[:, 0])), float(np.median(sl[:, 2]))
NR = float(np.percentile(np.hypot(sl[:, 0] - NX, sl[:, 2] - NZ), 95)) * P.get("neckPad", 1.08)
print(f"neck at x {NX:+.3f} z {NZ:+.3f}, radius {NR:.3f} (sheet heights)")

def entry(d):
    """how far out (sheet heights) the ray from the middle along d stays where he can be: above the jaw,
    or inside the neck's column and above the cut"""
    out = 0.9
    t_half = JAW / d[1] if d[1] < -1e-6 else out
    # the column: |(r d_x, r d_z) - (NX, NZ)| < NR, from the middle (inside it) outward
    a = d[0] ** 2 + d[2] ** 2
    if a < 1e-9:
        t_col = out
    else:
        b2 = -(d[0] * NX + d[2] * NZ); c = NX ** 2 + NZ ** 2 - NR ** 2
        disc = b2 * b2 - a * c
        t_col = (-b2 + math.sqrt(disc)) / a if disc > 0 else 0.0
    t_cut = CUT / d[1] if d[1] < -1e-6 else out
    # and never farther than a head can be from its middle (his raised shoulder, stray bits of the room)
    return min(P.get("reach", 0.45), max(min(t_col, t_cut), t_half))

r = np.zeros((H + 1, W), np.float32)
miss = 0
for j in range(H + 1):
    ph = j / H * math.pi  # 0 = straight up
    for i in range(W):
        th = (i + 0.5) / W * 2 * math.pi  # round the vertical axis, 0 = facing the viewer
        d = (math.sin(ph) * math.sin(th), math.cos(ph), math.sin(ph) * math.cos(th))
        dw = (X * d[0] + Y * d[1] + Z * d[2]).normalized()
        e = entry(d)
        start = e / S
        if inside(C + dw * start):  # inside him where the ray comes in: the cut is the surface
            r[j, i] = e
            continue
        hit = bvh.ray_cast(C + dw * start, -dw, start)
        if hit[0] is None:
            r[j, i] = 0.02
            miss += 1
        else:
            r[j, i] = (hit[0] - C).length * S
print("rays without a hit:", miss, "r range", float(r.min()), float(r.max()))

# the plain head: the same, softened on the sphere (wrapped round, harder toward the poles)
def soften(a, s):
    from math import exp
    k = int(3 * s) + 1
    w = np.array([exp(-(x / s) ** 2 / 2) for x in range(-k, k + 1)], np.float32); w /= w.sum()
    b = np.concatenate([a[:, -k:], a, a[:, :k]], 1)
    b = np.stack([np.convolve(row, w, "same") for row in b])[:, k:-k]
    b = np.pad(b, ((k, k), (0, 0)), mode="edge")
    b = np.stack([np.convolve(col, w, "same") for col in b.T]).T[k:-k]
    return b
plain = soften(r, P.get("plain", 10))
for j in range(H + 1):
    s = math.sin(j / H * math.pi)
    if s < 0.3:
        plain[j] = soften(plain[j:j + 1], 1.2 / max(s, 0.02) * 2)[0]
r[0] = r[0].mean(); r[-1] = r[-1].mean(); plain[0] = plain[0].mean(); plain[-1] = plain[-1].mean()

# the radii; scan_png.py packs them into the head map (Blender's own PNG writer would colour-manage them)
np.savez(out_path, full=r, plain=plain)
print("wrote", out_path, W, "x", 2 * (H + 1))
