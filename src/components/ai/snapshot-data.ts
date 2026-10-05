"use client";

// Browser-only glue between the local store and the AI request builder.

import { getClip, getSnapshot, getSnapshotImage } from "@/lib/store/local-db";
import { layoutForSize, type SnapshotSource } from "@/lib/ai/client";
import { getDefaultHandedness } from "@/lib/media/prefs";
import type { Clip, Handedness, Snapshot } from "@/lib/types";

async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

/** Re-encodes to JPEG with the longest edge at most maxDim (returns small JPEGs unchanged). */
export async function encodeJpeg(blob: Blob, maxDim: number): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.type === "image/jpeg") {
    bmp.close();
    return blob;
  }
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    return blob;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.85));
}

function paneTitle(clip: Clip | undefined): string {
  if (!clip) return "Unknown clip";
  return `${clip.title} (${clip.kind === "pro" ? "pro" : "athlete"}, bats ${clip.handedness === "L" ? "left" : "right"})`;
}

export interface LoadedSnapshots {
  sources: SnapshotSource[];
  missing: string[];
}

/** Loads the snapshots, their images and pane titles from the device, in the given order. */
export async function loadSnapshotSources(ids: string[]): Promise<LoadedSnapshots> {
  const sources: SnapshotSource[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const [snap, blob] = await Promise.all([getSnapshot(id), getSnapshotImage(id)]);
    if (!snap || !blob) {
      missing.push(id);
      continue;
    }
    const [top, bottom, size] = await Promise.all([
      snap.topClipId ? getClip(snap.topClipId) : undefined,
      snap.bottomClipId ? getClip(snap.bottomClipId) : undefined,
      imageSize(blob),
    ]);
    sources.push({
      id,
      blob,
      topTitle: paneTitle(top),
      bottomTitle: paneTitle(bottom),
      layout: size ? layoutForSize(size.width, size.height) : "stacked",
      note: snap.note,
    });
  }
  return { sources, missing };
}

/** The athlete's side from the snapshots' athlete clips, else the settings default. */
export function inferHandedness(snaps: Snapshot[], clips: Clip[]): Handedness {
  const byId = new Map(clips.map((c) => [c.id, c]));
  for (const s of snaps) {
    for (const id of [s.bottomClipId, s.topClipId]) {
      const c = id ? byId.get(id) : undefined;
      if (c?.kind === "athlete") return c.handedness;
    }
  }
  return getDefaultHandedness();
}
