# Usage: python3 -I portraits.py WORK [id ...]   (writes public/images/hunter-relief-<id>.png for each portrait;
# then node scripts/sync-membrane-prototype.mjs)
# Hunter's other photos as reliefs for the membrane (Hunter, Oct 25: "Let's try this for the membrane. as an option
# in params"). Each photo in photos/ is framed square round his face, so relief.py's regions (set in the
# headshot's frame) land on it: his pupils, measured in the photo, go where the headshot's are, scaled by fs
# (a close-up larger, arms crossed smaller) with the midpoint between them at mid (in the 720 frame). The edges a
# framing runs past are filled from the photo's plain backdrop. Then the depth model (depth.py, averaging 518 and
# 742 as head.py does) and relief.py with the frame's fs, ox, oy and the portrait's own overrides.
import sys, json, subprocess, shutil, numpy as np
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
WEIGHTS = next((Path.home() / ".cache/huggingface/hub/models--depth-anything--Depth-Anything-V2-Small-hf/snapshots").iterdir())
EYES = ((311, 254), (406, 255))  # the headshot's pupils, in its 720 frame
HX, HY = (EYES[0][0] + EYES[1][0]) / 2, (EYES[0][1] + EYES[1][1]) / 2

PORTRAITS = {
    # the full smile, framed as the headshot is (head to chest)
    # (the open mouth, measured in each frame, in the headshot's frame: the lips' region there, and no fullness
    # added over the teeth)
    "smile": {"photo": "smile.webp", "eyes": ((496, 439), (644, 431)), "fs": 1.0, "mid": (HX, HY),
              "relief": {"lipX": 362, "lipY": 349, "lipRx": 58, "lipRy": 12, "lipUp": 0}},
    # the pink close-up: the face larger, the jacket's collar at the foot
    "close-up": {"photo": "close-up.webp", "eyes": ((632, 747), (930, 732)), "fs": 1.4, "mid": (345, 300),
                 "relief": {"lipX": 360, "lipY": 351, "lipRx": 58, "lipRy": 12, "lipUp": 0, "recede": 0.04}},
    # arms crossed: the face smaller, the arms across the bottom
    "arms-crossed": {"photo": "arms-crossed.webp", "eyes": ((623, 344), (764, 344)), "fs": 0.652, "mid": (360, 138),
                     "relief": {"lipX": 352, "lipY": 354, "lipRx": 52, "lipRy": 9, "recede": 0, "kDepth": 12}},
}

work = Path(sys.argv[1]); work.mkdir(parents=True, exist_ok=True)
only = sys.argv[2:] or list(PORTRAITS)
R = 1024
for pid in only:
    P = PORTRAITS[pid]
    im = np.asarray(Image.open(HERE / "photos" / P["photo"]).convert("RGB")).astype(np.float64)
    (x1, y1), (x2, y2) = P["eyes"]
    fs, (mx, my) = P["fs"], P["mid"]
    k = (EYES[1][0] - EYES[0][0]) * fs / (x2 - x1)  # frame (720) px per photo px
    side = 720 / k
    x0, y0 = (x1 + x2) / 2 - mx / k, (y1 + y2) / 2 - my / k
    # the frame, sampled from the photo with its edges carried out past the border
    pad = int(side)
    big = np.pad(im, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    crop = Image.fromarray(big.astype(np.uint8)).crop((int(round(x0 + pad)), int(round(y0 + pad)), int(round(x0 + pad + side)), int(round(y0 + pad + side))))
    d = work / pid; d.mkdir(exist_ok=True)
    frame = d / "frame.png"
    crop.resize((R, R), Image.LANCZOS).save(frame)
    # where the headshot's frame sits in this one
    ox, oy = mx / fs - HX, my / fs - HY
    subprocess.run([sys.executable, "-I", str(HERE / "depth.py"), str(WEIGHTS), str(frame), str(d / "disp")], check=True, capture_output=True)
    np.save(d / "disp.npy", (np.load(d / "disp_518.npy") + np.load(d / "disp_742.npy")) / 2)
    over = {"photo": str(frame), "fs": fs, "ox": ox, "oy": oy, **P["relief"]}
    out = subprocess.run([sys.executable, "-I", str(HERE / "relief.py"), str(d), str(d), json.dumps(over)], check=True, capture_output=True, text=True)
    shutil.copy(d / "hunter-relief.png", SITE / "public/images" / f"hunter-relief-{pid}.png")
    print(pid, f"side {side:.0f}px at ({x0:.0f}, {y0:.0f}), fs {fs}, ox {ox:.1f}, oy {oy:.1f};", out.stdout.strip().splitlines()[-1])
