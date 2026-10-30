# sharp.py FRAMES OUT: the sharpest frame of each pair (variance of the Laplacian at a quarter size), the blurriest tenth dropped, linked into OUT
import sys, os, numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage as nd
src, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(exist_ok=True)
fs = sorted(src.glob("f*.jpg"))
score = []
for f in fs:
    g = np.asarray(Image.open(f).convert("L").reduce(4)).astype(np.float32)
    score.append(nd.laplace(g).var())
score = np.array(score)
keep = [i if score[i] >= score[i + 1] else i + 1 for i in range(0, len(fs) - 1, 2)]
floor = np.percentile(score[keep], 10)
keep = [i for i in keep if score[i] >= floor]
for i in keep:
    os.link(fs[i], out / fs[i].name)
print(len(fs), "frames ->", len(keep), "kept; sharpness min/median/max", int(score.min()), int(np.median(score)), int(score.max()))
