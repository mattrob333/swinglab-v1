"use client";

// Loads the sample videos shipped in public/videos into the local store, so the
// app is usable (and testable) before any real clips or a backend exist.

import { listClips, newId, putClip } from "@/lib/store/local-db";
import { DEFAULT_CROP, type Clip, type ClipKind, type Handedness } from "@/lib/types";

interface Sample {
  path: string;
  kind: ClipKind;
  title: string;
  handedness: Handedness;
}

export const SAMPLES: Sample[] = [
  { path: "/videos/pro/jackson-holliday.mp4", kind: "pro", title: "Jackson Holliday", handedness: "L" },
  { path: "/videos/pro/optimized_79cd08c2-f901-47b4-9e80-fc8296fc601b_optimized.mp4", kind: "pro", title: "Pro sample A", handedness: "R" },
  { path: "/videos/pro/optimized_8f95d8a1-1d19-4387-ba30-1df57b81c259_optimized.mp4", kind: "pro", title: "Pro sample B", handedness: "R" },
  { path: "/videos/youth/youth-nov2023.mp4", kind: "athlete", title: "Youth · Nov 2023", handedness: "L" },
  { path: "/videos/youth/20240721_101054.mp4", kind: "athlete", title: "Youth · Jul 2024", handedness: "L" },
  { path: "/videos/youth/optimized_38a9bdbd-6417-4d00-b133-fe33a7668b25_optimized.mp4", kind: "athlete", title: "Youth sample", handedness: "L" },
];

function readMetadata(blob: Blob): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const url = URL.createObjectURL(blob);
    video.onloadedmetadata = () => {
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video metadata"));
    };
    video.src = url;
  });
}

/** Imports any samples not already in the store. Returns how many were added. */
export async function loadSampleClips(): Promise<number> {
  const existing = new Set((await listClips()).map((c) => c.notes));
  let added = 0;
  for (const s of SAMPLES) {
    const marker = `sample:${s.path}`;
    if (existing.has(marker)) continue;
    const res = await fetch(s.path);
    if (!res.ok) continue;
    const blob = await res.blob();
    const meta = await readMetadata(blob);
    const now = new Date().toISOString();
    const clip: Clip = {
      id: newId(),
      kind: s.kind,
      title: s.title,
      handedness: s.handedness,
      cameraView: "open",
      durationSec: meta.duration,
      fps: null,
      width: meta.width,
      height: meta.height,
      sloMoFactor: 1,
      trimStart: 0,
      trimEnd: meta.duration,
      crop: DEFAULT_CROP,
      processed: false,
      createdAt: now,
      updatedAt: now,
      ownerId: null,
      remotePath: null,
      remoteThumbPath: null,
      syncState: "local",
      notes: marker,
    };
    await putClip(clip, { original: blob });
    added++;
  }
  return added;
}
