// Shared domain types for SwingLab 2026. Every module imports from here; change
// this file only with care, since the player, capture, store and sync layers all
// depend on it.

export type Handedness = "L" | "R";

export type ClipKind = "pro" | "athlete";

export type CameraView = "open" | "closed" | "behind" | "front" | "other";

/** Non-destructive framing applied when a clip is drawn in a pane. */
export interface Crop {
  /** Zoom factor, 1 = fit. Clamped to [1, 6]. */
  scale: number;
  /** Pan offset as a fraction of the pane size, applied after scaling. */
  x: number;
  y: number;
}

export const DEFAULT_CROP: Crop = { scale: 1, x: 0, y: 0 };

export type SyncState = "local" | "queued" | "uploading" | "synced" | "error";

export interface Clip {
  id: string;
  kind: ClipKind;
  /** Pro player name, or a label like "Swing · Sep 30 4:12 PM". */
  title: string;
  handedness: Handedness;
  cameraView: CameraView;
  /** Duration of the playable (processed, or original if unprocessed) file, seconds. */
  durationSec: number;
  /** Detected frame rate of the playable file, or null if unknown. */
  fps: number | null;
  width: number;
  height: number;
  /**
   * How much slower than real time the file plays. 1 = real time. An iPhone
   * slo-mo export played at 30fps from a 240fps capture has sloMoFactor 8.
   */
  sloMoFactor: number;
  /** Trim window in seconds on the playable file. */
  trimStart: number;
  trimEnd: number;
  crop: Crop;
  /** True once the seek-friendly proxy exists and is the playable file. */
  processed: boolean;
  createdAt: string;
  updatedAt: string;
  /** Supabase user id of the owner; null for clips created before sign-in. */
  ownerId: string | null;
  /** Storage object path of the playable file once synced. */
  remotePath: string | null;
  remoteThumbPath: string | null;
  syncState: SyncState;
  notes: string;
}

/** Binary payloads stored alongside a clip on the device. */
export type ClipBlobVariant = "original" | "playable" | "thumb";

export interface Snapshot {
  id: string;
  createdAt: string;
  /** Composite PNG/JPEG of both panes exactly as shown (flip + crop applied). */
  imageType: string;
  topClipId: string | null;
  bottomClipId: string | null;
  /** Source-file times (seconds) of each pane when captured. */
  topTime: number | null;
  bottomTime: number | null;
  topFlipped: boolean;
  bottomFlipped: boolean;
  note: string;
  ownerId: string | null;
  remotePath: string | null;
  syncState: SyncState;
}

/** Per-device compare-screen state, persisted in localStorage. */
export interface CompareState {
  topClipId: string | null;
  bottomClipId: string | null;
  topTime: number;
  bottomTime: number;
  topFlipped: boolean;
  bottomFlipped: boolean;
  /** When linked, both panes move together in real (slo-mo corrected) seconds. */
  linked: boolean;
  layout: "stacked" | "side";
}

// ---------------------------------------------------------------------------
// AI analysis (phase 2). Analyses are generated server-side from snapshots and
// the coach's notes, then cached on the device like everything else.

/** Which model family produced an analysis. "opus" = Claude Opus 5.5, "sol" = GPT-6.1 Sol. */
export type AnalysisModel = "opus" | "sol";

export type SwingPhase = "stance" | "load" | "stride" | "launch" | "contact" | "extension" | "finish" | "other";

export interface SwingIssue {
  title: string;
  detail: string;
  phase: SwingPhase;
  severity: "high" | "medium" | "low";
  /** Snapshot ids that show this issue. */
  snapshotIds: string[];
}

export interface SwingDrill {
  name: string;
  why: string;
  howTo: string;
  reps: string;
}

export interface DrillVideo {
  title: string;
  url: string;
  channel: string;
  why: string;
}

/** Structured coaching report. The shape both models must return. */
export interface SwingAnalysisResult {
  summary: string;
  strengths: string[];
  issues: SwingIssue[];
  drills: SwingDrill[];
  /** Short verbal cues the hitter can take into the next at-bat. */
  cues: string[];
  nextFocus: string;
}

export interface Analysis {
  id: string;
  createdAt: string;
  snapshotIds: string[];
  model: AnalysisModel;
  /** Exact model id reported by the API, e.g. "claude-opus-5-5". */
  modelId: string;
  coachNotes: string;
  /** Transcript of a voice note recorded for this analysis, if any. */
  transcript: string;
  result: SwingAnalysisResult | null;
  drillVideos: DrillVideo[];
  status: "pending" | "done" | "error";
  error: string | null;
  ownerId: string | null;
  syncState: SyncState;
}
