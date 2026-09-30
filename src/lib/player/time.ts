// Pure time and frame math for the player. No DOM, no path aliases: node:test
// imports this file directly.

/** The part of a clip the player cares about. `Clip` satisfies this. */
export interface TimeWindow {
  trimStart: number;
  trimEnd: number;
  /** How much slower than real time the file plays (1 = real time). */
  sloMoFactor: number;
}

export const DEFAULT_FPS = 30;

export function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampToTrim(w: Pick<TimeWindow, "trimStart" | "trimEnd">, t: number): number {
  return clamp(t, w.trimStart, w.trimEnd);
}

function factor(w: TimeWindow): number {
  return w.sloMoFactor > 0 && Number.isFinite(w.sloMoFactor) ? w.sloMoFactor : 1;
}

/** File seconds -> real (slo-mo corrected) seconds since the trim start. */
export function fileToReal(w: TimeWindow, fileTime: number): number {
  return (fileTime - w.trimStart) / factor(w);
}

/** Real seconds since the trim start -> file seconds (not clamped). */
export function realToFile(w: TimeWindow, realTime: number): number {
  return w.trimStart + realTime * factor(w);
}

/** Length of the trim window in real seconds. */
export function realDuration(w: TimeWindow): number {
  return Math.max(0, (w.trimEnd - w.trimStart) / factor(w));
}

/** Two times fall within half a frame of each other (would show the same frame). */
export function sameFrame(a: number, b: number, fps: number): boolean {
  return Math.abs(a - b) < 0.5 / fps;
}

/** Start time of the frame containing `t`, on a 0-based grid of 1/fps. */
export function frameStart(t: number, fps: number): number {
  // The epsilon absorbs float error for times that sit exactly on a boundary.
  return Math.floor(t * fps + 1e-6) / fps;
}

/** Frame index of `t` relative to the trim start. */
export function frameIndex(w: Pick<TimeWindow, "trimStart">, t: number, fps: number): number {
  return Math.max(0, Math.floor((t - w.trimStart) * fps + 1e-6));
}

export interface StepInput {
  /** Media time of the frame on screen (from requestVideoFrameCallback), if known. */
  presented: number | null;
  /** Latest requested time. */
  target: number;
  /** True while the target has not been presented yet (a seek is pending). */
  pending: boolean;
  fps: number;
  dir: 1 | -1;
  window: Pick<TimeWindow, "trimStart" | "trimEnd">;
}

/**
 * Next target for a frame step. Steps from the frame actually on screen when it
 * is known (so a variable or mis-estimated frame rate still lands on the
 * neighbour frame) and from the pending target while a seek is in flight (so
 * rapid taps accumulate). The result is aimed at the middle of the neighbour
 * frame, which tolerates a frame-rate estimate that is off by up to a third.
 */
export function stepTarget(s: StepInput): number {
  const base = !s.pending && s.presented != null ? s.presented : frameStart(s.target, s.fps);
  const next = s.dir > 0 ? base + 1.5 / s.fps : base - 0.5 / s.fps;
  return clampToTrim(s.window, next);
}

/** "1.23s" style label for seconds since trim start. */
export function formatSeconds(sec: number): string {
  const v = Math.max(0, sec);
  return `${v.toFixed(2)}s`;
}
