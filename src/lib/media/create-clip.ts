"use client";

// Turns a recorded or imported video Blob into a stored Clip: probe, thumbnail,
// write original + thumb to IndexedDB.

import { getClip, getClipBlob, newId, putClip } from "@/lib/store/local-db";
import { DEFAULT_CROP, type CameraView, type Clip, type ClipKind, type Handedness } from "@/lib/types";
import { getDefaultHandedness } from "./prefs";
import { probeVideo, type ProbeResult } from "./probe";
import { makeThumbnail } from "./thumbnail";

export interface CreateClipOptions {
  kind: ClipKind;
  title?: string;
  handedness?: Handedness;
  cameraView?: CameraView;
  /** When the swing was filmed (file lastModified for imports). */
  recordedAt?: Date;
  notes?: string;
}

/** "Swing · Sep 30 4:12 PM" */
export function swingLabel(date = new Date()): string {
  const d = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const t = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Swing · ${d} ${t}`;
}

export async function createClipFromBlob(
  blob: Blob,
  opts: CreateClipOptions,
): Promise<{ clip: Clip; probe: ProbeResult }> {
  const probe = await probeVideo(blob);
  if (!(probe.durationSec > 0)) throw new Error("That video looks empty.");
  const thumb = await makeThumbnail(blob, probe.durationSec);
  const now = new Date().toISOString();
  const clip: Clip = {
    id: newId(),
    kind: opts.kind,
    title: opts.title?.trim() || (opts.kind === "athlete" ? swingLabel(opts.recordedAt) : "Pro swing"),
    handedness: opts.handedness ?? (opts.kind === "athlete" ? getDefaultHandedness() : "R"),
    cameraView: opts.cameraView ?? "open",
    durationSec: probe.durationSec,
    fps: probe.fps,
    width: probe.width,
    height: probe.height,
    sloMoFactor: probe.sloMo.factor,
    trimStart: 0,
    trimEnd: probe.durationSec,
    crop: DEFAULT_CROP,
    processed: false,
    createdAt: now,
    updatedAt: now,
    ownerId: null,
    remotePath: null,
    remoteThumbPath: null,
    syncState: "local",
    notes: opts.notes ?? "",
  };
  await putClip(clip, thumb ? { original: blob, thumb } : { original: blob });
  return { clip, probe };
}

/**
 * Undo processing: make the untouched original the playable file again (full
 * length, unprocessed) so the swing can be re-trimmed from scratch.
 */
export async function restoreOriginal(clipId: string): Promise<Clip | undefined> {
  const [clip, original] = await Promise.all([getClip(clipId), getClipBlob(clipId, "original")]);
  if (!clip || !original) return undefined;
  const probe = await probeVideo(original);
  const thumb = await makeThumbnail(original, probe.durationSec);
  const next: Clip = {
    ...clip,
    processed: false,
    durationSec: probe.durationSec,
    fps: probe.fps,
    width: probe.width,
    height: probe.height,
    trimStart: 0,
    trimEnd: probe.durationSec,
    updatedAt: new Date().toISOString(),
  };
  // The store has no single-blob delete, so the playable slot gets the original.
  await putClip(next, thumb ? { playable: original, thumb } : { playable: original });
  return next;
}
