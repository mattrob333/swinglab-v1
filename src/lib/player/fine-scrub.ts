// iOS-style fine scrubbing: while dragging the scrubber, moving the finger
// vertically away from the track slows the scrub down, so a narrow phone track
// can still position a single frame. Pure; unit tested.

export interface FineScrubLevel {
  /** Fraction of finger movement applied to the track. */
  speed: number;
  label: string;
}

const LEVELS: { minDistance: number; level: FineScrubLevel }[] = [
  { minDistance: 160, level: { speed: 0.1, label: "Fine scrub ⅒×" } },
  { minDistance: 100, level: { speed: 0.25, label: "Fine scrub ¼×" } },
  { minDistance: 50, level: { speed: 0.5, label: "Fine scrub ½×" } },
];

const FULL: FineScrubLevel = { speed: 1, label: "" };

/** Scrub speed for a finger `distance` px above or below the track's center line. */
export function fineScrubLevel(distance: number): FineScrubLevel {
  const d = Math.abs(distance);
  for (const { minDistance, level } of LEVELS) if (d >= minDistance) return level;
  return FULL;
}

export interface FineDragState {
  /** Track position as a fraction 0..1. */
  frac: number;
  lastX: number;
  /** True once the drag has left full-speed mode; from then on it stays relative. */
  relative: boolean;
}

/**
 * Next drag state for a pointer move. At full speed the thumb sits under the
 * finger (absolute); once fine mode is used, movement is applied as a scaled
 * delta so the thumb doesn't jump back under the finger.
 */
export function nextFineDrag(
  s: FineDragState,
  clientX: number,
  distanceFromTrack: number,
  trackLeft: number,
  trackWidth: number,
): FineDragState {
  const { speed } = fineScrubLevel(distanceFromTrack);
  const width = trackWidth || 1;
  const clamp = (f: number) => Math.min(1, Math.max(0, f));
  if (speed === 1 && !s.relative) {
    return { frac: clamp((clientX - trackLeft) / width), lastX: clientX, relative: false };
  }
  return { frac: clamp(s.frac + ((clientX - s.lastX) / width) * speed), lastX: clientX, relative: true };
}
