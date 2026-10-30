# Hunter's scanned head (the membrane's Scan subject)

Hunter, Oct 25: "Can you make a high-definition model of me based on this and then use this for the
membrane?" From `IMG_0503.MOV`, a 19 s 4K HDR selfie sweep round his head (front, both profiles, the
back, the top) on an iPhone 17 Pro Max. The scan itself (textured USDZ, OBJ with its maps, its frame) is
in iCloud `💻 Kinetic/kinetic/membrane-scan`; `public/images/hunter-scan.png` is what the membrane loads.

1. `swiftc -O scan_extract.swift -o extract; ./extract IMG_0503.MOV frames 15`
   frames through AVFoundation (it tone-maps the HLG video to SDR; ffmpeg here can't), upright, full size.
2. `python3 -I scan_sharp.py frames sel`: the sharper of each pair, the blurriest tenth dropped (127 of 283).
   All 254 sharp frames made a softer head (his head moves a little over the sweep), so not those.
3. `swiftc -O scan_capture.swift -o capture; ./capture sel out full`: Apple's Object Capture
   (RealityKit PhotogrammetrySession, sequential, high feature sensitivity, automatic masking), about two
   minutes on the M4 Max: a 100k-face mesh with 4k texture, normal and displacement maps. Raw detail is only
   163k faces, and the displacement is pore-scale, under what the membrane resolves.
4. `swiftc -O scan_landmarks.swift -o landmarks`, then in Blender
   `Blender -b --factory-startup -P scan_frame.py -- out/obj-full/<mesh>.obj OUT ./landmarks "-0.13,-0.07,0.88" "0,-1,0"`:
   his pupils and mouth found by Vision in straight-on renders, cast onto the scan, three passes.
5. `Blender -b --factory-startup -P scan_bake.py -- <mesh>.obj radii.npz "$(cat scan-params.json)"` then
   `python3 -I scan_png.py radii.npz ../../public/images/hunter-scan.png`, then `node scripts/sync-membrane-prototype.mjs`.

`scan-params.json` is the frame from step 4 with: scale × 0.84 (the stand-in's size, not the headshot's
eye spacing), pitch 14° (his eyes-to-mouth line leans back; this stands the head upright), lift 0.10 (sits
him lower in the frame), jaw −0.143 and cut −0.227 (his chin and the tops of his shoulders, seen in profile),
reach 0.478 (nothing farther from the middle is his head). `scan_png.py` takes spikes off, takes the tufts
off his scalp, closes the pits of the eyes most of the way and softens the face a little.

What limits it is the capture: a handheld selfie at arm's length, the head moving slightly, skin with
little texture. A sharper face wants him still while someone else walks round him slowly with the main
camera (or an iPhone app that scans with the front TrueDepth camera), in soft even light.
