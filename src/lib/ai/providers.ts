// Small interfaces in front of the model APIs, so route logic can be tested
// with fakes (no real API calls, no cost). Real implementations:
// ./anthropic.ts (Claude Opus 5.5) and ./openai.ts (GPT-6.1 Sol, transcription).

import type { AnalysisModel, Handedness } from "../types.ts";
import type { CheckedAnalyzeRequest } from "./validate.ts";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * A model call that failed in a way the user should hear about. `userMessage`
 * is safe to show; `usage` is whatever the call consumed before failing.
 */
export class ModelError extends Error {
  readonly userMessage: string;
  readonly usage: ModelUsage;
  readonly modelId: string | null;
  constructor(message: string, userMessage: string, usage: ModelUsage = NO_USAGE, modelId: string | null = null) {
    super(message);
    this.name = "ModelError";
    this.userMessage = userMessage;
    this.usage = usage;
    this.modelId = modelId;
  }
}

export interface AnalysisOutput {
  /** Exact model id reported by the API (a fallback model when one served the request). */
  modelId: string;
  /** Parsed JSON the model returned; validated by the caller. */
  raw: unknown;
  usage: ModelUsage;
}

export interface AnalysisProvider {
  readonly model: AnalysisModel;
  /** Model id used for usage records when the call fails before reporting one. */
  readonly defaultModelId: string;
  analyze(req: CheckedAnalyzeRequest, hooks: { onStatus: (message: string) => void; signal?: AbortSignal }): Promise<AnalysisOutput>;
}

export interface DrillSearchOutput {
  modelId: string;
  /** Parsed JSON the model returned ({ videos: [...] }). */
  raw: unknown;
  /** YouTube video ids that appeared in the search results the model saw. */
  seenIds: Set<string>;
  usage: ModelUsage;
}

export interface DrillFinder {
  readonly defaultModelId: string;
  find(
    input: { issues: { title: string; detail: string }[]; handedness: Handedness },
    signal?: AbortSignal,
  ): Promise<DrillSearchOutput>;
}

export interface TranscribeOutput {
  text: string;
  modelId: string;
  usage: ModelUsage;
}

export interface Transcriber {
  readonly defaultModelId: string;
  transcribe(audio: { data: Blob; filename: string; mime: string }, signal?: AbortSignal): Promise<TranscribeOutput>;
}
