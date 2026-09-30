"use client";

// Snapshot composer: draws both panes' current frames into one canvas exactly
// as displayed (same layout, crop and flip), adds small labels, and saves it.

import { newId, putSnapshot } from "@/lib/store/local-db";
import type { Clip, Crop, Snapshot } from "@/lib/types";
import { containRect, cropMatrix } from "./geometry.ts";
import { formatSeconds, frameIndex } from "./time.ts";

export interface SnapshotPane {
  video: HTMLVideoElement;
  /** The element that clips the video (the pane viewport). */
  paneEl: HTMLElement;
  clip: Clip;
  crop: Crop;
  flipped: boolean;
  /** File time shown in the pane. */
  time: number;
  fps: number;
}

const MAX_DIM = 2400;

function label(p: SnapshotPane): string {
  const rel = formatSeconds((p.time - p.clip.trimStart) / (p.clip.sloMoFactor || 1));
  return `${p.clip.title} · ${rel} · f${frameIndex(p.clip, p.time, p.fps)}`;
}

export async function composeSnapshot(panes: SnapshotPane[]): Promise<Blob> {
  const rects = panes.map((p) => p.paneEl.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const cssW = right - left;
  const cssH = bottom - top;
  const k = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DIM / Math.max(cssW, cssH), 3);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * k);
  canvas.height = Math.round(cssH * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#08090a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";

  panes.forEach((p, i) => {
    const r = rects[i];
    const px = r.left - left;
    const py = r.top - top;
    const pw = r.width;
    const ph = r.height;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, k * px, k * py);
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, pw, ph);
    const m = cropMatrix(p.crop, p.flipped, pw, ph);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const fit = containRect(p.video.videoWidth, p.video.videoHeight, pw, ph);
    if (p.video.readyState >= 2) ctx.drawImage(p.video, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();

    // Label, unflipped, bottom-left of the pane.
    ctx.save();
    ctx.setTransform(k, 0, 0, k, k * px, k * py);
    const text = label(p);
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(8, ph - 30, tw + 16, 22);
    ctx.fillStyle = "#f7f8f8";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 16, ph - 19);
    ctx.restore();
  });

  // Tiny brand mark.
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#c8f000";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("SwingLab", cssW - 10, 10);
  ctx.restore();

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode snapshot"))), "image/jpeg", 0.9),
  );
}

export interface SnapshotPaneMeta {
  clipId: string | null;
  time: number | null;
  flipped: boolean;
}

export async function saveSnapshot(
  image: Blob,
  top: SnapshotPaneMeta,
  bottom: SnapshotPaneMeta,
  note = "",
): Promise<Snapshot> {
  const snap: Snapshot = {
    id: newId(),
    createdAt: new Date().toISOString(),
    imageType: image.type || "image/jpeg",
    topClipId: top.clipId,
    bottomClipId: bottom.clipId,
    topTime: top.time,
    bottomTime: bottom.time,
    topFlipped: top.flipped,
    bottomFlipped: bottom.flipped,
    note,
    ownerId: null,
    remotePath: null,
    syncState: "local",
  };
  await putSnapshot(snap, image);
  return snap;
}

/** Share an image with the OS share sheet (iOS offers "Save Image"). Returns false if unsupported. */
export async function shareImage(blob: Blob, name: string, text?: string): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], text });
    return true;
  } catch {
    // User cancelled.
    return true;
  }
}

/** Fallback when sharing files is unsupported: download the image. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** URL that restores a snapshot on the compare screen. */
export function compareHrefForSnapshot(s: Snapshot): string {
  const q = new URLSearchParams();
  if (s.topClipId) q.set("top", s.topClipId);
  if (s.bottomClipId) q.set("bottom", s.bottomClipId);
  if (s.topTime != null) q.set("tt", String(s.topTime));
  if (s.bottomTime != null) q.set("bt", String(s.bottomTime));
  q.set("tf", s.topFlipped ? "1" : "0");
  q.set("bf", s.bottomFlipped ? "1" : "0");
  return `/compare?${q.toString()}`;
}
