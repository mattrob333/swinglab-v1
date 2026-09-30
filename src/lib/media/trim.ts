// Pure trim-window math shared by the trim editor and the processing job.
// Framework-free and DOM-free so it can be unit tested with node:test.

export interface TrimWindow {
  start: number;
  end: number;
}

export type TrimHandle = "start" | "end";

/** Shortest trim window we allow, seconds. */
export const MIN_TRIM_SEC = 0.25;

/** Frame duration for nudging; falls back to 30fps when the rate is unknown. */
export function frameDuration(fps: number | null | undefined): number {
  return fps && Number.isFinite(fps) && fps > 0 ? 1 / fps : 1 / 30;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Clamp a trim window into [0, duration] keeping at least `minLen` between the
 * handles. When the clip is shorter than `minLen` the whole clip is returned.
 */
export function clampTrim(trim: TrimWindow, duration: number, minLen = MIN_TRIM_SEC): TrimWindow {
  const dur = Math.max(0, finiteOr(duration, 0));
  if (dur <= minLen) return { start: 0, end: dur };
  let start = Math.min(Math.max(0, finiteOr(trim.start, 0)), dur);
  let end = Math.min(Math.max(0, finiteOr(trim.end, dur)), dur);
  if (end < start) [start, end] = [end, start];
  if (end - start < minLen) {
    // Grow around the midpoint, then shift back inside the clip.
    const mid = (start + end) / 2;
    start = mid - minLen / 2;
    end = mid + minLen / 2;
    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > dur) {
      start -= end - dur;
      end = dur;
    }
  }
  return { start, end };
}

/** Move one handle to `time`, never crossing the other handle. */
export function moveHandle(
  trim: TrimWindow,
  handle: TrimHandle,
  time: number,
  duration: number,
  minLen = MIN_TRIM_SEC,
): TrimWindow {
  const dur = Math.max(0, finiteOr(duration, 0));
  if (dur <= minLen) return { start: 0, end: dur };
  if (handle === "start") {
    const start = Math.min(Math.max(0, time), trim.end - minLen);
    return { start: Math.max(0, start), end: trim.end };
  }
  const end = Math.max(Math.min(dur, time), trim.start + minLen);
  return { start: trim.start, end: Math.min(dur, end) };
}

/** Nudge one handle by a whole number of frames. */
export function nudgeHandle(
  trim: TrimWindow,
  handle: TrimHandle,
  frames: number,
  fps: number | null | undefined,
  duration: number,
  minLen = MIN_TRIM_SEC,
): TrimWindow {
  const delta = frames * frameDuration(fps);
  const current = handle === "start" ? trim.start : trim.end;
  return moveHandle(trim, handle, current + delta, duration, minLen);
}

/** Slide the whole window by `delta` seconds, keeping its length. */
export function shiftWindow(trim: TrimWindow, delta: number, duration: number): TrimWindow {
  const len = trim.end - trim.start;
  const dur = Math.max(0, finiteOr(duration, 0));
  const start = Math.min(Math.max(0, trim.start + delta), Math.max(0, dur - len));
  return { start, end: start + len };
}

/** Time (seconds) → fraction of the clip [0, 1]. */
export function timeToFraction(time: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, time / duration));
}

/** Fraction [0, 1] → time (seconds). */
export function fractionToTime(fraction: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.min(1, Math.max(0, fraction)) * duration;
}

/** Evenly spaced sample times for a filmstrip of `count` thumbnails (cell centers). */
export function filmstripTimes(duration: number, count: number): number[] {
  if (!(duration > 0) || count <= 0) return [];
  const step = duration / count;
  return Array.from({ length: count }, (_, i) => Math.min(duration, (i + 0.5) * step));
}

/** "1.23s" style label; minutes shown when needed. */
export function formatSeconds(sec: number, decimals = 2): string {
  if (!Number.isFinite(sec)) return "–";
  const s = Math.max(0, sec);
  if (s < 60) return `${s.toFixed(decimals)}s`;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(decimals).padStart(decimals + 3, "0");
  return `${m}:${rest}`;
}

/** Recording timer label "0:07". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
