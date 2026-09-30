// POST /api/ai/drills  (DrillsRequest JSON) -> DrillsResponse
// Claude Opus 5.5 + web search restricted to youtube.com. Only videos whose
// URL appeared in the search results are returned (never invented links).
// Errors: JSON `{ error }` with 400/401/413/429/502/503.

import type { DrillsResponse } from "@/lib/ai/contract";
import { OpusDrillFinder } from "@/lib/ai/anthropic";
import { readJsonLimited } from "@/lib/ai/http";
import { runDrills } from "@/lib/ai/run";
import { authorizeAi, jsonError } from "@/lib/ai/server";
import { MAX_DRILLS_BODY_BYTES, parseDrillsRequest } from "@/lib/ai/validate";

// A few searches plus a short answer at effort "low".
export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAi("drills");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const body = await readJsonLimited(request, MAX_DRILLS_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);
  const parsed = parseDrillsRequest(body.body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const outcome = await runDrills(parsed.value, { finder: new OpusDrillFinder(), recordUsage: ctx.recordUsage, signal: request.signal });
  if (!outcome.ok) return jsonError(outcome.status, outcome.error);
  const res: DrillsResponse = { videos: outcome.videos };
  return Response.json(res, { headers: { "Cache-Control": "no-store", "X-AI-Remaining-Today": String(ctx.remaining) } });
}
