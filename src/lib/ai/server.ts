// Server glue for the AI routes: authentication, per-user daily cap, usage
// records and the server-side analysis insert. Uses the caller's own Supabase
// session (their JWT), so every read/write here is subject to RLS; no secret
// or service-role key is involved.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, getServerUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AnalysisModel, SwingAnalysisResult } from "@/lib/types";
import type { AiStatusResponse } from "./contract";
import { hasAnthropicKey } from "./anthropic";
import { hasOpenAiKey } from "./openai";
import {
  capabilities,
  decideAccess,
  decideRate,
  kindAvailable,
  parseDailyLimit,
  remainingToday,
  utcDayStart,
  type AiKind,
  type KeyPresence,
} from "./guard";
import type { RecordUsage } from "./run";

/** The Database types in src/lib/supabase do not list the AI tables yet; use an untyped client. */
type Db = SupabaseClient;

export function keyPresence(): KeyPresence {
  return { anthropic: hasAnthropicKey(), openai: hasOpenAiKey() };
}

export function dailyLimit(): number {
  return parseDailyLimit(process.env.AI_DAILY_LIMIT);
}

/** JSON error response used by every AI route: `{ error: string }`. */
export function jsonError(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// Local-only development mode has no database: count in memory (per server process).
const localUsage = { day: "", count: 0 };
function localUsedToday(): number {
  const day = utcDayStart();
  if (localUsage.day !== day) {
    localUsage.day = day;
    localUsage.count = 0;
  }
  return localUsage.count;
}

async function usedToday(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", utcDayStart());
  if (error) throw error;
  return count ?? 0;
}

export interface AiContext {
  mode: "user" | "local";
  userId: string | null;
  db: Db | null;
  /** Requests left today after this one. */
  remaining: number;
  recordUsage: RecordUsage;
}

type Identity =
  | { ok: true; mode: "user"; userId: string; db: Db }
  | { ok: true; mode: "local" }
  | { ok: false; status: 401 | 503; reason: string };

async function identify(): Promise<Identity> {
  const configured = isSupabaseConfigured();
  const user = configured ? await getServerUser() : null;
  const access = decideAccess({
    supabaseConfigured: configured,
    nodeEnv: process.env.NODE_ENV,
    allowLocal: process.env.AI_ALLOW_LOCAL,
    userId: user?.id ?? null,
  });
  if (!access.ok) return access;
  if (access.mode === "local") return access;
  const db = (await createSupabaseServerClient()) as unknown as Db | null;
  if (!db) return { ok: false, status: 503, reason: "Sign-in is not available on this server." };
  return { ok: true, mode: "user", userId: access.userId, db };
}

/**
 * Gate for a paid AI call: signed in (or allowed local dev), key configured
 * for the feature, under the daily cap. Returns a ready context or the error
 * Response to send.
 */
export async function authorizeAi(kind: AiKind, model?: AnalysisModel): Promise<{ ok: true; ctx: AiContext } | { ok: false; response: Response }> {
  const who = await identify();
  if (!who.ok) return { ok: false, response: jsonError(who.status, who.reason) };

  if (!kindAvailable(kind, keyPresence(), model)) {
    const what = kind === "analyze" ? (model === "sol" ? "GPT-6.1 Sol" : "Claude Opus 5.5") : kind === "transcribe" ? "Voice-note transcription" : "Drill video search";
    return { ok: false, response: jsonError(503, `${what} is not set up on this server (missing API key).`) };
  }

  const limit = dailyLimit();
  let used: number;
  try {
    used = who.mode === "user" ? await usedToday(who.db, who.userId) : localUsedToday();
  } catch {
    return { ok: false, response: jsonError(503, "Could not check today's AI usage. Please try again.") };
  }
  const rate = decideRate(used, limit);
  if (!rate.ok) return { ok: false, response: jsonError(rate.status, rate.reason) };

  if (who.mode === "local") {
    localUsage.count++; // reserve now; concurrent local requests cannot overshoot
    return { ok: true, ctx: { mode: "local", userId: null, db: null, remaining: rate.remaining, recordUsage: async () => {} } };
  }

  const { db, userId } = who;
  const recordUsage: RecordUsage = async (u) => {
    const { error } = await db.from("ai_usage").insert({
      user_id: userId,
      kind: u.kind,
      model_id: u.modelId.slice(0, 100),
      input_tokens: Math.max(0, Math.round(u.inputTokens)),
      output_tokens: Math.max(0, Math.round(u.outputTokens)),
    });
    if (error) throw error;
  };
  return { ok: true, ctx: { mode: "user", userId, db, remaining: rate.remaining, recordUsage } };
}

/** Store a finished analysis so it syncs to the user's other devices. */
export async function insertAnalysis(
  ctx: AiContext,
  a: {
    id: string;
    snapshotIds: string[];
    model: AnalysisModel;
    modelId: string;
    coachNotes: string;
    transcript: string;
    result: SwingAnalysisResult;
  },
): Promise<void> {
  if (ctx.mode !== "user" || !ctx.db || !ctx.userId) return;
  const now = new Date().toISOString();
  const { error } = await ctx.db.from("analyses").upsert({
    id: a.id,
    owner_id: ctx.userId,
    snapshot_ids: a.snapshotIds,
    model: a.model,
    model_id: a.modelId,
    coach_notes: a.coachNotes,
    transcript: a.transcript,
    result: a.result,
    drill_videos: [],
    status: "done",
    error: null,
    created_at: now,
    deleted_at: null,
  });
  if (error) throw error;
}

/** GET /api/ai/status for the current caller. */
export async function aiStatus(): Promise<AiStatusResponse> {
  const who = await identify();
  const caps = capabilities(keyPresence());
  const none: AiStatusResponse = { available: false, models: [], transcribe: false, drills: false, reason: null, remainingToday: null };
  if (!who.ok) return { ...none, reason: who.reason };

  const limit = dailyLimit();
  let remaining: number | null = null;
  try {
    remaining = remainingToday(who.mode === "user" ? await usedToday(who.db, who.userId) : localUsedToday(), limit);
  } catch {
    remaining = null;
  }

  const anyFeature = caps.models.length > 0;
  let reason: string | null = null;
  if (!anyFeature) reason = "AI coaching is not set up on this server (no API keys).";
  else if (limit === 0) reason = "AI coaching is turned off on this server.";
  else if (remaining === 0) reason = `Daily AI limit reached (${limit} requests). It resets at midnight UTC.`;

  return {
    available: anyFeature && limit > 0 && remaining !== 0,
    models: caps.models,
    transcribe: caps.transcribe,
    drills: caps.drills,
    reason,
    remainingToday: remaining,
  };
}
