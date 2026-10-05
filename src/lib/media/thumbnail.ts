"use client";

// Thumbnails and filmstrip frames. Mediabunny's CanvasSink first (fast, exact,
// applies rotation); a <video> element + canvas as a fallback for files
// WebCodecs can't decode here.

import { CanvasSink } from "mediabunny";
import { openInput } from "./probe";

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function canvasToBlob(canvas: AnyCanvas, type = "image/jpeg", quality = 0.8): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), type, quality));
}

function fitSize(w: number, h: number, maxLong: number) {
  const s = Math.min(1, maxLong / Math.max(w, h));
  return { width: Math.max(2, Math.round(w * s)), height: Math.max(2, Math.round(h * s)) };
}

async function framesWithMediabunny(
  blob: Blob,
  times: number[],
  maxLong: number,
  onFrame: (index: number, image: Blob) => void,
): Promise<boolean> {
  const input = openInput(blob);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return false;
    const w = await track.getDisplayWidth();
    const h = await track.getDisplayHeight();
    const size = fitSize(w, h, maxLong);
    const sink = new CanvasSink(track, { width: size.width, height: size.height, fit: "contain" });
    let i = 0;
    let any = false;
    // canvasesAtTimestamps needs sorted timestamps for its fast path; times are sorted by callers.
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      const index = i++;
      if (!wrapped) continue;
      const image = await canvasToBlob(wrapped.canvas, "image/jpeg", 0.72);
      if (image) {
        any = true;
        onFrame(index, image);
      }
    }
    return any;
  } finally {
    input.dispose();
  }
}

function waitFor(el: HTMLVideoElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      el.removeEventListener(event, ok);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const ok = () => {
      clearTimeout(t);
      resolve();
    };
    el.addEventListener(event, ok, { once: true });
  });
}

async function framesWithVideoElement(
  blob: Blob,
  times: number[],
  maxLong: number,
  onFrame: (index: number, image: Blob) => void,
): Promise<boolean> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(blob);
  try {
    video.src = url;
    await waitFor(video, "loadeddata");
    const size = fitSize(video.videoWidth, video.videoHeight, maxLong);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    let any = false;
    for (let i = 0; i < times.length; i++) {
      const target = Number.isFinite(video.duration) ? Math.min(times[i], Math.max(0, video.duration - 0.01)) : times[i];
      if (Math.abs(video.currentTime - target) > 1e-3) {
        video.currentTime = target;
        await waitFor(video, "seeked");
      }
      ctx.drawImage(video, 0, 0, size.width, size.height);
      const image = await canvasToBlob(canvas, "image/jpeg", 0.72);
      if (image) {
        any = true;
        onFrame(i, image);
      }
    }
    return any;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Render frames at `times` (seconds from the start of the file, sorted), calling back as each is ready. */
export async function renderFrames(
  blob: Blob,
  times: number[],
  maxLong: number,
  onFrame: (index: number, image: Blob) => void,
): Promise<void> {
  const seen = new Set<number>();
  const record = (i: number, b: Blob) => {
    seen.add(i);
    onFrame(i, b);
  };
  let ok = false;
  try {
    ok = await framesWithMediabunny(blob, times, maxLong, record);
  } catch (err) {
    console.warn("[thumbnail] Mediabunny frames failed, using <video>", err);
  }
  if (ok) return;
  await framesWithVideoElement(blob, times, maxLong, (i, b) => {
    if (!seen.has(i)) record(i, b);
  });
}

/** JPEG thumbnail of the frame at `atSec` (default: middle of the clip). */
export async function makeThumbnail(blob: Blob, durationSec: number, atSec?: number, maxLong = 480): Promise<Blob | null> {
  const t = atSec ?? (Number.isFinite(durationSec) && durationSec > 0 ? durationSec / 2 : 0);
  let result: Blob | null = null;
  try {
    await renderFrames(blob, [t], maxLong, (_, b) => {
      result = b;
    });
  } catch (err) {
    console.warn("[thumbnail] failed", err);
  }
  return result;
}
