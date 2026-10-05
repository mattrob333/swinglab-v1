// Pure sync planning: given the on-device state, the sync ledger and remote
// rows, decide what to upload, download, create, update or delete.
//
// DOM-free and framework-free (unit tested in tests/data-sync-plan.test.ts).
// The side effects live in ./engine.ts.

import type {
  Analysis,
  AnalysisModel,
  CameraView,
  Clip,
  ClipKind,
  Crop,
  DrillVideo,
  Handedness,
  Snapshot,
  SwingAnalysisResult,
  SyncState,
} from "../types.ts";

// ---------------------------------------------------------------------------
// Remote row shapes (snake_case mirror of Clip / Snapshot; see supabase/migrations)
// ---------------------------------------------------------------------------

export interface ClipRow {
  id: string;
  owner_id: string;
  kind: string;
  title: string;
  handedness: string;
  camera_view: string;
  duration_sec: number;
  fps: number | null;
  width: number;
  height: number;
  slo_mo_factor: number;
  trim_start: number;
  trim_end: number;
  crop: unknown;
  processed: boolean;
  notes: string;
  storage_path: string | null;
  thumb_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
}

export interface SnapshotRow {
  id: string;
  owner_id: string;
  image_type: string;
  top_clip_id: string | null;
  bottom_clip_id: string | null;
  top_time: number | null;
  bottom_time: number | null;
  top_flipped: boolean;
  bottom_flipped: boolean;
  note: string;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
}

export interface AnalysisRow {
  id: string;
  owner_id: string;
  snapshot_ids: string[];
  model: string;
  model_id: string;
  coach_notes: string;
  transcript: string;
  result: unknown;
  drill_videos: unknown;
  status: string;
  error: string | null;
  created_at: string;
  deleted_at: string | null;
  server_updated_at: string;
}

/** Columns the client writes (server_updated_at is stamped by a trigger). */
export type ClipUpsert = Omit<ClipRow, "server_updated_at">;
export type SnapshotUpsert = Omit<SnapshotRow, "server_updated_at">;
export type AnalysisUpsert = Omit<AnalysisRow, "server_updated_at">;

// ---------------------------------------------------------------------------
// Ledger: what this device last exchanged with the server, per signed-in user.
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  /** Owner of the remote row. */
  owner: string;
  /** Fingerprint of the metadata last pushed or pulled. */
  fp: string;
  /** server_updated_at of the remote version this device has applied. */
  rv: string | null;
  /** Signature (size:type) of the media blob last uploaded or downloaded. */
  media: string | null;
  /** Remote path of that media. */
  path: string | null;
  thumb: string | null;
  thumbPath: string | null;
}

export interface Ledger {
  version: 1;
  userId: string;
  clips: Record<string, LedgerEntry>;
  snapshots: Record<string, LedgerEntry>;
  /** Added with AI analyses; ledgers saved before that parse with an empty map. */
  analyses: Record<string, LedgerEntry>;
  /** Pull cursors: max server_updated_at applied. */
  cursor: { clips: string | null; snapshots: string | null; analyses: string | null };
  lastSyncAt: string | null;
}

export function emptyLedger(userId: string): Ledger {
  return {
    version: 1,
    userId,
    clips: {},
    snapshots: {},
    analyses: {},
    cursor: { clips: null, snapshots: null, analyses: null },
    lastSyncAt: null,
  };
}

/** Parse a stored ledger; anything malformed or for another user yields a fresh one. */
export function parseLedger(raw: string | null | undefined, userId: string): Ledger {
  if (!raw) return emptyLedger(userId);
  try {
    const v = JSON.parse(raw) as Partial<Ledger>;
    if (!v || v.version !== 1 || v.userId !== userId || typeof v.clips !== "object" || typeof v.snapshots !== "object") {
      return emptyLedger(userId);
    }
    return {
      version: 1,
      userId,
      clips: v.clips ?? {},
      snapshots: v.snapshots ?? {},
      analyses: v.analyses && typeof v.analyses === "object" ? v.analyses : {},
      cursor: {
        clips: v.cursor?.clips ?? null,
        snapshots: v.cursor?.snapshots ?? null,
        analyses: v.cursor?.analyses ?? null,
      },
      lastSyncAt: v.lastSyncAt ?? null,
    };
  } catch {
    return emptyLedger(userId);
  }
}

// ---------------------------------------------------------------------------
// Fingerprints and signatures
// ---------------------------------------------------------------------------

