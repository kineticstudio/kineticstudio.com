#!/usr/bin/env python3
"""Render the site's sound kit from earshot's sound bank: sounds made in code.

    python3 scripts/build-sounds.py --earshot /path/to/earshot

earshot (Leon Lin, MIT, github.com/Leonxlnx/earshot) keeps a bank of sound
effects as code that render by id with no models and no network; only numpy
and scipy are needed for this. Each role below is one bank sound, rendered
to a WAV and encoded to public/sfx/<role>.m4a with ffmpeg. src/scripts/site.js
plays them by role. Change a role's id (or its weight) and re-run to retune.
"""
import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

# role: (bank id, weight). Weight scales the peak 6 dB per halving, so the
# hover tick sits far under the click, which sits under the moments.
KIT = {
    "hover": ("pro_hover_tick/soft", 0.25),
    "click": ("pro_click/soft", 0.6),
    "toggle": ("toggle/micro", 0.55),
    "line": ("pro_tap/soft", 0.45),      # the intro's lines, pitched up one by one in the player
    "glide": ("whoosh_fast/tight", 0.4),  # the pill leaving for another page
    "pull": ("pro_pop_in/deep", 0.7),     # the pill landing home and pulling the lines in
    "open": ("pro_whoosh_big/swell", 0.45),
    "close": ("whoosh_fast/reverse", 0.35),
    "detent": ("pro_hover_tick/detent", 0.3),  # the Playground barrel passing a tile
    "confirm": ("pro_notify/ding_1822", 0.55),
    "key": ("pro_typing_key/soft", 0.3),  # each character typed in a contact field, pitched a little each time
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--earshot", required=True, help="a checkout of github.com/Leonxlnx/earshot")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "sfx"))
    args = ap.parse_args()
    sys.path.insert(0, os.path.abspath(args.earshot))
    from earshot.forge import bank

    os.makedirs(args.out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for role, (sid, weight) in KIT.items():
            y, meta = bank.render(sid, weight=weight, checks=False)
            if y.ndim == 2:
                y = y.mean(axis=1)
            wav = os.path.join(tmp, f"{role}.wav")
            wavfile.write(wav, meta["sr"], (np.clip(y, -1, 1) * 32767).astype(np.int16))
            out = os.path.join(args.out, f"{role}.m4a")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "96k", out], check=True)
            print(f"{role:8} {sid:26} {meta['dur_s']:.2f} s  {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
