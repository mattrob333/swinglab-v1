// Turns a pro video filename into a prefilled title, and guesses camera view and
// handedness from common tokens. Pure; unit tested.

export type ParsedCameraView = "open" | "closed" | "behind" | "front" | "other";

export interface ParsedFilename {
  name: string;
  cameraView: ParsedCameraView | null;
  handedness: "L" | "R" | null;
}

const NOISE = new Set([
  "optimized", "optimised", "copy", "final", "edit", "edited", "export", "exported", "trim", "trimmed",
  "img", "vid", "video", "mov", "mp4", "m4v", "webm", "hd", "uhd", "4k", "hq", "slomo", "slowmo", "slow",
  "mo", "clip", "swing", "swings", "fps", "compressed", "min", "new", "pxl", "dsc", "gopr",
]);

const VIEW_TOKENS = new Map<string, ParsedCameraView>(Object.entries({
  open: "open",
  openside: "open",
  closed: "closed",
  closedside: "closed",
  behind: "behind",
  back: "behind",
  cf: "behind",
  centerfield: "behind",
  front: "front",
  face: "front",
  facing: "front",
}) as [string, ParsedCameraView][]);

const LEFT_TOKENS = new Set(["lhh", "lefty", "lh", "left"]);
const RIGHT_TOKENS = new Set(["rhh", "righty", "rh", "right"]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function isNoiseToken(t: string): boolean {
  const lower = t.toLowerCase();
  if (NOISE.has(lower)) return true;
  if (/^\d+$/.test(lower)) return lower.length >= 4 || lower.length <= 2; // dates, counters
  if (/^\d+(p|fps|k)$/.test(lower)) return true; // 1080p, 60fps, 4k
  if (/^v\d+$/.test(lower)) return true; // v2
  if (/^[0-9a-f]{8,}$/i.test(lower) && /\d/.test(lower)) return true; // hashes
  if (/^(img|vid|pxl|dsc|mvi|gopr)\d+$/i.test(lower)) return true; // camera roll names
  return false;
}

function titleCaseWord(w: string): string {
  // Keep deliberate mixed case (McCutchen, DeJong); normalize ALL CAPS / lowercase.
  if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
  if (/^(jr|sr)\.?$/i.test(w)) return w[0].toUpperCase() + w.slice(1).toLowerCase().replace(/\.?$/, ".");
  if (/^(ii|iii|iv)$/i.test(w)) return w.toUpperCase();
  return w
    .toLowerCase()
    .split("'")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("'");
}

/** Strip the extension, noise tokens, ids and dates; detect view and handedness hints. */
export function parseProFilename(filename: string): ParsedFilename {
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{2,5}$/i, "");
  const cleaned = base
    .replace(UUID_RE, " ")
    .replace(/\(\d+\)/g, " ")
    .replace(/[_\-.+,()[\]{}]+/g, " ");
  // "CodyBellinger" → words, but only when there are no separators at all, so
  // names like McCutchen or DeJong survive.
  const spaced = /\s/.test(cleaned.trim()) ? cleaned : cleaned.replace(/([a-z]{2,})([A-Z])/g, "$1 $2");
  const tokens = spaced.split(/\s+/).filter(Boolean);

  let cameraView: ParsedCameraView | null = null;
  let handedness: "L" | "R" | null = null;
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();
    const view = VIEW_TOKENS.get(lower);
    if (view && (next === "side" || next === "view" || next === "angle")) {
      cameraView = view;
      i++;
      continue;
    }
    // "open", "back", "front" and "face" are only views once a name came first.
    const ambiguous = lower === "open" || lower === "back" || lower === "front" || lower === "face";
    if (view && (!ambiguous || kept.length > 0)) {
      cameraView = view;
      continue;
    }
    if (lower === "side" || lower === "view" || lower === "angle") continue;
    if (LEFT_TOKENS.has(lower) && kept.length > 0) {
      handedness = "L";
      continue;
    }
    if (RIGHT_TOKENS.has(lower) && kept.length > 0) {
      handedness = "R";
      continue;
    }
    if (isNoiseToken(t)) continue;
    kept.push(t);
  }
  const name = kept.map(titleCaseWord).join(" ").trim();
  return { name, cameraView, handedness };
}

/** Just the cleaned-up player name, or `fallback` when nothing meaningful remains. */
export function cleanPlayerName(filename: string, fallback = "Pro swing"): string {
  return parseProFilename(filename).name || fallback;
}
