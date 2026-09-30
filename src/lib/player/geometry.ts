// Pane geometry shared by the CSS renderer (VideoPane) and the snapshot
// composer, so a snapshot is exactly what is on screen. Pure.

export interface CropLike {
  scale: number;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

/** Rect of a srcW x srcH image fitted inside a box with object-fit: contain. */
export function containRect(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const s = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

export function clampCrop(c: CropLike): CropLike {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(c.scale) ? c.scale : 1));
  // Allow panning until the image edge reaches the pane centre.
  const lim = scale / 2;
  const x = Math.min(lim, Math.max(-lim, Number.isFinite(c.x) ? c.x : 0));
  const y = Math.min(lim, Math.max(-lim, Number.isFinite(c.y) ? c.y : 0));
  return { scale, x, y };
}

/** CSS transform for a video element that fills its pane (transform-origin: center). */
export function cropTransformCss(c: CropLike, flipped: boolean): string {
  const f = flipped ? "scaleX(-1) " : "";
  return `${f}translate3d(${(c.x * 100).toFixed(3)}%, ${(c.y * 100).toFixed(3)}%, 0) scale(${c.scale.toFixed(4)})`;
}

/**
 * The same transform as a 2D matrix [a, b, c, d, e, f] in pane pixels (origin
 * top-left), suitable for CanvasRenderingContext2D.setTransform after
 * translating to the pane origin.
 */
export function cropMatrix(c: CropLike, flipped: boolean, w: number, h: number): [number, number, number, number, number, number] {
  const fx = flipped ? -1 : 1;
  const cx = w / 2;
  const cy = h / 2;
  return [fx * c.scale, 0, 0, c.scale, cx + fx * (c.x * w - c.scale * cx), cy + c.y * h - c.scale * cy];
}

export function applyMatrix(m: readonly number[], px: number, py: number): [number, number] {
  return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
}

export interface PinchPoint {
  /** Midpoint between the two fingers, pane-local pixels. */
  x: number;
  y: number;
  /** Distance between the fingers, pixels. */
  dist: number;
}

/**
 * New crop after a two-finger gesture that started at `from` with crop `start`
 * and is now at `to`. The content point under the starting midpoint stays
 * under the current midpoint (zoom + pan in one gesture).
 */
export function pinchCrop(
  start: CropLike,
  from: PinchPoint,
  to: PinchPoint,
  w: number,
  h: number,
  flipped: boolean,
): CropLike {
  const cx = w / 2;
  const cy = h / 2;
  // Work in un-mirrored coordinates: mirror x around the centre when flipped.
  const mx = (x: number) => (flipped ? 2 * cx - x : x);
  const s0 = start.scale;
  const s1 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s0 * (from.dist > 0 ? to.dist / from.dist : 1)));
  const t0x = start.x * w;
  const t0y = start.y * h;
  const t1x = mx(to.x) - cx - (s1 * (mx(from.x) - cx - t0x)) / s0;
  const t1y = to.y - cy - (s1 * (from.y - cy - t0y)) / s0;
  return clampCrop({ scale: s1, x: t1x / w, y: t1y / h });
}
