// Claude Opus 5.5 behind the provider interfaces: swing analysis (vision +
// structured output) and the YouTube drill finder (web search server tool).
// Server-only: needs ANTHROPIC_API_KEY. Never log request bodies.
//
// Per the Claude API guidance for Opus 5.5:
//   * thinking is always on (adaptive); depth is set with output_config.effort
//   * structured output via output_config.format (JSON schema), no prefill
//   * server-side refusal fallbacks: beta "server-side-fallback-2026-07-01" +
//     fallbacks: "default"; stop_reason "refusal" is still handled
//   * long calls stream and use .finalMessage()
//   * the constant system prompt is the cached prefix

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaContentBlockParam, BetaMessage, BetaMessageParam, BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  ModelError,
  type AnalysisOutput,
  type AnalysisProvider,
  type DrillFinder,
  type DrillSearchOutput,
  type ModelUsage,
} from "./providers.ts";
import { ANALYSIS_SYSTEM_PROMPT, DRILLS_SYSTEM_PROMPT, analysisRequestText, drillsRequestText, snapshotLabel } from "./prompts.ts";
import { ANALYSIS_JSON_SCHEMA, ResultValidationError, parseJsonText } from "./schema.ts";
import type { CheckedAnalyzeRequest } from "./validate.ts";
import { extractYouTubeIds } from "./youtube.ts";

export const OPUS_MODEL_ID = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Thinking counts toward max_tokens; leave room for it plus the report. */
const ANALYZE_MAX_TOKENS = 32000;
const DRILLS_MAX_TOKENS = 16000;
/** pause_turn continuations allowed for the web-search loop. */
const MAX_DRILL_CONTINUATIONS = 3;

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function client(): Anthropic {
  // Explicit key so no other credential source (profiles, auth tokens) is ever picked up.
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 280_000 });
}

function usageOf(u: BetaUsage | undefined | null): ModelUsage {
  if (!u) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
  };
}

function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/** Map SDK errors to a user-facing ModelError (typed classes, never string matching). */
export function toModelError(e: unknown, usage?: ModelUsage): ModelError {
  if (e instanceof ModelError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  let user = "Claude could not finish the request. Please try again in a minute.";
  if (e instanceof Anthropic.APIUserAbortError) user = "The request was cancelled.";
  else if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    user = "The Claude API key on the server is missing or invalid.";
  } else if (e instanceof Anthropic.RateLimitError) user = "Claude is rate limited right now. Please try again in a minute.";
  else if (e instanceof Anthropic.InternalServerError) user = "Claude is overloaded right now. Please try again in a minute.";
  else if (e instanceof Anthropic.APIConnectionError) user = "Could not reach Claude. Check the connection and try again.";
  else if (e instanceof Anthropic.BadRequestError) user = "Claude rejected the request (it may be too large). Try fewer snapshots.";
  return new ModelError(msg, user, usage);
}

