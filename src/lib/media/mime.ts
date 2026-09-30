// MediaRecorder mime type selection. Pure; unit tested with a fake isSupported.

/**
 * In preference order. H.264 in MP4 first (Safari, and Chrome 126+), since it
 * plays everywhere; then WebM (Chrome/Firefox); plain "video/mp4" last for older
 * Safari that only answers true to the bare container.
 */
export const RECORDER_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  'video/mp4;codecs="avc1.640028"',
  'video/mp4;codecs="avc1.42E01E"',
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
] as const;

/** First candidate the browser supports, or null (let MediaRecorder choose). */
export function pickRecorderMimeType(
  isSupported: (type: string) => boolean,
  candidates: readonly string[] = RECORDER_MIME_CANDIDATES,
): string | null {
  for (const type of candidates) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // Some browsers throw on unknown parameters; treat as unsupported.
    }
  }
  return null;
}

/** File extension for a recorded/imported blob type. */
export function extensionForMime(mime: string | null | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("video/webm")) return "webm";
  if (m.startsWith("video/quicktime")) return "mov";
  if (m.startsWith("video/x-matroska")) return "mkv";
  return "mp4";
}

/** Container part of a mime type, e.g. `video/mp4;codecs=avc1` → `video/mp4`. */
export function baseMime(mime: string | null | undefined, fallback = "video/mp4"): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return m || fallback;
}

/** Whether a picked file looks like a video we should try to import. */
export function looksLikeVideoFile(name: string, type: string): boolean {
  if (type.startsWith("video/")) return true;
  return /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i.test(name);
}
