#!/usr/bin/env node
/* Cut every loop and still in scripts/media.config.mjs.

     node scripts/build-media.mjs            all of them
     node scripts/build-media.mjs rime dawn  just these

   Writes public/media/<id>.mp4 (none for a still) and public/media/<id>.jpg,
   and rewrites src/data/media.json with each one's size and sampled ground
   colour. Adapted from the swimlanes design's build-media.mjs in the
   Creative Studio, so a loop cut there and here comes out the same: a 4 s
   cut crossfades its last FADE seconds into its first and plays back as an
   endless loop, and `loop: 'bounce'` plays forward then back instead, for
   cuts where type or UI moves through the frame. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA } from "./media.config.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/media");
const JSON_OUT = path.join(ROOT, "src/data/media.json");
const KINETIC = path.join(os.homedir(), "Developer/kinetic");
const SOURCES = {
  twitter: path.join(os.homedir(), "Library/Mobile Documents/com~apple~CloudDocs/💻 Kinetic/twitter"),
  portfolio: path.join(KINETIC, "kinetic-creative-studio/clients/kinetic/designs/01-Personal/portfolio-src/media"),
  mirror: path.join(KINETIC, "kineticstudio-webflow-mirror/assets"),
  capture: path.join(ROOT, "scripts/.captures"),
};

const BOX = [1280, 800];
const FADE = 0.4;
const FPS = 30;
const CRF = 30;
const JOBS = 3;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const hex = (b) => "#" + [...b.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("");

async function probe(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", file]);
  const j = JSON.parse(stdout);
  return { w: j.streams[0].width, h: j.streams[0].height, d: parseFloat(j.format?.duration ?? "0") };
}

function geometry(m, w, h) {
  const c = m.crop ?? [0, 0, 1, 1];
  const cw = even(c[2] * w), ch = even(c[3] * h);
  const s = Math.min(1, BOX[0] / cw, BOX[1] / ch);
  return { crop: `crop=${cw}:${ch}:${Math.round(c[0] * w)}:${Math.round(c[1] * h)}`, ow: even(cw * s), oh: even(ch * s) };
}

async function ground(jpg) {
  const { stdout } = await run("ffmpeg", ["-loglevel", "error", "-i", jpg, "-vf",
    "crop=iw*0.04:ih*0.04:2:2,scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { encoding: "buffer" });
  return hex(stdout);
}

async function build(m) {
  const mp4 = path.join(OUT, `${m.id}.mp4`);
  const jpg = path.join(OUT, `${m.id}.jpg`);

  if (m.from === "portfolio") {
    await fs.copyFile(path.join(SOURCES.portfolio, `${m.file}.mp4`), mp4);
    await fs.copyFile(path.join(SOURCES.portfolio, `${m.file}.jpg`), jpg);
    const meta = await probe(mp4);
    return { w: meta.w, h: meta.h, ground: await ground(jpg), video: true };
  }

  const src = path.join(SOURCES[m.from], m.file);
  const meta = await probe(src);
  const g = geometry(m, meta.w, meta.h);

  if (m.still) {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-frames:v", "1",
      "-vf", `${g.crop},scale=${g.ow}:${g.oh}:flags=lanczos`, "-q:v", "4", jpg]);
    return { w: g.ow, h: g.oh, ground: await ground(jpg), video: false };
  }

  const ss = m.ss ?? 0;
  const dur = Math.min(m.dur ?? 4, meta.d - ss - 0.05);
  const bounce = m.loop === "bounce";
  const prep = `[0:v]${g.crop},scale=${g.ow}:${g.oh}:flags=lanczos,fps=${FPS},format=yuv420p`;
  const graph = bounce
    ? `${prep},split[f][r];[r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[back];[f][back]concat=n=2:v=1:a=0[out]`
    : `${prep},split[a][b];[a]trim=start=${FADE},setpts=PTS-STARTPTS[main];[b]trim=end=${FADE},setpts=PTS-STARTPTS[head];` +
      `[main][head]xfade=transition=fade:duration=${FADE}:offset=${(dur - 2 * FADE).toFixed(3)}[out]`;
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(ss), "-t", dur.toFixed(3), "-i", src,
    "-filter_complex", graph, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", String(CRF), "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);

  const first = bounce ? ss : ss + FADE;
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", first.toFixed(3), "-i", src,
    "-frames:v", "1", "-vf", `${g.crop},scale=${g.ow}:${g.oh}:flags=lanczos`, "-q:v", "4", jpg]);
  return { w: g.ow, h: g.oh, ground: await ground(jpg), video: true };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const todo = only.length ? MEDIA.filter((m) => only.includes(m.id)) : MEDIA;

  let known = {};
  try { known = JSON.parse(await fs.readFile(JSON_OUT, "utf8")); } catch {}

  const queue = [...todo];
  const failed = [];
  await Promise.all(Array.from({ length: JOBS }, async () => {
    for (let m; (m = queue.shift());) {
      try {
        known[m.id] = await build(m);
        const kb = Math.round(((await fs.stat(path.join(OUT, `${m.id}.jpg`))).size +
          (known[m.id].video ? (await fs.stat(path.join(OUT, `${m.id}.mp4`))).size : 0)) / 1024);
        console.log(`${m.id.padEnd(22)} ${String(kb).padStart(5)} KB  ${known[m.id].w}x${known[m.id].h}  ${known[m.id].ground}`);
      } catch (e) {
        failed.push(m.id);
        console.error(`${m.id}: ${e.stderr || e.message}`);
      }
    }
  }));

  const ordered = Object.fromEntries(MEDIA.filter((m) => known[m.id]).map((m) => [m.id, known[m.id]]));
  await fs.writeFile(JSON_OUT, JSON.stringify(ordered, null, 2) + "\n");
  console.log(`\n${Object.keys(ordered).length} pieces` + (failed.length ? `; failed: ${failed.join(", ")}` : ""));
  if (failed.length) process.exitCode = 1;
}

main();
