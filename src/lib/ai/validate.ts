// Input validation for the AI routes. Pure and framework-free (unit tested in
// tests/ai-validate.test.ts). Everything a client sends is bounded here before
// it can reach a paid model API.

import { MAX_AUDIO_BYTES, MAX_SNAPSHOTS_PER_ANALYSIS } from "./contract.ts";
import type { AnalyzeRequest, AnalyzeSnapshotInput, DrillsRequest } from "./contract.ts";

/** Largest decoded snapshot image accepted, per image. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Coach notes and each snapshot note. */
export const MAX_NOTES_CHARS = 4000;
/** A voice-note transcript (a few minutes of speech). */
export const MAX_TRANSCRIPT_CHARS = 8000;
/** Titles shown on a snapshot pane. */
export const MAX_TITLE_CHARS = 200;
export const MAX_LEVEL_CHARS = 100;
/** Issues sent to the drill finder. */
export const MAX_DRILL_ISSUES = 8;
export const MAX_ISSUE_TITLE_CHARS = 200;
export const MAX_ISSUE_DETAIL_CHARS = 1000;
/** JSON body limit for /api/ai/analyze (6 images of 2 MB as base64 plus text). */
export const MAX_ANALYZE_BODY_BYTES = Math.ceil((MAX_SNAPSHOTS_PER_ANALYSIS * MAX_IMAGE_BYTES * 4) / 3) + 256 * 1024;
export const MAX_DRILLS_BODY_BYTES = 64 * 1024;

export type ImageMime = "image/jpeg" | "image/png";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Detect JPEG / PNG from the first bytes. Anything else is rejected. */
export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** Exact decoded length of a base64 string (no data: prefix), or -1 if malformed. */
export function base64DecodedLength(b64: string): number {
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return -1;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

export interface CheckedImage {
  mime: ImageMime;
  /** Normalized base64 (whitespace removed). */
  base64: string;
  bytes: number;
}

/** Validate one base64 image: well-formed, ≤ MAX_IMAGE_BYTES decoded, real JPEG/PNG. */
export function checkImageBase64(raw: unknown, maxBytes = MAX_IMAGE_BYTES): Validated<CheckedImage> {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, error: "image is missing" };
  // Cheap bound before any work: base64 is 4/3 of the payload.
  if (raw.length > Math.ceil((maxBytes * 4) / 3) + 1024) return { ok: false, error: "image is larger than 2 MB" };
  let b64 = raw.replace(/\s+/g, "");
  if (b64.startsWith("data:")) return { ok: false, error: "send the image as plain base64 without a data: prefix" };
  // Accept unpadded base64 by padding it.
  if (b64.length % 4 === 2) b64 += "==";
  else if (b64.length % 4 === 3) b64 += "=";
  const bytes = base64DecodedLength(b64);
  if (bytes < 0) return { ok: false, error: "image is not valid base64" };
  if (bytes > maxBytes) return { ok: false, error: "image is larger than 2 MB" };
  const head = Buffer.from(b64.slice(0, 16), "base64");
  const mime = sniffImageMime(head);
  if (!mime) return { ok: false, error: "image must be a JPEG or PNG" };
  return { ok: true, value: { mime, base64: b64, bytes } };
}

function str(v: unknown, max: number, field: string, required = false): Validated<string> {
  if (v === undefined || v === null) return required ? { ok: false, error: `${field} is required` } : { ok: true, value: "" };
  if (typeof v !== "string") return { ok: false, error: `${field} must be text` };
  const s = v.trim();
  if (required && !s) return { ok: false, error: `${field} is required` };
  if (s.length > max) return { ok: false, error: `${field} is too long (max ${max} characters)` };
  return { ok: true, value: s };
}

export interface CheckedSnapshot extends Omit<AnalyzeSnapshotInput, "imageBase64"> {
  image: CheckedImage;
}

export interface CheckedAnalyzeRequest extends Omit<AnalyzeRequest, "snapshots"> {
  snapshots: CheckedSnapshot[];
}

