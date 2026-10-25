import sys, numpy as np, torch
from PIL import Image
from transformers import DepthAnythingForDepthEstimation
W, img_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
model = DepthAnythingForDepthEstimation.from_pretrained(W).eval()
im = Image.open(img_path).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
res = []
for S in (518, 742, 1022):
    x = torch.from_numpy(((a - mean) / std).transpose(2, 0, 1))[None]
    x = torch.nn.functional.interpolate(x, size=(S, S), mode="bicubic", align_corners=False)
    with torch.no_grad():
        d = model(pixel_values=x).predicted_depth  # (1,S,S) relative inverse depth
    d = torch.nn.functional.interpolate(d[None], size=a.shape[:2], mode="bicubic", align_corners=False)[0, 0].numpy()
    np.save(f"{out}_{S}.npy", d)
    print(S, d.min(), d.max())
