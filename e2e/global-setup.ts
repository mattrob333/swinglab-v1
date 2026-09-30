// Builds WebM test clips once per run. Playwright's Chromium has no H.264, so
// the e2e tests route the sample MP4 URLs to these VP8 files instead. Each frame
// encodes its own index as 10 black/white blocks along the top edge, so tests
// can read back exactly which frame is on screen. Keyframes are sparse (every
// 60 frames) to make seeking a realistic worst case.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { FIXTURES, fixturePath } from "./fixture-paths";

const FFMPEG = "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";

async function renderFrames(fps: number, frames: number, w: number, h: number, hue: number): Promise<Buffer[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const urls: string[] = await page.evaluate(
    ({ fps, frames, w, h, hue }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      const out: string[] = [];
      for (let i = 0; i < frames; i++) {
        ctx.fillStyle = `hsl(${hue}, 40%, ${20 + (i % 30)}%)`;
        ctx.fillRect(0, 0, w, h);
        // Frame index bits, MSB first, 10 blocks across the top.
        const bw = w / 10;
        for (let b = 0; b < 10; b++) {
          ctx.fillStyle = (i >> (9 - b)) & 1 ? "#fff" : "#000";
          ctx.fillRect(b * bw, 0, bw, 48);
        }
        // A moving "bat" so motion is visible.
        ctx.save();
        ctx.translate(w / 2, h * 0.6);
        ctx.rotate((i / frames) * Math.PI * 2);
        ctx.fillStyle = "#c8f000";
        ctx.fillRect(-6, -h * 0.25, 12, h * 0.25);
        ctx.restore();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i), w / 2, 140);
        ctx.font = "20px sans-serif";
        ctx.fillText(`${fps} fps`, w / 2, 175);
        out.push(c.toDataURL("image/jpeg", 0.92));
      }
      return out;
    },
    { fps, frames, w, h, hue },
  );
  await browser.close();
  return urls.map((u) => Buffer.from(u.split(",")[1], "base64"));
}

function encode(jpegs: Buffer[], fps: number, out: string): Promise<void> {
  // This ffmpeg build has no pipe protocol: concatenate the JPEGs into one
  // file and read it with the image2pipe demuxer.
  const mjpeg = `${out}.mjpeg`;
  fs.writeFileSync(mjpeg, Buffer.concat(jpegs));
  return new Promise<void>((resolve, reject) => {
    const p = spawn(FFMPEG, [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", `file:${mjpeg}`,
      "-c:v", "libvpx", "-g", "60", "-b:v", "1500k", "-deadline", "good", "-cpu-used", "4",
      "-pix_fmt", "yuv420p", `file:${out}`,
    ]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
  }).finally(() => fs.rmSync(mjpeg, { force: true }));
}

export default async function globalSetup() {
  for (const f of FIXTURES) {
    const out = fixturePath(f.name);
    if (fs.existsSync(out) && fs.statSync(out).size > 1000) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const jpegs = await renderFrames(f.fps, f.frames, f.width, f.height, f.hue);
    await encode(jpegs, f.fps, out);
  }
}
