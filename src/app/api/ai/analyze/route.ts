// POST /api/ai/analyze  (AnalyzeRequest JSON; optional header x-analysis-id: <uuid>)
//
// Pre-flight failures are plain JSON `{ error }` with a 4xx/5xx status:
// 400 invalid input, 401 signed out, 413 too large, 429 daily cap, 503 not
// configured. Once the model call starts the response is 200 NDJSON
// (AnalyzeEvent per line): status events, then exactly one result or error.
// When signed in and x-analysis-id is sent, the finished analysis is also
// stored in the `analyses` table under that id so it syncs to other devices.

import { NDJSON_HEADERS, ndjsonStream } from "@/lib/ai/ndjson";
import { OpusAnalysisProvider } from "@/lib/ai/anthropic";
import { readJsonLimited } from "@/lib/ai/http";
import { SolAnalysisProvider } from "@/lib/ai/openai";
import { runAnalyze } from "@/lib/ai/run";
import { kindAvailable } from "@/lib/ai/guard";
import { authorizeAi, insertAnalysis, jsonError, keyPresence } from "@/lib/ai/server";
import { MAX_ANALYZE_BODY_BYTES, isUuid, parseAnalyzeRequest } from "@/lib/ai/validate";

// Opus at effort "high" over six images can take a few minutes.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const headerId = request.headers.get("x-analysis-id");
  if (headerId !== null && !isUuid(headerId)) return jsonError(400, "x-analysis-id must be a UUID.");
  const analysisId = headerId?.toLowerCase() ?? null;

  // Authenticate before reading the (large) body.
  const auth = await authorizeAi("analyze");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const body = await readJsonLimited(request, MAX_ANALYZE_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);
  const parsed = parseAnalyzeRequest(body.body);
  if (!parsed.ok) return jsonError(400, parsed.error);
  const req = parsed.value;
  if (!kindAvailable("analyze", keyPresence(), req.model)) {
    return jsonError(503, `${req.model === "sol" ? "GPT-6.1 Sol" : "Claude Opus 5.5"} is not set up on this server (missing API key).`);
  }

  const provider = req.model === "sol" ? new SolAnalysisProvider() : new OpusAnalysisProvider();
  const stream = ndjsonStream((emit) =>
    runAnalyze(
      req,
      {
        provider,
        recordUsage: ctx.recordUsage,
        signal: request.signal,
        saveAnalysis:
          ctx.mode === "user" && analysisId
            ? ({ modelId, result }) =>
                insertAnalysis(ctx, {
                  id: analysisId,
                  snapshotIds: req.snapshots.map((s) => s.id),
                  model: req.model,
                  modelId,
                  coachNotes: req.coachNotes,
                  transcript: req.transcript,
                  result,
                })
            : undefined,
      },
      emit,
    ),
  );
  return new Response(stream, { headers: { ...NDJSON_HEADERS, "X-AI-Remaining-Today": String(ctx.remaining) } });
}
