# Blender: Blender -b --factory-startup -P scan_frame.py -- MESH.obj OUTDIR LANDMARKS_BIN 'cx,cy,cz' 'fx,fy,fz'
# Finds the frame of Hunter's head in the scan (scan.md): straight-on views of the scan in its own texture, his
# pupils and mouth found in them by Apple's Vision (LANDMARKS_BIN, scan_landmarks.swift), cast back onto the
# scan; x from his right pupil to his left (the viewer's right), y from his mouth up to his eyes, z out of his
# face; twice, each view square to the last frame. The middle of his head is halfway between the bridge of his
# nose and the back of his skull, a little under his eyes, as the stand-in's is; the scale puts his pupils as
# far apart as the headshot's (95 px of 720 sheet pixels). Writes OUTDIR/frame.json for scan_bake.py, and
# OUTDIR/check-front.png, check-side.png squared to the frame.
import sys, json, math, subprocess, bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
mesh, outdir, lmbin = argv[0], argv[1], argv[2]
C = Vector([float(x) for x in argv[3].split(",")]); F = Vector([float(x) for x in argv[4].split(",")]).normalized()
U = Vector((0, 0, 1))
U = (U - F * U.dot(F)).normalized()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=mesh) if mesh.endswith(".obj") else bpy.ops.wm.usd_import(filepath=mesh)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
dg = bpy.context.evaluated_depsgraph_get()
verts, polys = [], []
for o in objs:
    m = o.evaluated_get(dg).to_mesh(); b = len(verts)
    verts += [o.matrix_world @ v.co for v in m.vertices]; polys += [[b + i for i in p.vertices] for p in m.polygons]
bvh = BVHTree.FromPolygons(verts, polys)

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = sc.render.resolution_y = 1000
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"
PX = 1000

def view(c, f, u, span, path, textured=True):
    r = u.cross(f).normalized()  # image right = the viewer's right as he faces the camera
    cam.location = c + f * 3 * span
    cam.data.ortho_scale = span
    cam.data.clip_end = 10 * span
    cam.rotation_euler = Matrix((r, u, f)).transposed().to_euler()
    sh = sc.display.shading
    sh.light = "FLAT" if textured else "STUDIO"
    sh.color_type = "TEXTURE" if textured else "SINGLE"
    sh.single_color = (0.8, 0.8, 0.8)
    sc.view_settings.exposure = 1.2 if textured else 0
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return r

def onto(c, f, u, r, span, uv):
    """the scan's surface under an image point of the view (c, f, u)"""
    p = c + r * ((uv[0] - PX / 2) / PX * span) + u * ((PX / 2 - uv[1]) / PX * span) + f * 3 * span
    hit = bvh.ray_cast(p, -f, 10 * span)
    return hit[0]

mean = lambda pts: [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]
span = 0.55
for it in range(3):
    path = f"{outdir}/frame-{it}.png"
    r = view(C, F, U, span, path)
    L = json.loads(subprocess.run([lmbin, path], capture_output=True, text=True, check=True).stdout)
    if not L:
        raise SystemExit(f"no face found in {path}")
    face = max(L, key=lambda d: d["box"][2])
    pa, pb = mean(face["leftPupil"]), mean(face["rightPupil"])
    left_img, right_img = (pa, pb) if pa[0] < pb[0] else (pb, pa)
    mouth = mean(face["outerLips"])
    A, B, Mo = (onto(C, F, U, r, span, q) for q in (left_img, right_img, mouth))
    if None in (A, B, Mo):
        raise SystemExit("a landmark missed the scan")
    X = (B - A).normalized()  # the viewer's right
    E = (A + B) / 2
    Y = E - Mo; Y = (Y - X * Y.dot(X)).normalized()
    Z = X.cross(Y).normalized()
    # the middle: halfway from the bridge of his nose to the back of his skull, through the eyes' midpoint
    front = bvh.ray_cast(E + Z * 0.3, -Z, 1.0)[0]
    p, back = E - Z * 0.01, None
    for _ in range(20):
        h = bvh.ray_cast(p, -Z, 0.6)
        if h[0] is None: break
        back = h[0]; p = h[0] - Z * 0.002
    eyes = (B - A).length
    C = (front + back) / 2 - Y * eyes * (8 / 95)
    F, U = Z, Y
    print(f"pass {it}: yaw {face.get('yaw')}, roll {face.get('roll')}, pitch {face.get('pitch')}; pupils {eyes:.4f} apart; head depth {(front - back).length:.4f}")
    span = eyes * 4.2

S = (95 / 720) / eyes
frame = {"center": list(C), "right": list(X), "up": list(Y), "front": list(Z), "scale": S, "eyes": eyes,
         "pupils": [list(A), list(B)], "mouth": list(Mo)}
json.dump(frame, open(f"{outdir}/frame.json", "w"), indent=1)
view(C, Z, Y, eyes * 5.5, f"{outdir}/check-front.png", textured=False)
view(C, X, Y, eyes * 5.5, f"{outdir}/check-side.png", textured=False)
print("frame", json.dumps({k: [round(v, 4) for v in frame[k]] if isinstance(frame[k], list) and not isinstance(frame[k][0], list) else frame[k] for k in ("center", "right", "up", "front", "scale")}))
