"use client";

// Background processing of clips into seek-friendly proxies, one at a time.
// A tiny in-memory store (subscribe / getSnapshot) lets the UI show
// "Optimizing…" badges; `resumePendingJobs()` picks up unprocessed clips on load.

import { getClip, getPlayableBlob, listClips, listSnapshots, putClip, updateSnapshot } from "@/lib/store/local-db";
import { loadCompareState, saveCompareState } from "@/lib/player/compare-state";
import type { Clip } from "@/lib/types";
import { SerialQueue } from "./queue";
import { clampTrim } from "./trim";
import { makeThumbnail } from "./thumbnail";
import { isCancel, transcodeTrimmed } from "./transcode";
import { inspectKeyFrames, probeVideo } from "./probe";

export type JobState = "queued" | "running" | "done" | "error" | "unsupported";

export interface JobInfo {
  clipId: string;
  state: JobState;
  /** 0..1 while running. */
  progress: number;
  message?: string;
  elapsedMs?: number;
}

type Listener = () => void;

const queue = new SerialQueue();
const listeners = new Set<Listener>();
/** Clips open in the editor: left queued until released so edits aren't raced. */
const held = new Set<string>();
/** Clips that failed or can't be encoded this session: not retried automatically. */
const gaveUp = new Set<string>();
let jobs: Readonly<Record<string, JobInfo>> = {};
let runningAbort: AbortController | null = null;

function emit() {
  for (const l of listeners) l();
}

function setJob(clipId: string, patch: Partial<JobInfo>) {
  const prev = jobs[clipId] ?? { clipId, state: "queued", progress: 0 };
  jobs = { ...jobs, [clipId]: { ...prev, ...patch, clipId } };
  emit();
}

export function subscribeJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Immutable snapshot, safe for useSyncExternalStore. */
export function getJobsSnapshot(): Readonly<Record<string, JobInfo>> {
  return jobs;
}

export function getJob(clipId: string): JobInfo | undefined {
  return jobs[clipId];
}

/** Queue a clip for processing. `priority` puts it ahead of background work. */
export function enqueueProcessing(clipId: string, options: { priority?: boolean } = {}): void {
  gaveUp.delete(clipId);
  if (queue.enqueue(clipId, options.priority ?? false) && queue.running !== clipId) {
    setJob(clipId, { state: "queued", progress: 0, message: undefined });
  }
  pump();
}

/** Drop a clip from the queue (e.g. it was deleted); aborts it if running. */
export function cancelProcessing(clipId: string): void {
  queue.remove(clipId);
  if (queue.running === clipId) runningAbort?.abort();
  if (jobs[clipId]) {
    const next = { ...jobs };
    delete next[clipId];
    jobs = next;
    emit();
  }
}

/** Keep a clip's job from starting while it is being edited. Returns a release function. */
export function holdClip(clipId: string): () => void {
  held.add(clipId);
  return () => {
    held.delete(clipId);
    pump();
  };
}

