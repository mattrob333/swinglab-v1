// Browser-side helpers for the AI routes (src/app/api/ai/*): request building,
// the NDJSON stream reader, status gating, YouTube embeds and report text.
//
// Everything here is framework-free and runs under node:test (tests/ai-ui-*),
// so imports are relative with explicit .ts extensions and there is no DOM
// access at module load.

import type {
  AiStatusResponse,
  AnalyzeEvent,
  AnalyzeRequest,
  AnalyzeSnapshotInput,
  DrillsRequest,
  DrillsResponse,
  TranscribeResponse,
} from "./contract.ts";
import { MAX_AUDIO_BYTES, MAX_SNAPSHOTS_PER_ANALYSIS } from "./contract.ts";
import type {
  Analysis,
  AnalysisModel,
  DrillVideo,
  Handedness,
  SwingAnalysisResult,
  SwingDrill,
  SwingIssue,
  SwingPhase,
} from "../types.ts";

export const MODEL_LABEL: Record<AnalysisModel, string> = {
  opus: "Claude Opus 5.5",
  sol: "GPT-6.1 Sol",
};

/** Keep the JSON body under typical serverless body limits (~4.5 MB). */
export const MAX_ANALYZE_BODY_CHARS = 4_000_000;
export const MAX_NOTES_CHARS = 4000;
/** Longest edge tried, in order, when re-encoding snapshots to fit the body limit. */
export const ENCODE_STEPS = [1600, 1200, 900, 640] as const;
export const MAX_VOICE_NOTE_MS = 2 * 60 * 1000;

export class AiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Request building

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface SnapshotSource {
  id: string;
  blob: Blob;
  topTitle: string;
  bottomTitle: string;
  layout: "stacked" | "side";
  note: string;
}

export interface AnalyzeMeta {
  model: AnalysisModel;
  athlete: { handedness: Handedness; age: number | null; level: string };
  coachNotes: string;
  transcript: string;
}

/** Re-encodes an image so its longest edge is at most maxDim (JPEG). */
export type ImageEncoder = (blob: Blob, maxDim: number) => Promise<Blob>;

/** Composite images are side by side when clearly wider than tall. */
export function layoutForSize(width: number, height: number): "stacked" | "side" {
  return width > height * 1.1 ? "side" : "stacked";
}

