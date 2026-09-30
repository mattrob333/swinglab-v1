// Who may call the AI routes, and how often. Pure decisions over explicit
// inputs (tests/ai-guard.test.ts); src/lib/ai/server.ts feeds them real values.
//
// Rules:
//   * Supabase configured  -> a signed-in user is required (401 otherwise).
//   * Supabase NOT configured (local-only mode) -> allowed ONLY when
//     NODE_ENV === "development" AND AI_ALLOW_LOCAL === "1". Anything else is a
//     503: an unauthenticated deployment must never expose paid model APIs.
//   * Each user gets AI_DAILY_LIMIT requests per UTC day (default 30), counted
//     from the ai_usage table.

import type { AnalysisModel } from "../types.ts";

export type AiKind = "analyze" | "transcribe" | "drills";

export interface AccessInput {
  supabaseConfigured: boolean;
  nodeEnv: string | undefined;
  allowLocal: string | undefined;
  /** Verified user id, or null when signed out. */
  userId: string | null;
}

export type AccessDecision =
  | { ok: true; mode: "user"; userId: string }
  | { ok: true; mode: "local" }
  | { ok: false; status: 401 | 503; reason: string };

export function decideAccess({ supabaseConfigured, nodeEnv, allowLocal, userId }: AccessInput): AccessDecision {
  if (supabaseConfigured) {
    if (userId) return { ok: true, mode: "user", userId };
    return { ok: false, status: 401, reason: "Sign in to use AI coaching." };
  }
  if (nodeEnv === "development" && allowLocal === "1") return { ok: true, mode: "local" };
  return {
    ok: false,
    status: 503,
    reason: "AI coaching needs sign-in, and sign-in is not set up on this server.",
  };
}

export const DEFAULT_DAILY_LIMIT = 30;

/** AI_DAILY_LIMIT as a non-negative integer (0 turns AI off), default 30. */
export function parseDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT;
}

export type RateDecision = { ok: true; remaining: number } | { ok: false; status: 429; reason: string; remaining: 0 };

/** May one more request run, given how many ran today? `remaining` is after this request. */
export function decideRate(usedToday: number, limit: number): RateDecision {
  if (usedToday >= limit) {
    return {
      ok: false,
      status: 429,
      remaining: 0,
      reason:
        limit === 0
          ? "AI coaching is turned off on this server."
          : `Daily AI limit reached (${limit} requests). It resets at midnight UTC.`,
    };
  }
  return { ok: true, remaining: limit - usedToday - 1 };
}

/** Requests left today (for the status route), never negative. */
export function remainingToday(usedToday: number, limit: number): number {
  return Math.max(0, limit - usedToday);
}

/** Start of the current UTC day, ISO string: the rate-limit window. */
export function utcDayStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export interface KeyPresence {
  anthropic: boolean;
  openai: boolean;
}

/** What each API key unlocks. Opus analysis + drills need Anthropic; Sol + transcription need OpenAI. */
export function capabilities(keys: KeyPresence): { models: AnalysisModel[]; transcribe: boolean; drills: boolean } {
  const models: AnalysisModel[] = [];
  if (keys.anthropic) models.push("opus");
  if (keys.openai) models.push("sol");
  return { models, transcribe: keys.openai, drills: keys.anthropic };
}

/** Is the feature a route serves available with these keys? */
export function kindAvailable(kind: AiKind, keys: KeyPresence, model?: AnalysisModel): boolean {
  const caps = capabilities(keys);
  if (kind === "analyze") return model ? caps.models.includes(model) : caps.models.length > 0;
  if (kind === "transcribe") return caps.transcribe;
  return caps.drills;
}
