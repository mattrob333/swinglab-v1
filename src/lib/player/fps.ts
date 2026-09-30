// Frame-rate estimation from presented frames (requestVideoFrameCallback
// metadata) while a clip plays. Pure; tested in tests/player-fps.test.ts.

const COMMON = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240];

/** Snap to the nearest common frame rate when within 3%, else round to 2 decimals. */
export function snapFps(fps: number): number {
  let best = 0;
  let bestErr = Infinity;
  for (const c of COMMON) {
    const err = Math.abs(fps - c) / c;
    if (err < bestErr) {
      best = c;
      bestErr = err;
    }
  }
  return bestErr < 0.03 ? best : Math.round(fps * 100) / 100;
}

export class FpsEstimator {
  private last: { mediaTime: number; presentedFrames: number } | null = null;
  private deltas: number[] = [];

  /** Feed each presented frame during normal playback. */
  add(mediaTime: number, presentedFrames: number): void {
    const prev = this.last;
    this.last = { mediaTime, presentedFrames };
    if (!prev) return;
    // Only consecutive frames (no drop, no seek) measure the frame duration.
    if (presentedFrames - prev.presentedFrames !== 1) return;
    const d = mediaTime - prev.mediaTime;
    if (d <= 0 || d > 0.2) return;
    this.deltas.push(d);
    if (this.deltas.length > 120) this.deltas.shift();
  }

  /** Breaks the chain (call on pause/seek). */
  cut(): void {
    this.last = null;
  }

  /**
   * Estimated fps once enough samples exist. Uses the smallest cluster of
   * deltas: when playback rate is below 1 the browser still presents every
   * source frame, but at 1x on a slow device frames may be skipped, which only
   * makes deltas larger.
   */
  estimate(minSamples = 8): number | null {
    if (this.deltas.length < minSamples) return null;
    const sorted = [...this.deltas].sort((a, b) => a - b);
    const q = sorted[Math.floor(sorted.length * 0.25)];
    const cluster = sorted.filter((d) => d < q * 1.25);
    const mean = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const fps = 1 / mean;
    if (fps < 5 || fps > 1000) return null;
    return snapFps(fps);
  }
}
