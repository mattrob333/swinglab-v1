// Crop math for the non-destructive `Clip.crop` framing. Pure; unit tested.
//
// Rendering contract (shared with the player): the video element fills its
// pane (object-fit: contain) and gets
//   transform-origin: center; transform: translate(x*100%, y*100%) scale(scale)
// i.e. scale about the center first, then pan by a fraction of the pane size.

export interface CropValue {
  scale: number;
  x: number;
  y: number;
}

export const MIN_CROP_SCALE = 1;
export const MAX_CROP_SCALE = 6;

/** Clamp scale to [1, 6] and pan so the scaled video still covers the pane center area. */
export function clampCrop(c: CropValue): CropValue {
  const scale = Math.min(MAX_CROP_SCALE, Math.max(MIN_CROP_SCALE, Number.isFinite(c.scale) ? c.scale : 1));
  const limit = (scale - 1) / 2;
  const clamp = (v: number) => Math.min(limit, Math.max(-limit, Number.isFinite(v) ? v : 0)) || 0; // no -0
  return { scale, x: clamp(c.x), y: clamp(c.y) };
}

/** CSS transform string for a crop. */
export function cropTransform(c: CropValue): string {
  return `translate(${(c.x * 100).toFixed(3)}%, ${(c.y * 100).toFixed(3)}%) scale(${c.scale.toFixed(4)})`;
}

/**
 * Zoom by `factor` keeping the point under the focus fixed. `focusX/Y` are the
 * focus position as a fraction of the pane measured from its center (-0.5..0.5).
 */
export function zoomAt(c: CropValue, factor: number, focusX: number, focusY: number): CropValue {
  const next = Math.min(MAX_CROP_SCALE, Math.max(MIN_CROP_SCALE, c.scale * factor));
  const k = next / c.scale;
  // Screen point p = t + s*q stays fixed: t' = p - k*(p - t)
  return clampCrop({ scale: next, x: focusX - k * (focusX - c.x), y: focusY - k * (focusY - c.y) });
}

/** Pan by a delta expressed as a fraction of the pane size. */
export function panBy(c: CropValue, dx: number, dy: number): CropValue {
  return clampCrop({ scale: c.scale, x: c.x + dx, y: c.y + dy });
}

export function isIdentityCrop(c: CropValue): boolean {
  return Math.abs(c.scale - 1) < 1e-3 && Math.abs(c.x) < 1e-3 && Math.abs(c.y) < 1e-3;
}
