// Slo-mo factor suggestion from probed metadata. Pure; unit tested.
//
// sloMoFactor = how much slower than real time the file plays in a browser.
// - A raw high-frame-rate capture (e.g. an iPhone 240fps .MOV) plays in real
//   time in a <video> element (Photos applies the slow ramp, browsers don't),
//   so its factor is 1.
// - An exported slo-mo ("baked" to ~30fps timestamps) plays slowed. We can only
//   tell when the file carries a capture-rate tag higher than its playback rate.
// Anything uncertain stays 1 and the user picks 2×/4×/8× on the edit screen.

export const SLOMO_CHOICES = [1, 2, 4, 8] as const;

export interface SloMoSuggestion {
  factor: number;
  reason: string;
}

/** Snap a ratio to the nearest offered chip. */
export function snapSloMo(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio < 1.5) return 1;
  let best = 1;
  for (const c of SLOMO_CHOICES) {
    if (Math.abs(Math.log2(ratio) - Math.log2(c)) < Math.abs(Math.log2(ratio) - Math.log2(best))) best = c;
  }
  return best;
}

type RawTags = Record<string, unknown> | undefined;

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Looks for a tag describing the capture frame rate (Apple / Android variants). */
export function captureRateFromTags(raw: RawTags): number | null {
  if (!raw) return null;
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase();
    if (
      /capture[._-]?(fps|frame[._-]?rate)/.test(k) ||
      /com\.android\.capture\.fps/.test(k) ||
      /com\.apple\.quicktime\.(camera\.)?(capture[._-]?)?frame[._-]?rate/.test(k)
    ) {
      const n = numberFrom(value);
      if (n && n > 0) return n;
    }
  }
  return null;
}

export function suggestSloMoFactor(input: { fps: number | null; rawTags?: RawTags }): SloMoSuggestion {
  const { fps, rawTags } = input;
  const capture = captureRateFromTags(rawTags);
  if (capture && fps && fps > 0) {
    const factor = snapSloMo(capture / fps);
    if (factor > 1) {
      return { factor, reason: `Captured at ${Math.round(capture)}fps, plays at ${Math.round(fps)}fps` };
    }
  }
  if (fps && fps >= 100) {
    return { factor: 1, reason: `High frame rate (${Math.round(fps)}fps) file plays in real time` };
  }
  return { factor: 1, reason: "Real time" };
}