/** Validate and normalize an AnalyzeRequest body. */
export function parseAnalyzeRequest(body: unknown): Validated<CheckedAnalyzeRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "request body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (b.model !== "opus" && b.model !== "sol") return { ok: false, error: 'model must be "opus" or "sol"' };

  if (!Array.isArray(b.snapshots) || b.snapshots.length === 0) return { ok: false, error: "pick at least one snapshot" };
  if (b.snapshots.length > MAX_SNAPSHOTS_PER_ANALYSIS) {
    return { ok: false, error: `pick at most ${MAX_SNAPSHOTS_PER_ANALYSIS} snapshots` };
  }

  const snapshots: CheckedSnapshot[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of b.snapshots.entries()) {
    const n = i + 1;
    if (!raw || typeof raw !== "object") return { ok: false, error: `snapshot ${n} is malformed` };
    const s = raw as Record<string, unknown>;
    if (!isUuid(s.id)) return { ok: false, error: `snapshot ${n} has an invalid id` };
    const id = s.id.toLowerCase();
    if (seen.has(id)) return { ok: false, error: `snapshot ${n} is listed twice` };
    seen.add(id);
    const image = checkImageBase64(s.imageBase64);
    if (!image.ok) return { ok: false, error: `snapshot ${n}: ${image.error}` };
    const top = str(s.topTitle, MAX_TITLE_CHARS, `snapshot ${n} top title`);
    if (!top.ok) return top;
    const bottom = str(s.bottomTitle, MAX_TITLE_CHARS, `snapshot ${n} bottom title`);
    if (!bottom.ok) return bottom;
    if (s.layout !== "stacked" && s.layout !== "side") return { ok: false, error: `snapshot ${n} layout must be "stacked" or "side"` };
    const note = str(s.note, MAX_NOTES_CHARS, `snapshot ${n} note`);
    if (!note.ok) return note;
    snapshots.push({ id, image: image.value, topTitle: top.value, bottomTitle: bottom.value, layout: s.layout, note: note.value });
  }

  const a = b.athlete as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return { ok: false, error: "athlete is required" };
  if (a.handedness !== "L" && a.handedness !== "R") return { ok: false, error: 'athlete handedness must be "L" or "R"' };
  let age: number | null = null;
  if (a.age !== null && a.age !== undefined) {
    if (typeof a.age !== "number" || !Number.isInteger(a.age) || a.age < 3 || a.age > 99) {
      return { ok: false, error: "athlete age must be a whole number between 3 and 99" };
    }
    age = a.age;
  }
  const level = str(a.level, MAX_LEVEL_CHARS, "athlete level");
  if (!level.ok) return level;

  const coachNotes = str(b.coachNotes, MAX_NOTES_CHARS, "coach notes");
  if (!coachNotes.ok) return coachNotes;
  const transcript = str(b.transcript, MAX_TRANSCRIPT_CHARS, "voice note transcript");
  if (!transcript.ok) return transcript;

  return {
    ok: true,
    value: {
      model: b.model,
      snapshots,
      athlete: { handedness: a.handedness, age, level: level.value },
      coachNotes: coachNotes.value,
      transcript: transcript.value,
    },
  };
}

/** Validate a DrillsRequest body. */
export function parseDrillsRequest(body: unknown): Validated<DrillsRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "request body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.handedness !== "L" && b.handedness !== "R") return { ok: false, error: 'handedness must be "L" or "R"' };
  if (!Array.isArray(b.issues) || b.issues.length === 0) return { ok: false, error: "send at least one issue" };
  if (b.issues.length > MAX_DRILL_ISSUES) return { ok: false, error: `send at most ${MAX_DRILL_ISSUES} issues` };
  const issues: DrillsRequest["issues"] = [];
  for (const [i, raw] of b.issues.entries()) {
    if (!raw || typeof raw !== "object") return { ok: false, error: `issue ${i + 1} is malformed` };
    const r = raw as Record<string, unknown>;
    const title = str(r.title, MAX_ISSUE_TITLE_CHARS, `issue ${i + 1} title`, true);
    if (!title.ok) return title;
    const detail = str(r.detail, MAX_ISSUE_DETAIL_CHARS, `issue ${i + 1} detail`);
    if (!detail.ok) return detail;
    issues.push({ title: title.value, detail: detail.value });
  }
  return { ok: true, value: { issues, handedness: b.handedness } };
}

const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
]);

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

export interface CheckedAudio {
  mime: string;
  /** Filename with an extension the transcription API recognizes. */
  filename: string;
}

/**
 * Validate an uploaded voice note by size and declared type. MediaRecorder on
 * iOS Safari produces audio/mp4, Chrome audio/webm;codecs=opus.
 */
export function checkAudio(file: { size: number; type: string } | null | undefined, maxBytes = MAX_AUDIO_BYTES): Validated<CheckedAudio> {
  if (!file) return { ok: false, error: "attach the voice note as form field \"file\"" };
  if (file.size <= 0) return { ok: false, error: "the voice note is empty" };
  if (file.size > maxBytes) return { ok: false, error: `the voice note is larger than ${Math.round(maxBytes / (1024 * 1024))} MB` };
  const mime = (file.type ?? "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.has(mime)) return { ok: false, error: "the voice note must be an audio file (webm, mp4/m4a, mp3, wav, ogg or flac)" };
  return { ok: true, value: { mime, filename: `voice-note.${AUDIO_EXT[mime]}` } };
}