/** Stable fingerprint of the clip fields mirrored to the server (sync fields excluded). */
export function clipFingerprint(c: Clip): string {
  return JSON.stringify([
    c.kind, c.title, c.handedness, c.cameraView, c.durationSec, c.fps, c.width, c.height,
    c.sloMoFactor, c.trimStart, c.trimEnd, c.crop?.scale ?? 1, c.crop?.x ?? 0, c.crop?.y ?? 0,
    c.processed, c.notes,
  ]);
}

export function snapshotFingerprint(s: Snapshot): string {
  return JSON.stringify([
    s.imageType, s.topClipId, s.bottomClipId, s.topTime, s.bottomTime, s.topFlipped, s.bottomFlipped, s.note,
  ]);
}

/** Analyses have no media; everything mirrored is in the fingerprint. */
export function analysisFingerprint(a: Analysis): string {
  return JSON.stringify([
    a.snapshotIds, a.model, a.modelId, a.coachNotes, a.transcript, a.result, a.drillVideos, a.status, a.error,
  ]);
}

/** Cheap identity for a blob: size + base mime type. */
export function blobSignature(blob: { size: number; type: string } | null | undefined): string | null {
  if (!blob) return null;
  return `${blob.size}:${baseMime(blob.type)}`;
}

export function baseMime(type: string | null | undefined): string {
  return (type ?? "").split(";")[0].trim().toLowerCase();
}

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** File extension for an allowed mime type, or null if the bucket would reject it. */
export function extForMime(type: string | null | undefined): string | null {
  return EXT[baseMime(type)] ?? null;
}

/** "{owner}/{id}.{ext}" — the only object name shape the storage policies accept. */
export function objectPath(ownerId: string, id: string, mime: string): string | null {
  const ext = extForMime(mime);
  return ext ? `${ownerId}/${id}.${ext}` : null;
}

// ---------------------------------------------------------------------------
// Row <-> local mapping
// ---------------------------------------------------------------------------

export function clipToRow(
  c: Clip,
  ownerId: string,
  storagePath: string | null,
  thumbPath: string | null,
): ClipUpsert {
  return {
    id: c.id,
    owner_id: ownerId,
    kind: c.kind,
    title: c.title,
    handedness: c.handedness,
    camera_view: c.cameraView,
    duration_sec: finiteOr(c.durationSec, 0),
    fps: c.fps != null && Number.isFinite(c.fps) && c.fps > 0 ? c.fps : null,
    width: Math.max(0, Math.round(finiteOr(c.width, 0))),
    height: Math.max(0, Math.round(finiteOr(c.height, 0))),
    slo_mo_factor: c.sloMoFactor > 0 ? c.sloMoFactor : 1,
    trim_start: finiteOr(c.trimStart, 0),
    trim_end: finiteOr(c.trimEnd, 0),
    crop: { scale: finiteOr(c.crop?.scale, 1), x: finiteOr(c.crop?.x, 0), y: finiteOr(c.crop?.y, 0) },
    processed: c.processed,
    notes: c.notes ?? "",
    storage_path: storagePath,
    thumb_path: thumbPath,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: null,
  };
}

export function rowToClip(row: ClipRow, local?: Clip): Clip {
  const crop = (row.crop ?? {}) as Partial<Crop>;
  return {
    id: row.id,
    kind: (row.kind === "pro" ? "pro" : "athlete") as ClipKind,
    title: row.title,
    handedness: (row.handedness === "L" ? "L" : "R") as Handedness,
    cameraView: row.camera_view as CameraView,
    durationSec: row.duration_sec,
    fps: row.fps,
    width: row.width,
    height: row.height,
    sloMoFactor: row.slo_mo_factor,
    trimStart: row.trim_start,
    trimEnd: row.trim_end,
    crop: { scale: finiteOr(crop.scale, 1), x: finiteOr(crop.x, 0), y: finiteOr(crop.y, 0) },
    processed: row.processed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    remotePath: row.storage_path,
    remoteThumbPath: row.thumb_path,
    syncState: "synced",
    notes: row.notes ?? local?.notes ?? "",
  };
}

export function snapshotToRow(s: Snapshot, ownerId: string, storagePath: string | null, now: string): SnapshotUpsert {
  return {
    id: s.id,
    owner_id: ownerId,
    image_type: baseMime(s.imageType) === "image/png" ? "image/png" : "image/jpeg",
    top_clip_id: s.topClipId,
    bottom_clip_id: s.bottomClipId,
    top_time: s.topTime,
    bottom_time: s.bottomTime,
    top_flipped: s.topFlipped,
    bottom_flipped: s.bottomFlipped,
    note: s.note ?? "",
    storage_path: storagePath,
    created_at: s.createdAt,
    updated_at: now,
    deleted_at: null,
  };
}

