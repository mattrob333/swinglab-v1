// HTTP contract between the AI route handlers (src/app/api/ai/*) and the UI.
// Pure types plus tiny helpers; safe to import from client and server.

import type { AnalysisModel, DrillVideo, Handedness, SwingAnalysisResult } from "@/lib/types";

export interface AnalyzeSnapshotInput {
  id: string;
  /** JPEG as base64 (no data: prefix). The composite image shows pro and athlete. */
  imageBase64: string;
  topTitle: string;
  bottomTitle: string;
  /** Which pane is the pro and which is the athlete, as shown in the image. */
  layout: "stacked" | "side";
  note: string;
}

/** POST /api/ai/analyze */
export interface AnalyzeRequest {
  model: AnalysisModel;
  snapshots: AnalyzeSnapshotInput[];
  athlete: { handedness: Handedness; age: number | null; level: string };
  coachNotes: string;
  transcript: string;
}

/**
 * The analyze endpoint streams newline-delimited JSON events so the UI can show
 * progress during a long model call.
 */
export type AnalyzeEvent =
  | { type: "status"; message: string }
  | { type: "result"; modelId: string; result: SwingAnalysisResult }
  | { type: "error"; message: string };

/** POST /api/ai/transcribe  (multipart form: file=<audio blob>) */
export interface TranscribeResponse {
  text: string;
}

/** POST /api/ai/drills */
export interface DrillsRequest {
  /** Issues to find training videos for (title + detail). */
  issues: { title: string; detail: string }[];
  handedness: Handedness;
}

export interface DrillsResponse {
  videos: DrillVideo[];
}

/** GET /api/ai/status: whether AI is available to the current user. */
export interface AiStatusResponse {
  available: boolean;
  models: AnalysisModel[];
  transcribe: boolean;
  drills: boolean;
  /** Why AI is unavailable, for the UI to explain (not signed in, no API key...). */
  reason: string | null;
  remainingToday: number | null;
}

export const MAX_SNAPSHOTS_PER_ANALYSIS = 6;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
