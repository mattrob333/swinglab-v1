// Output size / bitrate / keyframe choices for the seek-friendly proxy. Pure; unit tested.

export interface EncodePlan {
  width: number;
  height: number;
  bitrate: number;
  /** Seconds between keyframes as Mediabunny expects it (0 = every frame). */
  keyFrameInterval: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Fit (w, h) inside a 1080p box in either orientation, never upscaling. Even dimensions. */
export function fitWithin1080p(width: number, height: number, longMax = 1920, shortMax = 1080) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.min(1, longMax / long, shortMax / short);
  return { width: even(width * scale), height: even(height * scale) };
}

/**
 * ~10 Mbps at 1080p, scaled by pixel count, +20% above 50fps, clamped to 4–12 Mbps.
 * Short, keyframe-dense clips need the headroom.
 */
export function pickBitrate(width: number, height: number, fps: number | null): number {
  const pixels = Math.max(1, width * height);
  let bps = 10_000_000 * (pixels / (1920 * 1080));
  if (fps && fps > 50) bps *= 1.2;
  return Math.round(Math.min(12_000_000, Math.max(4_000_000, bps)));
}

/**
 * Mediabunny forces a keyframe whenever floor(timestamp / interval) changes, so
 * an interval of `frames / fps` gives a keyframe every `frames` frames. 0 means
 * every frame; unknown fps also falls back to every frame.
 */
export function keyFrameIntervalFor(fps: number | null, everyFrames = 2): number {
  if (everyFrames <= 1 || !fps || !(fps > 0)) return 0;
  return everyFrames / fps;
}

export function planEncode(
  displayWidth: number,
  displayHeight: number,
  fps: number | null,
  everyFrames = 2,
): EncodePlan {
  const { width, height } = fitWithin1080p(displayWidth, displayHeight);
  return {
    width,
    height,
    bitrate: pickBitrate(width, height, fps),
    keyFrameInterval: keyFrameIntervalFor(fps, everyFrames),
  };
}
