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
