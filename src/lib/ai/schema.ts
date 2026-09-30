// JSON schemas the models must answer with, and strict server-side parsing of
// what they return. Pure (unit tested in tests/ai-schema.test.ts).
//
// The schemas use only the subset both providers accept for strict structured
// output: every object lists all its properties as required and sets
// additionalProperties: false; no length or numeric constraints (those are
// enforced by the parsers below instead).

import type { DrillVideo, SwingAnalysisResult, SwingIssue, SwingPhase } from "../types.ts";

export const SWING_PHASES: readonly SwingPhase[] = ["stance", "load", "stride", "launch", "contact", "extension", "finish", "other"];
export const SEVERITIES: readonly SwingIssue["severity"][] = ["high", "medium", "low"];

const stringArray = { type: "array", items: { type: "string" } } as const;

/** JSON schema equivalent to SwingAnalysisResult in src/lib/types.ts. */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "issues", "drills", "cues", "nextFocus"],
  properties: {
    summary: { type: "string", description: "Two to four sentences: the overall picture, in plain words." },
    strengths: { ...stringArray, description: "Specific things the athlete already does well, visible in the snapshots." },
    issues: {
      type: "array",
      description: "The most important issues, most important first. At most five.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "phase", "severity", "snapshotIds"],
        properties: {
          title: { type: "string", description: "Short name of the issue." },
          detail: { type: "string", description: "What is visible, compared with the pro, and why it matters." },
          phase: { type: "string", enum: [...SWING_PHASES] },
          severity: { type: "string", enum: [...SEVERITIES] },
          snapshotIds: { ...stringArray, description: "Ids of the snapshots that show this issue, exactly as given." },
        },
      },
    },
    drills: {
      type: "array",
      description: "Two to four drills that address the issues.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "why", "howTo", "reps"],
        properties: {
          name: { type: "string" },
          why: { type: "string", description: "Which issue it fixes and how." },
          howTo: { type: "string", description: "Step-by-step setup a parent can run in the backyard or cage." },
          reps: { type: "string", description: "Sets/reps or time, e.g. '3 sets of 8 swings'." },
        },
      },
    },
    cues: { ...stringArray, description: "Two to four short verbal cues (a few words each) for the next at-bat." },
    nextFocus: { type: "string", description: "The one thing to work on next." },
  },
} as const;

/** Output of the drill finder. */
export const DRILLS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["videos"],
  properties: {
    videos: {
      type: "array",
      description: "Up to six YouTube videos found by web search. Only URLs that appeared in search results.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "channel", "why"],
        properties: {
          title: { type: "string" },
          url: { type: "string", description: "The exact YouTube watch URL from the search results." },
          channel: { type: "string", description: "Channel name if known, otherwise an empty string." },
          why: { type: "string", description: "One sentence: which issue this helps and why it fits this hitter." },
        },
      },
    },
  },
} as const;

// Output bounds (keep the stored report a sensible size whatever the model does).
const MAX_TEXT = 2000;
const MAX_SHORT = 300;
const MAX_ITEMS = 8;

export class ResultValidationError extends Error {}

function text(v: unknown, field: string, max = MAX_TEXT): string {
  if (typeof v !== "string") throw new ResultValidationError(`${field} must be a string`);
  const s = v.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function list<T>(v: unknown, field: string, map: (item: unknown, i: number) => T | null, max = MAX_ITEMS): T[] {
  if (!Array.isArray(v)) throw new ResultValidationError(`${field} must be an array`);
  const out: T[] = [];
  for (const [i, item] of v.entries()) {
    const m = map(item, i);
    if (m !== null) out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ResultValidationError(`${field} must be an object`);
  return v as Record<string, unknown>;
}

/**
 * Validate a model's answer against SwingAnalysisResult. Throws
 * ResultValidationError on a shape mismatch. Snapshot ids an issue cites are
 * kept only when they were actually sent (`allowedSnapshotIds`); unknown ids
 * are dropped (models occasionally invent or mangle them).
 */
export function parseAnalysisResult(raw: unknown, allowedSnapshotIds: readonly string[]): SwingAnalysisResult {
  const allowed = new Map(allowedSnapshotIds.map((id) => [id.toLowerCase(), id]));
  const r = obj(raw, "result");
  const nonEmpty = (s: string) => (s ? s : null);
  return {
    summary: text(r.summary, "summary"),
    strengths: list(r.strengths, "strengths", (s, i) => nonEmpty(text(s, `strengths[${i}]`, MAX_SHORT))),
    issues: list(r.issues, "issues", (item, i) => {
      const it = obj(item, `issues[${i}]`);
      const phase = it.phase as SwingPhase;
      if (!SWING_PHASES.includes(phase)) throw new ResultValidationError(`issues[${i}].phase is not a swing phase`);
      const severity = it.severity as SwingIssue["severity"];
      if (!SEVERITIES.includes(severity)) throw new ResultValidationError(`issues[${i}].severity is invalid`);
      const ids = list(it.snapshotIds, `issues[${i}].snapshotIds`, (id) =>
        typeof id === "string" ? (allowed.get(id.trim().toLowerCase()) ?? null) : null,
      );
      return {
        title: text(it.title, `issues[${i}].title`, MAX_SHORT),
        detail: text(it.detail, `issues[${i}].detail`),
        phase,
        severity,
        snapshotIds: [...new Set(ids)],
      };
    }),
    drills: list(r.drills, "drills", (item, i) => {
      const d = obj(item, `drills[${i}]`);
      return {
        name: text(d.name, `drills[${i}].name`, MAX_SHORT),
        why: text(d.why, `drills[${i}].why`),
        howTo: text(d.howTo, `drills[${i}].howTo`),
        reps: text(d.reps, `drills[${i}].reps`, MAX_SHORT),
      };
    }),
    cues: list(r.cues, "cues", (s, i) => nonEmpty(text(s, `cues[${i}]`, MAX_SHORT))),
    nextFocus: text(r.nextFocus, "nextFocus"),
  };
}

/** Parse model text as JSON, tolerating a ```json fence around it. */
export function parseJsonText(s: string): unknown {
  const trimmed = s.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    // Answers written without structured output (the drill search, whose web
    // results carry citations) may have prose before the JSON: use the last
    // JSON object in the text.
    const embedded = lastJsonObject(trimmed);
    if (embedded !== undefined) return embedded;
    throw new ResultValidationError("the model did not return valid JSON");
  }
}

function lastJsonObject(text: string): unknown {
  const end = text.lastIndexOf("}");
  if (end < 0) return undefined;
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1));
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // keep widening towards the start of the text
    }
    if (start === 0) break;
  }
  return undefined;
}

/** Lenient shape check for drill videos read back from storage/sync. */
export function sanitizeDrillVideos(raw: unknown): DrillVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: DrillVideo[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const d = v as Record<string, unknown>;
    if (typeof d.url !== "string" || typeof d.title !== "string") continue;
    out.push({
      title: d.title,
      url: d.url,
      channel: typeof d.channel === "string" ? d.channel : "",
      why: typeof d.why === "string" ? d.why : "",
    });
  }
  return out;
}
