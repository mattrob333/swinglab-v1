// Route logic with injected dependencies (tests/ai-run.test.ts uses fakes).
// The route handlers in src/app/api/ai/* only wire real dependencies in.

import type { AnalyzeEvent } from "./contract.ts";
import type { AiKind } from "./guard.ts";
import { ModelError, NO_USAGE, type AnalysisProvider, type DrillFinder, type ModelUsage } from "./providers.ts";
import { ResultValidationError, parseAnalysisResult } from "./schema.ts";
import type { CheckedAnalyzeRequest } from "./validate.ts";
import { filterDrillVideos } from "./youtube.ts";
import type { DrillVideo, SwingAnalysisResult } from "../types.ts";

export interface UsageRecord extends ModelUsage {
  kind: AiKind;
  modelId: string;
}

export type RecordUsage = (u: UsageRecord) => Promise<void>;

/** Log an error without request data, image data or keys. */
export function logAiError(context: string, e: unknown): void {
  const err = e as { name?: string; status?: number; message?: string } | null;
  const status = typeof err?.status === "number" ? ` status=${err.status}` : "";
  const msg = typeof err?.message === "string" ? err.message.slice(0, 300) : String(e).slice(0, 300);
  console.error(`[ai] ${context}: ${err?.name ?? "Error"}${status}: ${msg}`);
}

/** Never let a bookkeeping failure break the user's request. */
async function safeRecord(record: RecordUsage, u: UsageRecord) {
  try {
    await record(u);
  } catch (e) {
    logAiError("record usage", e);
  }
}

function snapshotWord(n: number) {
  return n === 1 ? "1 snapshot" : `${n} snapshots`;
}

export interface AnalyzeDeps {
  provider: AnalysisProvider;
  recordUsage: RecordUsage;
  /** Persist the finished analysis (signed-in users with an x-analysis-id). */
  saveAnalysis?: (a: { modelId: string; result: SwingAnalysisResult }) => Promise<void>;
  signal?: AbortSignal;
}

export const GENERIC_ANALYZE_ERROR = "The analysis failed. Please try again in a minute.";

/** Runs one analysis and emits AnalyzeEvents: status..., then exactly one result or error. */
export async function runAnalyze(req: CheckedAnalyzeRequest, deps: AnalyzeDeps, emit: (e: AnalyzeEvent) => void): Promise<void> {
  const { provider } = deps;
  emit({ type: "status", message: `Looking at ${snapshotWord(req.snapshots.length)}…` });

  let out;
  try {
    out = await provider.analyze(req, { onStatus: (message) => emit({ type: "status", message }), signal: deps.signal });
  } catch (e) {
    const usage = e instanceof ModelError ? e.usage : NO_USAGE;
    const modelId = (e instanceof ModelError && e.modelId) || provider.defaultModelId;
    await safeRecord(deps.recordUsage, { kind: "analyze", modelId, ...usage });
    if (deps.signal?.aborted) return;
    logAiError(`analyze (${provider.model})`, e);
    emit({ type: "error", message: e instanceof ModelError ? e.userMessage : GENERIC_ANALYZE_ERROR });
    return;
  }

  await safeRecord(deps.recordUsage, { kind: "analyze", modelId: out.modelId, ...out.usage });

  let result: SwingAnalysisResult;
  try {
    result = parseAnalysisResult(out.raw, req.snapshots.map((s) => s.id));
  } catch (e) {
    logAiError(`analyze (${provider.model}) result`, e);
    emit({
      type: "error",
      message:
        e instanceof ResultValidationError
          ? "The report came back in an unexpected format. Please try again."
          : GENERIC_ANALYZE_ERROR,
    });
    return;
  }

  if (deps.saveAnalysis) {
    try {
      await deps.saveAnalysis({ modelId: out.modelId, result });
    } catch (e) {
      // The device keeps its own copy and sync pushes it later.
      logAiError("save analysis", e);
    }
  }
  emit({ type: "result", modelId: out.modelId, result });
}

export interface DrillsDeps {
  finder: DrillFinder;
  recordUsage: RecordUsage;
  signal?: AbortSignal;
}

export type DrillsOutcome = { ok: true; videos: DrillVideo[] } | { ok: false; status: number; error: string };

export async function runDrills(
  input: { issues: { title: string; detail: string }[]; handedness: "L" | "R" },
  deps: DrillsDeps,
): Promise<DrillsOutcome> {
  let out;
  try {
    out = await deps.finder.find(input, deps.signal);
  } catch (e) {
    const usage = e instanceof ModelError ? e.usage : NO_USAGE;
    const modelId = (e instanceof ModelError && e.modelId) || deps.finder.defaultModelId;
    await safeRecord(deps.recordUsage, { kind: "drills", modelId, ...usage });
    logAiError("drills", e);
    return { ok: false, status: 502, error: e instanceof ModelError ? e.userMessage : "Could not find drill videos. Please try again." };
  }
  await safeRecord(deps.recordUsage, { kind: "drills", modelId: out.modelId, ...out.usage });
  return { ok: true, videos: filterDrillVideos(out.raw, out.seenIds) };
}