/** Queue every unprocessed clip on the device. Safe to call repeatedly. */
export async function resumePendingJobs(): Promise<number> {
  if (typeof window === "undefined") return 0;
  let clips: Clip[];
  try {
    clips = await listClips();
  } catch {
    return 0;
  }
  // Oldest first so bulk imports finish in the order they were added.
  const pending = clips
    .filter((c) => !c.processed && !gaveUp.has(c.id) && !queue.has(c.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const c of pending) {
    if (queue.enqueue(c.id, false)) setJob(c.id, { state: "queued", progress: 0 });
  }
  pump();
  return pending.length;
}

function pump() {
  const key = queue.start((k) => held.has(k));
  if (!key) return;
  runJob(key)
    .catch((err) => {
      if (isCancel(err)) return;
      console.error("[jobs] processing failed", key, err);
      gaveUp.add(key);
      setJob(key, { state: "error", message: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      runningAbort = null;
      queue.finish(key);
      // Yield so the UI can breathe between jobs.
      setTimeout(pump, 50);
    });
}

const sameTrim = (a: Clip, start: number, end: number) =>
  Math.abs(a.trimStart - start) < 1e-3 && Math.abs(a.trimEnd - end) < 1e-3;

async function runJob(clipId: string): Promise<void> {
  const clip = await getClip(clipId);
  if (!clip) {
    cancelProcessing(clipId);
    return;
  }
  if (clip.processed) {
    setJob(clipId, { state: "done", progress: 1 });
    return;
  }
  const source = await getPlayableBlob(clipId);
  if (!source) throw new Error("Video file missing on this device");

  const trim = clampTrim({ start: clip.trimStart, end: clip.trimEnd || clip.durationSec }, clip.durationSec);
  setJob(clipId, { state: "running", progress: 0, message: undefined });
  runningAbort = new AbortController();
  const result = await transcodeTrimmed(source, {
    start: trim.start,
    end: trim.end,
    signal: runningAbort.signal,
    onProgress: (p) => setJob(clipId, { progress: p }),
  });
  if (result.status === "unsupported") {
    gaveUp.add(clipId);
    setJob(clipId, { state: "unsupported", progress: 0, message: result.reason });
    return;
  }

  // The user may have changed the trim (or deleted the clip) while we encoded.
  const latest = await getClip(clipId);
  if (!latest) return;
  if (latest.processed) {
    setJob(clipId, { state: "done", progress: 1 });
    return;
  }
  if (!sameTrim(latest, clip.trimStart, clip.trimEnd)) {
    queue.enqueue(clipId, true); // re-run with the new window
    setJob(clipId, { state: "queued", progress: 0 });
    return;
  }
  const thumb = await makeThumbnail(result.blob, result.durationSec);
  const now = new Date().toISOString();
  const next: Clip = {
    ...latest,
    processed: true,
    trimStart: 0,
    trimEnd: result.durationSec,
    durationSec: result.durationSec,
    fps: result.fps,
    width: result.width,
    height: result.height,
    updatedAt: now,
  };
  await putClip(next, thumb ? { playable: result.blob, thumb } : { playable: result.blob });
  await rebaseSavedTimes(clipId, latest.trimStart, result.durationSec);
  setJob(clipId, { state: "done", progress: 1, elapsedMs: result.elapsedMs });
}

/**
 * The optimized file starts at the old trim start. Times saved against the
 * original (snapshots, the compare screen's last position) move by that offset
 * so they still point at the same frame.
 */
async function rebaseSavedTimes(clipId: string, offset: number, duration: number): Promise<void> {
  if (!(offset > 0)) return;
  const shift = (t: number | null) => (t == null ? t : Math.min(duration, Math.max(0, t - offset)));
  const cs = loadCompareState();
  if (cs && (cs.topClipId === clipId || cs.bottomClipId === clipId)) {
    saveCompareState({
      ...cs,
      topTime: cs.topClipId === clipId ? (shift(cs.topTime) ?? 0) : cs.topTime,
      bottomTime: cs.bottomClipId === clipId ? (shift(cs.bottomTime) ?? 0) : cs.bottomTime,
    });
  }
  try {
    for (const s of await listSnapshots()) {
      const top = s.topClipId === clipId;
      const bottom = s.bottomClipId === clipId;
      if (top || bottom) {
        await updateSnapshot(s.id, {
          ...(top ? { topTime: shift(s.topTime) } : {}),
          ...(bottom ? { bottomTime: shift(s.bottomTime) } : {}),
        });
      }
    }
  } catch (err) {
    console.warn("[jobs] could not update snapshot times", err);
  }
}

// Dev-only handle for headless checks and debugging.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __swinglabJobs?: unknown }).__swinglabJobs = {
    getJobsSnapshot,
    enqueueProcessing,
    resumePendingJobs,
    transcodeTrimmed,
    inspectKeyFrames,
    probeVideo,
  };
}