/** Text of the final answer, after checking why the model stopped. */
function answerText(message: BetaMessage, what: string, usage: ModelUsage = usageOf(message.usage)): string {
  if (message.stop_reason === "refusal") {
    throw new ModelError(
      `refusal (${message.stop_details?.category ?? "no category"})`,
      `Claude declined to write the ${what}. Try different snapshots or notes.`,
      usage,
      message.model,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new ModelError("max_tokens", `The ${what} was cut off. Try fewer snapshots.`, usage, message.model);
  }
  const text = message.content
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new ModelError("empty answer", `Claude returned an empty ${what}. Please try again.`, usage, message.model);
  return text;
}

function parseAnswer(text: string, message: BetaMessage, what: string, usage: ModelUsage = usageOf(message.usage)): unknown {
  try {
    return parseJsonText(text);
  } catch (e) {
    if (e instanceof ResultValidationError) {
      throw new ModelError(e.message, `The ${what} came back in an unexpected format. Please try again.`, usage, message.model);
    }
    throw e;
  }
}

/** Build the single user turn: each snapshot's label then its image, then the details. */
export function buildAnalysisContent(req: CheckedAnalyzeRequest): BetaContentBlockParam[] {
  const content: BetaContentBlockParam[] = [];
  req.snapshots.forEach((s, i) => {
    content.push({ type: "text", text: snapshotLabel(s, i, req.snapshots.length) });
    content.push({ type: "image", source: { type: "base64", media_type: s.image.mime, data: s.image.base64 } });
  });
  content.push({ type: "text", text: analysisRequestText(req) });
  return content;
}

export class OpusAnalysisProvider implements AnalysisProvider {
  readonly model = "opus" as const;
  readonly defaultModelId = OPUS_MODEL_ID;

  async analyze(req: CheckedAnalyzeRequest, hooks: { onStatus: (m: string) => void; signal?: AbortSignal }): Promise<AnalysisOutput> {
    try {
      const stream = client().beta.messages.stream(
        {
          model: OPUS_MODEL_ID,
          max_tokens: ANALYZE_MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system: [{ type: "text", text: ANALYSIS_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          output_config: { effort: "high", format: { type: "json_schema", schema: ANALYSIS_JSON_SCHEMA } },
          messages: [{ role: "user", content: buildAnalysisContent(req) }],
        },
        { signal: hooks.signal },
      );
      let thinking = false;
      let writing = false;
      stream.on("streamEvent", (event) => {
        if (event.type !== "content_block_start") return;
        if (!thinking && (event.content_block.type === "thinking" || event.content_block.type === "redacted_thinking")) {
          thinking = true;
          hooks.onStatus("Comparing the swings to the pro…");
        } else if (!writing && event.content_block.type === "text") {
          writing = true;
          hooks.onStatus("Writing the report…");
        }
      });
      const message = await stream.finalMessage();
      const raw = parseAnswer(answerText(message, "report"), message, "report");
      return { modelId: message.model, raw, usage: usageOf(message.usage) };
    } catch (e) {
      throw toModelError(e);
    }
  }
}

/**
 * YouTube ids present in the tool results / citations the model received.
 * The model's own answer text is excluded, so a URL it made up never counts.
 */
export function searchedYouTubeIds(content: readonly BetaContentBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of content) {
    const source = block.type === "text" ? JSON.stringify(block.citations ?? []) : block.type === "thinking" ? "" : JSON.stringify(block);
    for (const id of extractYouTubeIds(source)) ids.add(id);
  }
  return ids;
}

export class OpusDrillFinder implements DrillFinder {
  readonly defaultModelId = OPUS_MODEL_ID;

  async find(input: { issues: { title: string; detail: string }[]; handedness: "L" | "R" }, signal?: AbortSignal): Promise<DrillSearchOutput> {
    const c = client();
    const messages: BetaMessageParam[] = [{ role: "user", content: drillsRequestText(input.issues, input.handedness) }];
    const seenIds = new Set<string>();
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      for (let turn = 0; ; turn++) {
        const message = await c.beta.messages
          .stream(
            {
              model: OPUS_MODEL_ID,
              max_tokens: DRILLS_MAX_TOKENS,
              betas: [FALLBACK_BETA],
              fallbacks: "default",
              system: [{ type: "text", text: DRILLS_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
              // No output_config.format here: structured outputs are incompatible with
              // citations, which web search results carry. The prompt asks for JSON
              // and parseJsonText extracts it; the result is validated after.
              output_config: { effort: "low" },
              tools: [{ type: "web_search_20260209", name: "web_search", allowed_domains: ["youtube.com"], max_uses: 5 }],
              messages,
            },
            { signal },
          )
          .finalMessage();
        usage = addUsage(usage, usageOf(message.usage));
        for (const id of searchedYouTubeIds(message.content)) seenIds.add(id);

        if (message.stop_reason === "pause_turn") {
          if (turn >= MAX_DRILL_CONTINUATIONS) {
            throw new ModelError("too many pause_turn continuations", "The video search took too long. Please try again.", usage, message.model);
          }
          // Resume: send the paused assistant turn back as-is (no extra user message).
          messages.push({ role: "assistant", content: message.content as BetaContentBlockParam[] });
          continue;
        }
        const text = answerText(message, "video list", usage);
        const raw = parseAnswer(text, message, "video list", usage);
        return { modelId: message.model, raw, seenIds, usage };
      }
    } catch (e) {
      throw toModelError(e, usage);
    }
  }
}