export function parseAge(input: string): number | null {
  const n = Number(input.trim());
  if (!input.trim() || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 4 && r <= 99 ? r : null;
}

/**
 * Builds the POST /api/ai/analyze body: validates the snapshot count, converts
 * images to base64 and, with an encoder, shrinks them until the body fits.
 */
export async function buildAnalyzeRequest(
  sources: SnapshotSource[],
  meta: AnalyzeMeta,
  encode?: ImageEncoder,
  maxChars = MAX_ANALYZE_BODY_CHARS,
): Promise<AnalyzeRequest> {
  const unique = sources.filter((s, i) => sources.findIndex((o) => o.id === s.id) === i);
  if (unique.length === 0) throw new AiError("Pick at least one snapshot.");
  if (unique.length > MAX_SNAPSHOTS_PER_ANALYSIS) {
    throw new AiError(`Pick at most ${MAX_SNAPSHOTS_PER_ANALYSIS} snapshots.`);
  }
  const base = {
    model: meta.model,
    athlete: {
      handedness: meta.athlete.handedness,
      age: meta.athlete.age,
      level: meta.athlete.level.trim().slice(0, 60),
    },
    coachNotes: meta.coachNotes.trim().slice(0, MAX_NOTES_CHARS),
    transcript: meta.transcript.trim().slice(0, MAX_NOTES_CHARS),
  };
  const steps: (number | null)[] = encode ? [...ENCODE_STEPS] : [null];
  for (const dim of steps) {
    const snapshots: AnalyzeSnapshotInput[] = [];
    for (const s of unique) {
      const blob = dim && encode ? await encode(s.blob, dim) : s.blob;
      snapshots.push({
        id: s.id,
        imageBase64: await blobToBase64(blob),
        topTitle: s.topTitle,
        bottomTitle: s.bottomTitle,
        layout: s.layout,
        note: s.note.trim().slice(0, 1000),
      });
    }
    const request: AnalyzeRequest = { ...base, snapshots };
    if (JSON.stringify(request).length <= maxChars) return request;
  }
  throw new AiError("These snapshots are too large to send. Try fewer snapshots.");
}

// ---------------------------------------------------------------------------
// NDJSON stream

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const PHASES: SwingPhase[] = ["stance", "load", "stride", "launch", "contact", "extension", "finish", "other"];
const str = (x: unknown) => (typeof x === "string" ? x : "");
const strArr = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

/** Coerces a model result into the frozen shape (missing lists become empty). */
export function normalizeResult(x: unknown): SwingAnalysisResult | null {
  if (!isObj(x)) return null;
  const issues: SwingIssue[] = (Array.isArray(x.issues) ? x.issues : []).filter(isObj).map((i) => ({
    title: str(i.title),
    detail: str(i.detail),
    phase: PHASES.includes(i.phase as SwingPhase) ? (i.phase as SwingPhase) : "other",
    severity: i.severity === "high" || i.severity === "low" ? i.severity : "medium",
    snapshotIds: strArr(i.snapshotIds),
  }));
  const drills: SwingDrill[] = (Array.isArray(x.drills) ? x.drills : []).filter(isObj).map((d) => ({
    name: str(d.name),
    why: str(d.why),
    howTo: str(d.howTo),
    reps: str(d.reps),
  }));
  return {
    summary: str(x.summary),
    strengths: strArr(x.strengths),
    issues,
    drills,
    cues: strArr(x.cues),
    nextFocus: str(x.nextFocus),
  };
}

/** Parses one NDJSON line into an event; null for blank or unrecognised lines. */
export function parseEventLine(line: string): AnalyzeEvent | null {
  const t = line.trim();
  if (!t) return null;
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  if (v.type === "status" && typeof v.message === "string") return { type: "status", message: v.message };
  if (v.type === "error") return { type: "error", message: str(v.message) || "The analysis failed." };
  if (v.type === "result") {
    const result = normalizeResult(v.result);
    if (!result) return null;
    return { type: "result", modelId: str(v.modelId), result };
  }
  return null;
}

/** Incremental NDJSON parser: feed text chunks, get complete events back. */
export class NdjsonParser {
  private buf = "";
  push(chunk: string): AnalyzeEvent[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    return lines.map(parseEventLine).filter((e): e is AnalyzeEvent => e !== null);
  }
  flush(): AnalyzeEvent[] {
    const rest = this.buf;
    this.buf = "";
    const e = parseEventLine(rest);
    return e ? [e] : [];
  }
}

export interface AnalyzeOutcome {
  modelId: string;
  result: SwingAnalysisResult;
}

/** Reads the analyze stream to its result, reporting status events as they arrive. */
export async function readAnalyzeStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: AnalyzeEvent) => void = () => {},
): Promise<AnalyzeOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new NdjsonParser();
  let outcome: AnalyzeOutcome | null = null;
  let error: string | null = null;
  const handle = (events: AnalyzeEvent[]) => {
    for (const e of events) {
      onEvent(e);
      if (e.type === "result") outcome = { modelId: e.modelId, result: e.result };
      else if (e.type === "error") error = e.message;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    handle(parser.push(decoder.decode(value, { stream: true })));
  }
  handle(parser.push(decoder.decode()));
  handle(parser.flush());
  if (outcome) return outcome;
  throw new AiError(error ?? "The analysis ended before a report arrived. Try again.");
}

// ---------------------------------------------------------------------------
// HTTP

type FetchLike = typeof fetch;

const STATUS_MESSAGES: Record<number, string> = {
  401: "Sign in to use AI analysis.",
  403: "AI analysis isn't enabled for this account.",
  404: "AI isn't set up on this server yet.",
  413: "That's too much to send at once. Try fewer snapshots or a shorter voice note.",
  429: "Daily AI limit reached. Try again tomorrow.",
};

export async function errorFromResponse(res: Response): Promise<AiError> {
  let message = "";
  try {
    const text = await res.text();
    try {
      const j: unknown = JSON.parse(text);
      if (isObj(j)) message = str(j.error) || str(j.message) || str(j.reason);
    } catch {
      // A JSON error body is optional; the NDJSON error line is also accepted.
      const e = parseEventLine(text.split("\n")[0] ?? "");
      if (e?.type === "error") message = e.message;
    }
  } catch {
    // body unreadable
  }
  return new AiError(message || STATUS_MESSAGES[res.status] || `AI request failed (${res.status}).`, res.status);
}

