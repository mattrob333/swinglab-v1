// POST /api/ai/transcribe  (multipart form: file=<audio blob>) -> TranscribeResponse
// Errors: JSON `{ error }` with 400/401/413/429/502/503.

import type { TranscribeResponse } from "@/lib/ai/contract";
import { MAX_AUDIO_BYTES } from "@/lib/ai/contract";
import { OpenAiTranscriber } from "@/lib/ai/openai";
import { ModelError, NO_USAGE } from "@/lib/ai/providers";
import { logAiError } from "@/lib/ai/run";
import { authorizeAi, jsonError } from "@/lib/ai/server";
import { checkAudio } from "@/lib/ai/validate";

export const maxDuration = 120;

/** Multipart overhead allowed on top of the audio itself. */
const FORM_OVERHEAD = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAi("transcribe");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + FORM_OVERHEAD) {
    return jsonError(413, `The voice note is larger than ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send the voice note as multipart form data (field \"file\").");
  }
  const file = form.get("file");
  const blob = file instanceof Blob ? file : null;
  const audio = checkAudio(blob);
  if (!audio.ok) return jsonError(blob && blob.size > MAX_AUDIO_BYTES ? 413 : 400, audio.error);
  if (!blob) return jsonError(400, "Missing file.");

  const transcriber = new OpenAiTranscriber();
  try {
    const out = await transcriber.transcribe({ data: blob, filename: audio.value.filename, mime: audio.value.mime }, request.signal);
    await ctx.recordUsage({ kind: "transcribe", modelId: out.modelId, ...out.usage }).catch((e) => logAiError("record usage", e));
    const res: TranscribeResponse = { text: out.text };
    return Response.json(res, { headers: { "Cache-Control": "no-store", "X-AI-Remaining-Today": String(ctx.remaining) } });
  } catch (e) {
    const usage = e instanceof ModelError ? e.usage : NO_USAGE;
    await ctx
      .recordUsage({ kind: "transcribe", modelId: transcriber.defaultModelId, ...usage })
      .catch((err) => logAiError("record usage", err));
    logAiError("transcribe", e);
    return jsonError(502, e instanceof ModelError ? e.userMessage : "Could not transcribe the voice note. Please try again.");
  }
}