export function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    imageType: row.image_type,
    topClipId: row.top_clip_id,
    bottomClipId: row.bottom_clip_id,
    topTime: row.top_time,
    bottomTime: row.bottom_time,
    topFlipped: row.top_flipped,
    bottomFlipped: row.bottom_flipped,
    note: row.note ?? "",
    ownerId: row.owner_id,
    remotePath: row.storage_path,
    syncState: "synced",
  };
}

export function analysisToRow(a: Analysis, ownerId: string): AnalysisUpsert {
  return {
    id: a.id,
    owner_id: ownerId,
    snapshot_ids: [...a.snapshotIds],
    model: a.model,
    model_id: a.modelId ?? "",
    coach_notes: a.coachNotes ?? "",
    transcript: a.transcript ?? "",
    result: a.result ?? null,
    drill_videos: Array.isArray(a.drillVideos) ? a.drillVideos : [],
    status: a.status,
    error: a.error ?? null,
    created_at: a.createdAt,
    deleted_at: null,
  };
}

export function rowToAnalysis(row: AnalysisRow): Analysis {
  const result =
    row.result && typeof row.result === "object" && !Array.isArray(row.result) ? (row.result as SwingAnalysisResult) : null;
  const drillVideos = Array.isArray(row.drill_videos)
    ? (row.drill_videos as unknown[]).filter(
        (v): v is DrillVideo =>
          !!v && typeof v === "object" && typeof (v as DrillVideo).url === "string" && typeof (v as DrillVideo).title === "string",
      )
    : [];
  const status: Analysis["status"] = row.status === "done" || row.status === "error" ? row.status : "pending";
  return {
    id: row.id,
    createdAt: row.created_at,
    snapshotIds: Array.isArray(row.snapshot_ids) ? row.snapshot_ids : [],
    model: (row.model === "sol" ? "sol" : "opus") as AnalysisModel,
    modelId: row.model_id ?? "",
    coachNotes: row.coach_notes ?? "",
    transcript: row.transcript ?? "",
    result,
    drillVideos,
    status,
    error: row.error,
    ownerId: row.owner_id,
    syncState: "synced",
  };
}

