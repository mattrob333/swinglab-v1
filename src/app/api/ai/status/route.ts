// GET /api/ai/status -> AiStatusResponse for the current caller.

import { aiStatus } from "@/lib/ai/server";

export async function GET(): Promise<Response> {
  const status = await aiStatus();
  return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
}