function networkError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (isObj(e) && e.name === "AbortError") return new AiError("Cancelled.");
  return new AiError("Couldn't reach the server. Check your connection and try again.");
}

export interface RunAnalysisOptions {
  request: AnalyzeRequest;
  /** Client-generated Analysis id, sent as x-analysis-id. */
  analysisId: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
  fetchImpl?: FetchLike;
}

export async function runAnalysis(o: RunAnalysisOptions): Promise<AnalyzeOutcome> {
  const f = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f("/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-analysis-id": o.analysisId },
      body: JSON.stringify(o.request),
      signal: o.signal,
    });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) {
    const text = await res.text();
    const parser = new NdjsonParser();
    const events = [...parser.push(text), ...parser.flush()];
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join("\n")));
        c.close();
      },
    });
    return readAnalyzeStream(stream, (e) => e.type === "status" && o.onStatus?.(e.message));
  }
  try {
    return await readAnalyzeStream(res.body, (e) => e.type === "status" && o.onStatus?.(e.message));
  } catch (e) {
    throw networkError(e);
  }
}

/** Normalises GET /api/ai/status; any failure reads as "unavailable" with a reason. */
export async function fetchAiStatus(fetchImpl: FetchLike = fetch): Promise<AiStatusResponse> {
  const unavailable = (reason: string): AiStatusResponse => ({
    available: false,
    models: [],
    transcribe: false,
    drills: false,
    reason,
    remainingToday: null,
  });
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/status", { cache: "no-store" });
  } catch {
    return unavailable("AI needs a connection.");
  }
  if (res.status === 404) return unavailable(STATUS_MESSAGES[404]);
  if (!res.ok) {
    const err = await errorFromResponse(res);
    return unavailable(err.message);
  }
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    return unavailable("AI isn't set up on this server yet.");
  }
  if (!isObj(j)) return unavailable("AI isn't set up on this server yet.");
  const models = strArr(j.models).filter((m): m is AnalysisModel => m === "opus" || m === "sol");
  const available = j.available === true;
  return {
    available,
    models: available && models.length === 0 ? ["opus"] : models,
    transcribe: j.transcribe === true,
    drills: j.drills === true,
    reason: typeof j.reason === "string" ? j.reason : available ? null : "AI analysis isn't available.",
    remainingToday: typeof j.remainingToday === "number" ? j.remainingToday : null,
  };
}

export type AiFeature = "analyze" | "transcribe" | "drills";

export interface AiGate {
  enabled: boolean;
  /** Why the feature is disabled (null when enabled). */
  reason: string | null;
}

/** Whether a feature can be used right now, and if not, a short reason for the UI. */
export function aiGate(status: AiStatusResponse | null, online: boolean, feature: AiFeature, model?: AnalysisModel): AiGate {
  const off = (reason: string): AiGate => ({ enabled: false, reason });
  if (!online) return off(feature === "transcribe" ? "Voice notes need a connection." : "AI needs a connection.");
  if (!status) return off("Checking AI…");
  if (!status.available) return off(status.reason || "AI analysis isn't available.");
  if (feature === "analyze") {
    if (status.remainingToday !== null && status.remainingToday <= 0) return off("Daily AI limit reached. Try again tomorrow.");
    if (model && !status.models.includes(model)) return off(`${MODEL_LABEL[model]} isn't available.`);
  }
  if (feature === "transcribe" && !status.transcribe) return off("Voice notes aren't available.");
  if (feature === "drills" && !status.drills) return off("Drill search isn't available.");
  return { enabled: true, reason: null };
}

export async function transcribeAudio(blob: Blob, mime: string, signal?: AbortSignal, fetchImpl: FetchLike = fetch): Promise<string> {
  if (blob.size === 0) throw new AiError("Nothing was recorded.");
  if (blob.size > MAX_AUDIO_BYTES) throw new AiError("That voice note is too long.");
  const form = new FormData();
  form.append("file", blob, `voice-note.${extForAudioMime(mime)}`);
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/transcribe", { method: "POST", body: form, signal });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await errorFromResponse(res);
  const j = (await res.json().catch(() => null)) as Partial<TranscribeResponse> | null;
  return typeof j?.text === "string" ? j.text.trim() : "";
}