function finiteOr(v: number | null | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Push planning
// ---------------------------------------------------------------------------

const DIRTY_STATES: SyncState[] = ["local", "queued", "error", "uploading"];

export type SkipReason = "foreign" | "pro-not-admin";

export type PushDecision =
  | { action: "skip"; reason: SkipReason }
  | { action: "none" }
  | { action: "push"; owner: string; claim: boolean; uploadMedia: boolean; uploadThumb: boolean };

export interface ClipPushInput {
  clip: Clip;
  entry: LedgerEntry | undefined;
  userId: string;
  isAdmin: boolean;
  /** Signature of the blob that would be uploaded (playable, else original), null if none on device. */
  mediaSig: string | null;
  thumbSig: string | null;
}

export function planClipPush({ clip, entry, userId, isAdmin, mediaSig, thumbSig }: ClipPushInput): PushDecision {
  const owner = clip.ownerId ?? userId;
  if (owner !== userId) return { action: "skip", reason: "foreign" };
  if (clip.kind === "pro" && !isAdmin) return { action: "skip", reason: "pro-not-admin" };

  // Upload media when this exact blob has not gone up yet — this also re-uploads
  // after processing replaces the playable file (size/type change).
  const uploadMedia = mediaSig !== null && (entry?.media !== mediaSig || !clip.remotePath);
  const uploadThumb = thumbSig !== null && (entry?.thumb !== thumbSig || !clip.remoteThumbPath);
  const metaDirty =
    !entry || entry.fp !== clipFingerprint(clip) || DIRTY_STATES.includes(clip.syncState) || clip.ownerId === null;

  if (!uploadMedia && !uploadThumb && !metaDirty) return { action: "none" };
  // Nothing to upload yet and never pushed: wait until the media exists locally.
  if (!entry && mediaSig === null) return { action: "none" };
  return { action: "push", owner, claim: clip.ownerId === null, uploadMedia, uploadThumb };
}

export interface SnapshotPushInput {
  snapshot: Snapshot;
  entry: LedgerEntry | undefined;
  userId: string;
  imageSig: string | null;
}

export function planSnapshotPush({ snapshot, entry, userId, imageSig }: SnapshotPushInput): PushDecision {
  const owner = snapshot.ownerId ?? userId;
  if (owner !== userId) return { action: "skip", reason: "foreign" };
  const uploadMedia = imageSig !== null && (entry?.media !== imageSig || !snapshot.remotePath);
  const metaDirty =
    !entry ||
    entry.fp !== snapshotFingerprint(snapshot) ||
    DIRTY_STATES.includes(snapshot.syncState) ||
    snapshot.ownerId === null;
  if (!uploadMedia && !metaDirty) return { action: "none" };
  if (!entry && imageSig === null) return { action: "none" };
  return { action: "push", owner, claim: snapshot.ownerId === null, uploadMedia, uploadThumb: false };
}

export interface AnalysisPushInput {
  analysis: Analysis;
  entry: LedgerEntry | undefined;
  userId: string;
}

/**
 * Analyses carry no media. A "pending" analysis is a request still running on
 * this device (or one that died mid-way): it is never pushed; the route
 * handler stores finished analyses itself and the device pushes its copy once
 * it is done or failed.
 */
export function planAnalysisPush({ analysis, entry, userId }: AnalysisPushInput): PushDecision {
  const owner = analysis.ownerId ?? userId;
  if (owner !== userId) return { action: "skip", reason: "foreign" };
  if (analysis.status === "pending") return { action: "none" };
  const metaDirty =
    !entry ||
    entry.fp !== analysisFingerprint(analysis) ||
    DIRTY_STATES.includes(analysis.syncState) ||
    analysis.ownerId === null;
  if (!metaDirty) return { action: "none" };
  return { action: "push", owner, claim: analysis.ownerId === null, uploadMedia: false, uploadThumb: false };
}

/**
 * Items this device previously synced that are gone from the local store.
 * Own rows become remote soft-deletes; others' rows are just forgotten.
 *
 * Safety: if the local store is completely empty while the ledger knows about
 * own items, the store was most likely wiped (Safari storage eviction, a reset),
 * not deleted by the user. Then nothing is deleted remotely and `resetLedger`
 * asks the caller to start over and re-download everything.
 */
export function planLocalDeletes(
  entries: Record<string, LedgerEntry>,
  localIds: ReadonlySet<string>,
  userId: string,
): { remoteDelete: string[]; forget: string[]; resetLedger: boolean } {
  const missing = Object.keys(entries).filter((id) => !localIds.has(id));
  const ownKnown = Object.values(entries).some((e) => e.owner === userId);
  if (localIds.size === 0 && ownKnown && missing.length > 0) {
    return { remoteDelete: [], forget: [], resetLedger: true };
  }
  const remoteDelete: string[] = [];
  const forget: string[] = [];
  for (const id of missing) (entries[id].owner === userId ? remoteDelete : forget).push(id);
  return { remoteDelete, forget, resetLedger: false };
}

/**
 * planLocalDeletes for analyses. An empty analyses store only means "wiped"
 * when the rest of the store is empty too; otherwise the user simply deleted
 * their last analysis, which must become a normal remote delete.
 */
export function planAnalysisLocalDeletes(
  entries: Record<string, LedgerEntry>,
  localIds: ReadonlySet<string>,
  userId: string,
  storeHasOtherData: boolean,
): { remoteDelete: string[]; forget: string[]; resetLedger: boolean } {
  const plan = planLocalDeletes(entries, localIds, userId);
  if (!plan.resetLedger || !storeHasOtherData) return plan;
  const remoteDelete: string[] = [];
  const forget: string[] = [];
  for (const id of Object.keys(entries)) {
    if (!localIds.has(id)) (entries[id].owner === userId ? remoteDelete : forget).push(id);
  }
  return { remoteDelete, forget, resetLedger: false };
}

// ---------------------------------------------------------------------------
// Pull planning
// ---------------------------------------------------------------------------

export type PullAction = "create" | "update" | "delete" | "forget" | "skip";

export function planClipPull(row: ClipRow, local: Clip | undefined, entry: LedgerEntry | undefined): PullAction {
  if (row.deleted_at) return local ? "delete" : "forget";
  if (!local) return entry ? "skip" : "create"; // entry but no local = deleted here; push will tombstone it
  if (entry && entry.rv === row.server_updated_at) return "skip";
  const localDirty = !entry || entry.fp !== clipFingerprint(local) || DIRTY_STATES.includes(local.syncState);
  if (localDirty && local.updatedAt > row.updated_at) return "skip"; // local edit is newer; it will be pushed
  return "update";
}

export function planSnapshotPull(
  row: SnapshotRow,
  local: Snapshot | undefined,
  entry: LedgerEntry | undefined,
): PullAction {
  if (row.deleted_at) return local ? "delete" : "forget";
  if (!local) return entry ? "skip" : "create";
  if (entry && entry.rv === row.server_updated_at) return "skip";
  // Snapshots carry no local updatedAt, so an unpushed local edit wins; it is
  // pushed on the next run (the owner's device is the only writer anyway).
  const localDirty =
    DIRTY_STATES.includes(local.syncState) || (entry !== undefined && entry.fp !== snapshotFingerprint(local));
  return localDirty ? "skip" : "update";
}

export function planAnalysisPull(
  row: AnalysisRow,
  local: Analysis | undefined,
  entry: LedgerEntry | undefined,
): PullAction {
  if (row.deleted_at) return local ? "delete" : "forget";
  if (!local) return entry ? "skip" : "create";
  if (entry && entry.rv === row.server_updated_at) return "skip";
  // The server finished an analysis this device still shows as running
  // (e.g. the app was closed mid-stream): take the server's result.
  if (local.status === "pending" && row.status !== "pending") return "update";
  // Like snapshots: no local updatedAt, so an unpushed local edit wins.
  const localDirty =
    DIRTY_STATES.includes(local.syncState) || (entry !== undefined && entry.fp !== analysisFingerprint(local));
  return localDirty ? "skip" : "update";
}

/** Latest server_updated_at among rows, or the previous cursor. */
export function advanceCursor(cursor: string | null, rows: { server_updated_at: string }[]): string | null {
  let max = cursor;
  for (const r of rows) if (max === null || r.server_updated_at > max) max = r.server_updated_at;
  return max;
}

/**
 * Pull from slightly before the cursor: concurrent transactions can commit
 * out of order relative to their now() stamps. Duplicates are harmless because
 * rows already applied are skipped via ledger.rv.
 */
export function pullSince(cursor: string | null, overlapMs = 60_000): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  return Number.isFinite(t) ? new Date(t - overlapMs).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Download planning
// ---------------------------------------------------------------------------

export interface DownloadNeed {
  id: string;
  kind: ClipKind;
  media: boolean;
  thumb: boolean;
}

export interface LocalBlobPresence {
  media: boolean; // playable or original present
  thumb: boolean;
}

export function planClipDownload(
  clip: Clip,
  have: LocalBlobPresence,
  entry: LedgerEntry | undefined,
): DownloadNeed | null {
  const media = Boolean(clip.remotePath) && (!have.media || (entry?.path ?? null) !== clip.remotePath);
  const thumb = Boolean(clip.remoteThumbPath) && (!have.thumb || (entry?.thumbPath ?? null) !== clip.remoteThumbPath);
  if (!media && !thumb) return null;
  return { id: clip.id, kind: clip.kind, media, thumb };
}

/** Pros first (needed offline at the field), then newest first. */
export function orderDownloads<T extends { kind: ClipKind; updatedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "pro" ? -1 : 1;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function countPending(
  clips: Clip[],
  snapshots: Snapshot[],
  ledger: Ledger,
  userId: string,
  isAdmin: boolean,
  analyses: Analysis[] = [],
): { pending: number; blocked: number } {
  let pending = 0;
  let blocked = 0;
  for (const c of clips) {
    const owner = c.ownerId ?? userId;
    if (owner !== userId) continue;
    if (c.kind === "pro" && !isAdmin) {
      if (c.syncState !== "synced") blocked++;
      continue;
    }
    const e = ledger.clips[c.id];
    if (!e || e.fp !== clipFingerprint(c) || DIRTY_STATES.includes(c.syncState)) pending++;
  }
  for (const s of snapshots) {
    if ((s.ownerId ?? userId) !== userId) continue;
    const e = ledger.snapshots[s.id];
    if (!e || e.fp !== snapshotFingerprint(s) || DIRTY_STATES.includes(s.syncState)) pending++;
  }
  for (const a of analyses) {
    if ((a.ownerId ?? userId) !== userId || a.status === "pending") continue;
    const e = (ledger.analyses ?? {})[a.id];
    if (!e || e.fp !== analysisFingerprint(a) || DIRTY_STATES.includes(a.syncState)) pending++;
  }
  return { pending, blocked };
}

/** Exponential backoff with jitter: 5s, 10s, 20s ... capped at 5 minutes. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 5_000 * 2 ** Math.max(0, Math.min(attempt, 10));
  const capped = Math.min(base, 300_000);
  return Math.round(capped * (0.75 + random() * 0.5));
}
