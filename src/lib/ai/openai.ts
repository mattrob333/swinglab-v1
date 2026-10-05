// OpenAI behind the provider interfaces: GPT-6.1 Sol as a second-opinion
// analysis (Responses API, image input, strict json_schema output) and voice
// note transcription. Server-only: needs OPENAI_API_KEY. Never log bodies.

import OpenAI, { toFile } from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import {
  ModelError,
  type AnalysisOutput,
  type AnalysisProvider,
  type ModelUsage,
  type TranscribeOutput,
  type Transcriber,
} from "./providers.ts";
import { ANALYSIS_SYSTEM_PROMPT, TRANSCRIBE_PROMPT, analysisRequestText, snapshotLabel } from "./prompts.ts";
import { ANALYSIS_JSON_SCHEMA, ResultValidationError, parseJsonText } from "./schema.ts";
import type { CheckedAnalyzeRequest } from "./validate.ts";

export const SOL_MODEL_ID = "gpt-6.1-sol";
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
const ANALYZE_MAX_OUTPUT_TOKENS = 32000;

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function transcribeModelId(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL;
}

function client(timeout: number): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout });
}

export function toOpenAiModelError(e: unknown, usage?: ModelUsage): ModelError {
  if (e instanceof ModelError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  let user = "OpenAI could not finish the request. Please try again in a minute.";
  if (e instanceof OpenAI.APIUserAbortError) user = "The request was cancelled.";
  else if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
    user = "The OpenAI API key on the server is missing or invalid.";
  } else if (e instanceof OpenAI.RateLimitError) user = "OpenAI is rate limited right now. Please try again in a minute.";
  else if (e instanceof OpenAI.InternalServerError) user = "OpenAI is having trouble right now. Please try again in a minute.";
  else if (e instanceof OpenAI.APIConnectionError) user = "Could not reach OpenAI. Check the connection and try again.";
  else if (e instanceof OpenAI.BadRequestError) user = "OpenAI rejected the request (it may be too large or in an unsupported format).";
  return new ModelError(msg, user, usage);
}

export function buildSolInput(req: CheckedAnalyzeRequest): ResponseInputContent[] {
  const content: ResponseInputContent[] = [];
  req.snapshots.forEach((s, i) => {
    content.push({ type: "input_text", text: snapshotLabel(s, i, req.snapshots.length) });
    content.push({ type: "input_image", detail: "high", image_url: `data:${s.image.mime};base64,${s.image.base64}` });
  });
  content.push({ type: "input_text", text: analysisRequestText(req) });
  return content;
}

export class SolAnalysisProvider implements AnalysisProvider {
  readonly model = "sol" as const;
  readonly defaultModelId = SOL_MODEL_ID;

  async analyze(req: CheckedAnalyzeRequest, hooks: { onStatus: (m: string) => void; signal?: AbortSignal }): Promise<AnalysisOutput> {
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      hooks.onStatus("Comparing the swings to the pro…");
      const res = await client(280_000).responses.create(
        {
          model: SOL_MODEL_ID,
          instructions: ANALYSIS_SYSTEM_PROMPT,
          input: [{ role: "user", content: buildSolInput(req) }],
          text: { format: { type: "json_schema", name: "swing_analysis", schema: ANALYSIS_JSON_SCHEMA, strict: true } },
          reasoning: { effort: "high" },
          max_output_tokens: ANALYZE_MAX_OUTPUT_TOKENS,
          store: false,
        },
        { signal: hooks.signal },
      );
      usage = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
      hooks.onStatus("Writing the report…");
      if (res.status === "incomplete") {
        throw new ModelError(`incomplete: ${res.incomplete_details?.reason ?? "unknown"}`, "The report was cut off. Try fewer snapshots.", usage, res.model);
      }
      const refused = res.output.some((item) => item.type === "message" && item.content.some((c) => c.type === "refusal"));
      if (refused) throw new ModelError("refusal", "GPT-6.1 Sol declined to write the report. Try different snapshots or notes.", usage, res.model);
      const text = res.output_text;
      if (!text?.trim()) throw new ModelError("empty answer", "GPT-6.1 Sol returned an empty report. Please try again.", usage, res.model);
      let raw: unknown;
      try {
        raw = parseJsonText(text);
      } catch (e) {
        if (e instanceof ResultValidationError) {
          throw new ModelError(e.message, "The report came back in an unexpected format. Please try again.", usage, res.model);
        }
        throw e;
      }
      return { modelId: res.model, raw, usage };
    } catch (e) {
      throw toOpenAiModelError(e, usage);
    }
  }
}

export class OpenAiTranscriber implements Transcriber {
  get defaultModelId() {
    return transcribeModelId();
  }

  async transcribe(audio: { data: Blob; filename: string; mime: string }, signal?: AbortSignal): Promise<TranscribeOutput> {
    const model = transcribeModelId();
    try {
      const file = await toFile(audio.data, audio.filename, { type: audio.mime });
      const res = await client(110_000).audio.transcriptions.create(
        {
          file,
          model,
          prompt: TRANSCRIBE_PROMPT,
          response_format: "json",
          language: "en",
        },
        { signal },
      );
      const u = res.usage;
      const usage: ModelUsage =
        u && u.type === "tokens" ? { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 } : { inputTokens: 0, outputTokens: 0 };
      return { text: (res.text ?? "").trim(), modelId: model, usage };
    } catch (e) {
      const err = toOpenAiModelError(e);
      throw new ModelError(err.message, err.userMessage, err.usage, model);
    }
  }
}