export async function findDrillVideos(req: DrillsRequest, fetchImpl: FetchLike = fetch): Promise<DrillVideo[]> {
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/drills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await errorFromResponse(res);
  const j = (await res.json().catch(() => null)) as Partial<DrillsResponse> | null;
  const videos = Array.isArray(j?.videos) ? j.videos : [];
  return videos
    .filter(isObj)
    .map((v) => ({ title: str(v.title), url: str(v.url), channel: str(v.channel), why: str(v.why) }))
    .filter((v) => /^https?:\/\//.test(v.url));
}

// ---------------------------------------------------------------------------
// Audio

const AUDIO_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/ogg;codecs=opus"];

/** First recorder mime the browser supports (webm on Chrome, mp4 on older Safari); "" lets it choose. */
export function pickAudioMime(isTypeSupported: (mime: string) => boolean): string {
  for (const m of AUDIO_MIMES) {
    try {
      if (isTypeSupported(m)) return m;
    } catch {
      // some browsers throw on unknown types
    }
  }
  return "";
}

export function extForAudioMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "m4a";
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Appends dictated text to an existing note with sensible spacing. */
export function appendText(current: string, addition: string): string {
  const a = addition.trim();
  if (!a) return current;
  const c = current.replace(/\s+$/, "");
  if (!c) return a;
  return /[.!?]$/.test(c) ? `${c} ${a}` : `${c}. ${a}`;
}

// ---------------------------------------------------------------------------
// YouTube

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id of a YouTube URL, or null. */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&autoplay=1`;
}

// ---------------------------------------------------------------------------
// Report helpers

export const SEVERITY_ORDER = ["high", "medium", "low"] as const;
export const SEVERITY_LABEL: Record<SwingIssue["severity"], string> = {
  high: "Fix first",
  medium: "Work on",
  low: "Keep an eye on",
};
export const PHASE_LABEL: Record<SwingPhase, string> = {
  stance: "Stance",
  load: "Load",
  stride: "Stride",
  launch: "Launch",
  contact: "Contact",
  extension: "Extension",
  finish: "Finish",
  other: "Other",
};

export function groupIssuesBySeverity(issues: SwingIssue[]): { severity: SwingIssue["severity"]; issues: SwingIssue[] }[] {
  return SEVERITY_ORDER.map((severity) => ({ severity, issues: issues.filter((i) => i.severity === severity) })).filter(
    (g) => g.issues.length > 0,
  );
}

/** Plain-text report for navigator.share / clipboard. */
export function analysisShareText(a: Pick<Analysis, "model" | "createdAt" | "result" | "drillVideos">): string {
  const r = a.result;
  const date = new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const lines = [`SwingLab swing report · ${date} · ${MODEL_LABEL[a.model]}`];
  if (!r) return lines.join("\n");
  if (r.summary) lines.push("", r.summary);
  if (r.strengths.length) lines.push("", "Strengths:", ...r.strengths.map((s) => `+ ${s}`));
  for (const g of groupIssuesBySeverity(r.issues)) {
    lines.push("", `${SEVERITY_LABEL[g.severity]}:`, ...g.issues.map((i) => `- ${i.title} (${PHASE_LABEL[i.phase]}): ${i.detail}`));
  }
  if (r.drills.length) lines.push("", "Drills:", ...r.drills.map((d) => `• ${d.name}${d.reps ? ` (${d.reps})` : ""}: ${d.howTo}`));
  if (r.cues.length) lines.push("", `Cues: ${r.cues.map((c) => `"${c}"`).join(" · ")}`);
  if (r.nextFocus) lines.push("", `Next focus: ${r.nextFocus}`);
  if (a.drillVideos.length) lines.push("", "Videos:", ...a.drillVideos.map((v) => `${v.title} ${v.url}`));
  return lines.join("\n");
}

export function drillsRequestFor(result: SwingAnalysisResult, handedness: Handedness): DrillsRequest {
  const sorted = [...result.issues].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return { issues: sorted.slice(0, 5).map((i) => ({ title: i.title, detail: i.detail })), handedness };
}
